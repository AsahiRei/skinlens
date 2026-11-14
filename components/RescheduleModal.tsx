import { useMemo, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { CircleAlert } from "lucide-react-native";

import { AppointmentSlotPicker } from "@/components/AppointmentSlotPicker";
import { Notice, UiModal } from "@/components/ui";
import {
  BOOKED_SLOT_MESSAGE,
  HELD_SLOT_MESSAGE,
  OWN_OVERLAP_MESSAGE,
  PAST_TIME_MESSAGE,
  rescheduleRequest,
  type AppointmentRow,
} from "@/lib/db/appointments";
import { findOwnConflict, ownBusyTimes } from "@/utils/booking-slots";

/**
 * Render with `key={row?.id}` so each request opens with a fresh picker.
 *
 * Patient picks a new preferred time for a request whose slot was booked by another visit
 * (needs_reschedule → requested). The slot picker greys out already-booked times before the server
 * re-checks on save.
 */
export function RescheduleModal({
  row,
  clinicName,
  clinicHours,
  ownRows = [],
  onDismiss,
  onDone,
}: {
  /** The bumped request, or null when closed. */
  row: AppointmentRow | null;
  clinicName: string;
  /** Clinic hours text, used to lay out the slot grid. */
  clinicHours?: string | null;
  /** All of the patient's appointments — their other visits block nearby times. */
  ownRows?: AppointmentRow[];
  onDismiss: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { height } = useWindowDimensions();
  const [picked, setPicked] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsRefresh, setSlotsRefresh] = useState(0);
  const ownTimes = useMemo(() => ownBusyTimes(ownRows, new Date(), row?.id), [ownRows, row?.id]);

  const save = async () => {
    if (!row || saving) return;
    if (!picked) {
      setError("Pick an open time first.");
      return;
    }
    setError(null);
    if (picked.getTime() <= Date.now()) {
      setError(PAST_TIME_MESSAGE);
      return;
    }
    if (findOwnConflict(ownRows, row.clinic_id, picked, { excludeId: row.id })) {
      setPicked(null);
      setError(OWN_OVERLAP_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      await rescheduleRequest(row.id, picked.toISOString());
      await onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg === BOOKED_SLOT_MESSAGE ||
        msg === HELD_SLOT_MESSAGE ||
        msg === OWN_OVERLAP_MESSAGE ||
        msg === PAST_TIME_MESSAGE
      ) {
        // The picked slot is dead — clear it and reload the booked times.
        setPicked(null);
        setSlotsRefresh((n) => n + 1);
      }
      setError(msg || "Couldn't save the new time. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const previous = row?.preferred_time ? new Date(row.preferred_time) : null;

  return (
    <UiModal
      visible={row !== null}
      onDismiss={saving ? () => {} : onDismiss}
      title="Pick a new time"
      message={
        previous
          ? `${previous.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })} at ${clinicName} was booked by another patient. Choose another schedule and the clinic will review it.`
          : `Choose another schedule at ${clinicName} and the clinic will review it.`
      }
      actions={[
        {
          label: "Send new time",
          kind: "primary",
          loading: saving,
          onPress: () => void save(),
        },
        { label: "Not now", kind: "ghost", onPress: onDismiss },
      ]}
    >
      {row ? (
        <View className="flex-col gap-3 w-full">
          <ScrollView
            style={{ maxHeight: Math.max(280, height * 0.45) }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <AppointmentSlotPicker
              clinicId={row.clinic_id}
              doctorId={row.doctor_id}
              hoursText={clinicHours}
              value={picked}
              ownTimes={ownTimes}
              refreshKey={slotsRefresh}
              excludeId={row.id}
              onChange={(d) => {
                setPicked(d);
                setError(null);
              }}
            />
          </ScrollView>
          {error ? <Notice icon={CircleAlert} copy={error} /> : null}
        </View>
      ) : null}
    </UiModal>
  );
}
