import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Notification } from "@/types/schema";
import notificationsData from "@/data/notifications.json";
import {
  getMyAppointments,
  type AppointmentRow,
} from "@/lib/db/appointments";
import { insertNotification } from "@/lib/db/notifications";
import { supabase } from "@/utils/supabase";

const SCAN_REMINDERS = notificationsData.scanReminders;

const DAILY_TIPS = notificationsData.dailyTips;

export function generateScanReminder(): Notification | null {
  const today = new Date().toISOString().split("T")[0];
  const index = today.split("-").reduce((acc, v) => acc + parseInt(v, 10), 0) % SCAN_REMINDERS.length;
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

// Per-appointment status snapshot (AsyncStorage). A row's notification fires
// when its status changes between two checks — the snapshot is only in this
// device's local DB, so each device counts its own first run as a baseline.
const APPT_REPLY_ACKS_KEY = "appointment_reply_acks";

const REPLIED_STATUSES = ["scheduled", "declined", "completed"] as const;

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
 * Detects appointment status changes the doctor made on their device
 * (schedule / decline / complete) and turns each into a local notification
 * for the patient. No push infrastructure — this runs on the patient's own
 * device whenever the app loads or the user refreshes notifications.
 *
 * Returns only the freshly-created notifications (already inserted into the
 * local DB with deterministic ids, so a second run never duplicates).
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
  const doctorIds = [
    ...new Set(changed.map((r) => r.doctor_id).filter((v): v is string => !!v)),
  ];
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
