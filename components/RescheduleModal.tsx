import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { CircleAlert } from "lucide-react-native";

import { AppointmentSlotPicker } from "@/components/AppointmentSlotPicker";
import { Notice, UiModal } from "@/components/ui";
import { PAST_TIME_MESSAGE, rescheduleRequest, type AppointmentRow } from "@/lib/db/appointments";

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
  onDismiss,
  onDone,
}: {
  /** The bumped request, or null when closed. */
  row: AppointmentRow | null;
  clinicName: string;
  /** Clinic hours text, used to lay out the slot grid. */
  clinicHours?: string | null;
  onDismiss: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { height } = useWindowDimensions();
  const [picked, setPicked] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSaving(true);
    try {
      await rescheduleRequest(row.id, picked.toISOString());
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the new time. Try again.");
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
