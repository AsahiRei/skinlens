import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Notification } from "@/types/schema";
import notificationsData from "@/data/notifications.json";
import * as ExpoNotifications from "expo-notifications";

import {
  getClinicAppointments,
  getMyAppointments,
  getMyDoctorProfile,
  resolveAppointmentNames,
  type AppointmentRow,
} from "@/lib/db/appointments";
import { requireUser } from "@/lib/db/auth";
import { insertNotification } from "@/lib/db/notifications";
import { supabase } from "@/utils/supabase";

const SCAN_REMINDERS = notificationsData.scanReminders;

const DAILY_TIPS = notificationsData.dailyTips;

export function generateScanReminder(): Notification | null {
  const today = new Date().toISOString().split("T")[0];
  const index =
    today.split("-").reduce((acc, v) => acc + parseInt(v, 10), 0) % SCAN_REMINDERS.length;
  const { title, message } = SCAN_REMINDERS[index];

  return {
    id: `scan-${today}`,
    type: "scan_reminder",
    title,
    message,
    read: false,
    created_at: new Date().toISOString(),
  };
}

export function generateDailyTip(): Notification | null {
  const today = new Date().toISOString().split("T")[0];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const index = dayOfYear % DAILY_TIPS.length;
  const { title, message } = DAILY_TIPS[index];

  return {
    id: `tip-${today}`,
    type: "daily_tip",
    title,
    message,
    read: false,
    created_at: new Date().toISOString(),
  };
}

/* ---------- Doctor replies on appointment requests ---------- */

// Per-appointment status snapshot (AsyncStorage).
const APPT_REPLY_ACKS_KEY = "appointment_reply_acks";

const REPLIED_STATUSES = ["scheduled", "declined", "completed", "needs_reschedule"] as const;

function replyCopy(
  r: AppointmentRow,
  doctorName: string,
  fmtWhen: (iso: string) => string,
): Notification {
  const nowIso = new Date().toISOString();
  switch (r.status) {
    case "scheduled": {
      const when = r.scheduled_at ? fmtWhen(r.scheduled_at) : "a confirmed time";
      return {
        id: `apptrepl-${r.id}-scheduled`,
        type: "appointment_reply",
        title: "Visit confirmed",
        message: `${doctorName} scheduled your visit for ${when}.`,
        read: false,
        created_at: nowIso,
      };
    }
    case "needs_reschedule": {
      const when = r.preferred_time ? fmtWhen(r.preferred_time) : "the time you asked for";
      return {
        // Keyed by the requested time: a second bump (after picking a new time) is a new notice.
        id: `apptrepl-${r.id}-bumped-${r.preferred_time ?? ""}`,
        type: "appointment_reply",
        title: "Pick a new time",
        message: `${when} was just booked by another patient. Open My Appointments to choose another schedule.`,
        read: false,
        created_at: nowIso,
      };
    }
    case "declined":
      return {
        id: `apptrepl-${r.id}-declined`,
        type: "appointment_reply",
        title: "Request declined",
        message: `${doctorName} declined your visit request. Book another clinic from the map.`,
        read: false,
        created_at: nowIso,
      };
    default:
      return {
        id: `apptrepl-${r.id}-completed`,
        type: "appointment_reply",
        title: "Visit completed",
        message: `${doctorName} marked your visit as complete.`,
        read: false,
        created_at: nowIso,
      };
  }
}

/**
 * Detects appointment status changes the doctor made on their device (schedule / decline /
 * complete) and turns each into a local notification for the patient. No push infrastructure — this
 * runs on the patient's own device whenever the app loads or the user refreshes notifications.
 */
export async function syncAppointmentReplies(): Promise<Notification[]> {
  let rows: AppointmentRow[] = [];
  try {
    rows = await getMyAppointments();
  } catch {
    return [];
  }
  if (rows.length === 0) return [];

  const latest: Record<string, string> = {};
  const feedsReply = new Set<string>();
  for (const r of rows) {
    latest[r.id] = r.status;
    if ((REPLIED_STATUSES as readonly string[]).includes(r.status)) {
      feedsReply.add(r.id);
    }
  }

  let acks: Record<string, string> | null = null;
  let stored = "";
  try {
    stored = (await AsyncStorage.getItem(APPT_REPLY_ACKS_KEY)) ?? "";
    acks = stored ? (JSON.parse(stored) as Record<string, string>) : null;
  } catch {
    acks = null;
  }

  // First run on this device only saves the baseline — no flood of old events.
  const changed = acks
    ? rows.filter(
        (r) => (acks as Record<string, string>)[r.id] !== r.status && feedsReply.has(r.id),
      )
    : [];
  try {
    await AsyncStorage.setItem(APPT_REPLY_ACKS_KEY, JSON.stringify(latest));
  } catch {
    /* ack storage is best-effort — dupes are still blocked by stable ids */
  }

  if (changed.length === 0) return [];

  // Doctor display names for the copy (fallback: "The clinic").
  const doctorIds = [...new Set(changed.map((r) => r.doctor_id).filter((v): v is string => !!v))];
  const doctorNames: Record<string, string> = {};
  if (doctorIds.length > 0) {
    try {
      const { data } = await supabase
        .from("doctors")
        .select("user_id, display_name")
        .in("user_id", doctorIds);
      for (const d of (data ?? []) as {
        user_id: string;
        display_name: string;
      }[]) {
        doctorNames[d.user_id] = d.display_name || "The clinic";
      }
    } catch {
      /* best-effort naming */
    }
  }

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const fresh = changed.map((r) =>
    replyCopy(r, (r.doctor_id && doctorNames[r.doctor_id]) || "The clinic", fmtWhen),
  );
  for (const n of fresh) {
    await insertNotification(n);
  }
  return fresh;
}

/* ---------- New booking requests (doctor side) ---------- */

// Appointment ids this device has already turned into a notification, per doctor account.
const DOCTOR_REQUEST_SEEN_KEY = "doctor_request_seen";

/** Seen-set entry: the original request keeps its bare id; a re-picked time adds `@<time>`. */
function requestSeenKey(r: AppointmentRow): string {
  return r.preferred_time ? `${r.id}@${r.preferred_time}` : r.id;
}

/** Request-notification ids are `apptreq-<appointmentId>`. */
export function doctorRequestNotificationId(appointmentId: string): string {
  return `apptreq-${appointmentId}`;
}

async function showSystemBanner(title: string, body: string): Promise<void> {
  try {
    const { status } = await ExpoNotifications.getPermissionsAsync();
    if (status !== "granted") return;
    await ExpoNotifications.scheduleNotificationAsync({
      content: { title, body, data: { type: "appointment_request" } },
      trigger: null,
    });
  } catch {
    /* banner is best-effort — the in-app notification is the record */
  }
}

/**
 * Detects new patient booking requests for the signed-in doctor (rows at their clinic that are
 * still "requested" and either unassigned or addressed to them) and turns each into a local
 * notification.
 */
let doctorSyncInFlight: Promise<Notification[]> | null = null;

/**
 * `notify: false` (doctor turned the switch off) still records the requests as
 * seen, so switching it back on doesn't dump everything missed meanwhile.
 */
export function syncDoctorAppointmentRequests(
  opts: { notify?: boolean } = {},
): Promise<Notification[]> {
  const notify = opts.notify ?? true;
  // Mount + focus + pull-to-refresh can overlap; share one run so the seen
  // set is read once and a banner never fires twice.
  if (!doctorSyncInFlight) {
    doctorSyncInFlight = runDoctorRequestSync(notify).finally(() => {
      doctorSyncInFlight = null;
    });
  }
  return doctorSyncInFlight;
}

async function runDoctorRequestSync(notify: boolean): Promise<Notification[]> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return [];
  }
  const doctor = await getMyDoctorProfile().catch(() => null);
  if (!doctor) return [];

  let rows: AppointmentRow[];
  try {
    rows = await getClinicAppointments(doctor.clinicId);
  } catch {
    return [];
  }

  const pending = rows.filter(
    (r) => r.status === "requested" && (!r.doctor_id || r.doctor_id === userId),
  );

  const storageKey = `${DOCTOR_REQUEST_SEEN_KEY}:${userId}`;
  let seen: Set<string> | null = null;
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    seen = stored ? new Set(JSON.parse(stored) as string[]) : null;
  } catch {
    seen = null;
  }
  const firstRun = seen === null;
  // A request that was bumped (slot taken) and re-sent with a new time counts as new again.
  const isSeen = (r: AppointmentRow): boolean => {
    if (!seen) return false;
    if (seen.has(requestSeenKey(r))) return true;
    if (!seen.has(r.id)) return false;
    // Seen-lists saved before time-keys existed hold only bare ids: treat those as seen.
    const prefix = `${r.id}@`;
    return ![...seen].some((key) => key.startsWith(prefix));
  };
  const fresh = pending.filter((r) => !isSeen(r));
  const repicked = new Set(fresh.filter((r) => seen?.has(r.id)).map((r) => r.id));

  // Remember every row still in the window so ids never fire twice (bare id = "notified once",
  // id@time = "notified for this time").
  const visibleIds = new Set(rows.map((r) => r.id));
  const nextSeen = [
    ...new Set([
      ...[...(seen ?? [])].filter((key) => visibleIds.has(key.split("@")[0])),
      ...pending.flatMap((r) => [r.id, requestSeenKey(r)]),
    ]),
  ];
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(nextSeen));
  } catch {
    /* best-effort */
  }

  if (fresh.length === 0 || !notify) return [];

  let patientNames: Record<string, string> = {};
  try {
    patientNames = (await resolveAppointmentNames(fresh)).patientNames;
  } catch {
    /* fall back to the booking snapshot / "A patient" */
  }

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const created: Notification[] = fresh.map((r) => {
    const name =
      patientNames[r.patient_id] && patientNames[r.patient_id] !== "Patient"
        ? patientNames[r.patient_id]
        : (r.patient_name ?? "").trim() || "A patient";
    const when = r.preferred_time ? ` for ${fmtWhen(r.preferred_time)}` : "";
    const directed = r.doctor_id === userId;
    if (repicked.has(r.id)) {
      return {
        id: doctorRequestNotificationId(r.id),
        type: "appointment_request",
        title: "New time requested",
        message: `${name} picked a new time${when} after their first choice was booked.`,
        read: false,
        created_at: new Date().toISOString(),
      };
    }
    return {
      id: doctorRequestNotificationId(r.id),
      type: "appointment_request",
      title: "New appointment request",
      message: `${name} requested a visit${directed ? " with you" : ` at ${doctor.clinicName}`}${when}.`,
      read: false,
      created_at: r.created_at || new Date().toISOString(),
    };
  });

  for (const n of created) {
    await insertNotification(n);
  }

  if (!firstRun) {
    if (created.length === 1) {
      await showSystemBanner(created[0].title, created[0].message);
    } else {
      await showSystemBanner(
        `${created.length} new appointment requests`,
        "Open SkinLens to review them.",
      );
    }
  }
  return created;
}
