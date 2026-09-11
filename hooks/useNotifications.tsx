import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Notification, NotificationSettings } from "@/types/schema";
import { generateScanReminder, generateDailyTip } from "@/lib/notifications";
import {
  scheduleWeeklyScanReminder,
  scheduleDailySkincareTip,
  cancelAllScheduledNotifications,
} from "@/lib/push-notifications";
import {
  getNotifications,
  insertNotification,
  markNotificationAsRead as dbMarkAsRead,
  markAllNotificationsAsRead as dbMarkAllAsRead,
  deleteNotification as dbDeleteNotification,
  clearAllNotifications as dbClearAll,
} from "@/lib/db/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIFICATION_SETTINGS_KEY = "notification_settings";

type NotificationContextType = {
  settings: NotificationSettings;
  notifications: Notification[];
  unreadCount: number;
  updateSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  generateNotifications: () => Promise<void>;
};

const defaultSettings: NotificationSettings = {
  scanReminders: true,
  dailyTips: false,
};

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const settingsStr = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (settingsStr) {
        const loaded = JSON.parse(settingsStr);
        setSettings(loaded);
        // Schedule push notifications based on saved settings
        if (loaded.scanReminders) await scheduleWeeklyScanReminder();
        if (loaded.dailyTips) await scheduleDailySkincareTip();
      }

      const remoteNotifications = await getNotifications();
      setNotifications(remoteNotifications);
    } catch (err) {
      console.error("Error loading notifications:", err);
    } finally {
      setLoaded(true);
    }
  };

  const updateSettings = useCallback(
    async (partial: Partial<NotificationSettings>) => {
      const next = { ...settings, ...partial };
      setSettings(next);
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(next));

      // Schedule or cancel push notifications based on new settings
      if (partial.scanReminders !== undefined) {
        if (partial.scanReminders) {
          await scheduleWeeklyScanReminder();
        }
      }
      if (partial.dailyTips !== undefined) {
        if (partial.dailyTips) {
          await scheduleDailySkincareTip();
        }
      }
    },
    [settings],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      await dbMarkAsRead(id);
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await dbMarkAllAsRead();
  }, []);

  const deleteNotification = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      await dbDeleteNotification(id);
    },
    [],
  );

  const clearAll = useCallback(async () => {
    setNotifications([]);
    await dbClearAll();
  }, []);

  const generateNotifications = useCallback(async () => {
    const newNotifications: Notification[] = [];

    if (settings.scanReminders) {
      const reminder = generateScanReminder();
      if (reminder) newNotifications.push(reminder);
    }

    if (settings.dailyTips) {
      const tip = generateDailyTip();
      if (tip) newNotifications.push(tip);
    }

    if (newNotifications.length > 0) {
      const existingIds = new Set(notifications.map((n) => n.id));
      const deduped = newNotifications.filter((n) => !existingIds.has(n.id));
      for (const n of deduped) {
        await insertNotification(n);
      }
      setNotifications((prev) => [...deduped, ...prev].slice(0, 50));
    }
  }, [settings, notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        settings,
        notifications,
        unreadCount,
        updateSettings,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        generateNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
