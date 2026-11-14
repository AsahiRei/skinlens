import { useCallback, useEffect, useState } from "react";
import { ToastAndroid } from "react-native";

import { useDoctorQueue } from "@/hooks/useDoctorQueue";
import {
  patientAvatarFor,
  patientDisplayFor,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/db/appointments";

/** Modal title for a failed action, matched to the server's message. */
function errorTitleFor(message: string): string {
  if (/within 30 minutes|already booked/i.test(message)) return "Time not available";
  if (/already passed/i.test(message)) return "That time has passed";
  if (/marked done from/i.test(message)) return "Too early to mark as done";
  if (/already closed/i.test(message)) return "Appointment already closed";
  if (/another doctor/i.test(message)) return "Not your request";
  return "Couldn't save that change";
}

/** Ticking clock (default once a minute) for countdowns — keeps render pure. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The doctor tabs' shared state: the clinic queue plus one action handler (toasts on success, an
 * error dialog on failure) and the props every DoctorAppointmentCard needs.
 */
export function useDoctorBoard() {
  const queue = useDoctorQueue();
  const { rows, applyStatus, refresh, doctor, colleagues, patientNames, patientAvatars } = queue;
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = useCallback(
    async (id: string, status: AppointmentStatus, scheduledAt?: string) => {
      setActionError(null);
      const wasScheduled = rows.find((r) => r.id === id)?.status === "scheduled";
      try {
        await applyStatus(id, status, scheduledAt);
        const label =
          status === "scheduled"
            ? wasScheduled
              ? "Visit moved"
              : "Visit scheduled"
            : status === "completed"
              ? "Visit marked done"
              : status === "declined"
                ? "Request declined"
                : status === "cancelled"
                  ? "Visit cancelled"
                  : "Status updated";
        ToastAndroid.show(label, ToastAndroid.SHORT);
      } catch (err) {
        console.error("[doctor] action failed:", err);
        if (status === "scheduled") {
          // The booking sheet shows this inline; reload so its booked times catch up.
          void refresh();
        } else {
          setActionError(
            err instanceof Error ? err.message : "Couldn't save that change — try again.",
          );
        }
        throw err; // the card keeps its scheduler open
      }
    },
    [rows, applyStatus, refresh],
  );

  const cardProps = useCallback(
    (a: AppointmentRow) => ({
      appointment: a,
      patientName: patientDisplayFor(a, patientNames),
      patientAvatarUrl: patientAvatarFor(a, patientAvatars),
      assignedToOther:
        a.doctor_id && a.doctor_id !== doctor?.userId ? (colleagues[a.doctor_id] ?? null) : null,
      doctorId: doctor?.userId ?? null,
      clinicHours: doctor?.clinicHours ?? null,
      clinicRows: rows,
      onAction: handleAction,
    }),
    [patientNames, patientAvatars, doctor, colleagues, rows, handleAction],
  );

  return {
    ...queue,
    handleAction,
    cardProps,
    actionError,
    actionErrorTitle: actionError ? errorTitleFor(actionError) : "",
    dismissActionError: () => setActionError(null),
  };
}
