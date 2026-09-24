import type { Notification } from "@/types/schema";
import notificationsData from "@/data/notifications.json";

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
