import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect, useRouter } from "expo-router";

import {
  getClinicAppointments,
  getDoctorsForClinic,
  getMyDoctorProfile,
  isPendingStatus,
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

/* Pending-request count shared with the tab bar badge (set by whichever tab loaded last). */
let pendingCount = 0;
const pendingListeners = new Set<() => void>();
function setPendingCount(n: number) {
  if (n === pendingCount) return;
  pendingCount = n;
  pendingListeners.forEach((l) => l());
}
export function usePendingRequestCount(): number {
  return useSyncExternalStore(
    (l) => {
      pendingListeners.add(l);
      return () => pendingListeners.delete(l);
    },
    () => pendingCount,
  );
}

/** Shared queue state for the doctor tabs. */
export function useDoctorQueue() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [patientAvatars, setPatientAvatars] = useState<Record<string, string>>({});
  /** Other ACTIVE doctors at the clinic (user_id → display name). A request addressed to one of
   * them is theirs to schedule. */
  const [colleagues, setColleagues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Focus, pull-to-refresh and applyStatus all call load() concurrently with no ordering — a slow
  // earlier response used to overwrite fresher rows.
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
    const isStale = () => requestIdRef.current !== requestId || !mountedRef.current;
    setError(null);
    try {
      const prof = await getMyDoctorProfile();
      if (isStale()) return;
      if (!prof) {
        router.replace("/doctor/profile" as never);
        return;
      }
      setDoctor(prof);
      const [appts, team] = await Promise.all([
        getClinicAppointments(prof.clinicId),
        getDoctorsForClinic(prof.clinicId).catch(() => null),
      ]);
      if (isStale()) return;
      setRows(appts);
      setPendingCount(appts.filter((r) => isPendingStatus(r.status)).length);
      if (team) {
        setColleagues(
          Object.fromEntries(
            team
              .filter((d) => d.user_id !== prof.userId)
              .map((d) => [d.user_id, d.display_name || "another doctor"]),
          ),
        );
      }
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
      fresh: rows.filter((r) => isPendingStatus(r.status)).length,
      scheduled: rows.filter((r) => r.status === "scheduled").length,
      today: rows.filter((r) => r.status === "scheduled" && isToday(r.scheduled_at)).length,
    };
  }, [rows]);

  return {
    doctor,
    rows,
    patientNames,
    patientAvatars,
    colleagues,
    loading,
    refreshing,
    error,
    counts,
    refresh,
    applyStatus,
  };
}
