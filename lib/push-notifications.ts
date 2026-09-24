import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleWeeklyScanReminder() {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  // Cancel existing scan reminders first
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.type === "scan_reminder") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  // Schedule every 7 days at 10:00 AM
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time for your weekly skin scan",
      body: "Keep track of your skin health by running a quick scan today.",
      data: { type: "scan_reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 7 * 24 * 60 * 60, // 7 days
    },
  });
}

export async function scheduleDailySkincareTip() {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  // Cancel existing daily tips first
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.type === "daily_tip") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  // Schedule every day at 8:00 AM
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Daily skincare tip",
      body: "Drink a glass of water before applying skincare to boost absorption.",
      data: { type: "daily_tip" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 24 * 60 * 60, // 24 hours
    },
  });
}

export async function cancelAllScheduledNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
