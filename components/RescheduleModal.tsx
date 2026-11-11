import { useEffect, useState } from "react";
import { View } from "react-native";
import { CircleAlert } from "lucide-react-native";

import { Text } from "@/components/Text";
import { DateTimeField } from "@/components/DateTimeField";
import { Notice, UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  BOOKED_SLOT_MESSAGE,
  PAST_TIME_MESSAGE,
  getTakenSlots,
  overlapsTakenSlot,
  rescheduleRequest,
  type AppointmentRow,
} from "@/lib/db/appointments";

const FALLBACK = new Date(Date.now() + 24 * 60 * 60 * 1000);

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayBounds(d: Date): [Date, Date] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return [start, end];
}

/**
 * Render with `key={row?.id}` so each request opens with a fresh picker.
 *
 * Patient picks a new preferred time for a request whose slot was booked by another visit
 * (needs_reschedule → requested). Shows the day's already-booked times and blocks them before the
 * server does.
 */
export function RescheduleModal({
  row,
  clinicName,
  onDismiss,
  onDone,
}: {
  /** The bumped request, or null when closed. */
  row: AppointmentRow | null;
  clinicName: string;
  onDismiss: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<Date | null>(null);
  const [taken, setTaken] = useState<Date[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State resets per request because the parent keys this component by row id.
  const rowId = row?.id ?? null;

  // Booked times on the picked day (for this doctor, or every doctor when unassigned).
  const dayKey = picked ? picked.toDateString() : null;
  useEffect(() => {
    if (!row || !picked) return;
    let cancelled = false;
    const [from, to] = dayBounds(picked);
    getTakenSlots(row.clinic_id, row.doctor_id, from, to)
      .then((slots) => {
        if (!cancelled) setTaken(slots);
      })
      .catch(() => {
        if (!cancelled) setTaken([]); // the server still blocks a taken slot on save
      });
    return () => {
      cancelled = true;
    };
    // Only refetch when the row or the picked DAY changes, not every minute tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, dayKey]);

  const clash = picked ? overlapsTakenSlot(picked, taken) : false;

  const save = async () => {
    if (!row || !picked || saving) return;
    setError(null);
    if (picked.getTime() <= Date.now()) {
      setError(PAST_TIME_MESSAGE);
      return;
    }
    if (clash) {
      setError(BOOKED_SLOT_MESSAGE);
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
      <View className="flex-col gap-2 w-full">
        <DateTimeField
          value={picked}
          onChange={(d) => {
            setPicked(d);
            setError(null);
          }}
          placeholder="Pick a new date & time"
          minimumDate={new Date()}
          fallbackDate={FALLBACK}
        />
        {picked && taken.length > 0 ? (
          <Text className="text-xs" style={{ color: theme.colors.muted }}>
            Already booked that day: {taken.map(fmtTime).join(", ")}
          </Text>
        ) : null}
        {error || clash ? <Notice icon={CircleAlert} copy={error ?? BOOKED_SLOT_MESSAGE} /> : null}
      </View>
    </UiModal>
  );
}
