import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";

import {
  getClinicAppointments,
  getMyDoctorProfile,
  resolveAppointmentNames,
  updateAppointment,
  type AppointmentRow,
  type AppointmentStatus,
  type DoctorProfile,
} from "@/lib/db/appointments";

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Shared queue state for the doctor tabs (Home + Schedule).
 * Loads the doctor's clinic queue, resolves patient names, and exposes
 * a status-change helper that reloads afterwards. Redirects unlinked
 * doctors to the Account tab, which owns the link flow.
 */
export function useDoctorQueue() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [patientAvatars, setPatientAvatars] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Focus, pull-to-refresh and applyStatus all call load() concurrently with
  // no ordering — a slow earlier response used to overwrite fresher rows.
  // Each call takes a ticket; anything but the newest is dropped. The mounted
  // flag stops a response that lands after the hook is gone from redirecting.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current++; // invalidate anything in flight
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () =>
      requestIdRef.current !== requestId || !mountedRef.current;
    setError(null);
    try {
      const prof = await getMyDoctorProfile();
      if (isStale()) return;
      if (!prof) {
        router.replace("/doctor/profile" as never);
        return;
      }
      setDoctor(prof);
      const appts = await getClinicAppointments(prof.clinicId);
      if (isStale()) return;
      setRows(appts);
      const names = await resolveAppointmentNames(appts);
      if (isStale()) return;
      setPatientNames(names.patientNames);
      setPatientAvatars(names.patientAvatars);
    } catch (err) {
      if (isStale()) return;
      console.error("[doctor] queue load failed:", err);
      setError(err instanceof Error ? err.message : "Couldn't load schedule.");
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const applyStatus = useCallback(
    async (id: string, status: AppointmentStatus, scheduledAt?: string) => {
      await updateAppointment(id, {
        status,
        scheduledAt,
        claimAsDoctor: status === "scheduled",
      });
      await load();
    },
    [load],
  );

  const counts = useMemo(() => {
    return {
      fresh: rows.filter((r) => r.status === "requested").length,
      scheduled: rows.filter((r) => r.status === "scheduled").length,
      today: rows.filter(
        (r) => r.status === "scheduled" && isToday(r.scheduled_at),
      ).length,
    };
  }, [rows]);

  return {
    doctor,
    rows,
    patientNames,
    patientAvatars,
    loading,
    refreshing,
    error,
    counts,
    refresh,
    applyStatus,
  };
}
