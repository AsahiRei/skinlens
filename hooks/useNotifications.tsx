import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Notification, NotificationSettings } from "@/types/schema";
import { generateScanReminder, generateDailyTip, syncAppointmentReplies } from "@/lib/notifications";
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
  refresh: () => Promise<void>;
};

const defaultSettings: NotificationSettings = {
  scanReminders: true,
  dailyTips: false,
};

function dedupeById(list: Notification[]): Notification[] {
  return Array.from(new Map(list.map((n) => [n.id, n])).values());
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Guards concurrent generateNotifications() calls (home focus + pull to
  // refresh can overlap). Without this, two calls with the same stale
  // `notifications` closure both think the id is new and both prepend it,
  // producing duplicate keys like `scan-2026-10-13`.
  const generatingRef = React.useRef(false);
  // Latest settings as seen by the mutation callbacks below (they are
  // useCallback([]) so they can't close over the state without going stale).
  const settingsRef = React.useRef(settings);
  // Serializes cancel/reschedule: two rapid toggles used to interleave and
  // could leave a reminder scheduled for a feature just switched off.
  const settingsChainRef = React.useRef<Promise<void>>(Promise.resolve());

  const loadAll = async () => {
    try {
      const settingsStr = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (settingsStr) {
        const saved = JSON.parse(settingsStr);
        settingsRef.current = saved;
        setSettings(saved);
        // Schedule push notifications based on saved settings
        if (saved.scanReminders) await scheduleWeeklyScanReminder();
        if (saved.dailyTips) await scheduleDailySkincareTip();
      }

      // Doctor replies (schedule / decline / complete) show up here — checked
      // against each new notification fetch so the badge updates on open.
      try {
        await syncAppointmentReplies();
      } catch (err) {
        console.warn("[notifications] appointment replies check failed:", err);
      }

      const remoteNotifications = await getNotifications();
      setNotifications(dedupeById(remoteNotifications));
    } catch (err) {
      console.error("Error loading notifications:", err);
    }
  };

  // Re-reads the truth from SQLite — the rollback path for the optimistic
  // mutations below when their write fails.
  const reloadFromDb = async () => {
    try {
      setNotifications(dedupeById(await getNotifications()));
    } catch (err) {
      console.error("Error reloading notifications:", err);
    }
  };

  useEffect(() => {
    // Fetch-on-mount: setState happens in async continuations after awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<NotificationSettings>) => {
      // Read from the ref (not the useCallback closure) so two toggles in
      // quick succession both see the result of the first one.
      const next = { ...settingsRef.current, ...partial };
      settingsRef.current = next;
      setSettings(next);

      const apply = async () => {
        await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(next));
        // Apply the new schedule: cancel everything first so toggles that are
        // switched off stop firing, then re-schedule what is still enabled.
        await cancelAllScheduledNotifications();
        if (next.scanReminders) {
          await scheduleWeeklyScanReminder();
        }
        if (next.dailyTips) {
          await scheduleDailySkincareTip();
        }
      };
      const run = settingsChainRef.current.then(apply, apply);
      settingsChainRef.current = run.catch(() => {});
      await run;
    },
    [],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      try {
        await dbMarkAsRead(id);
      } catch (err) {
        // Optimistic only — without this the item stayed visibly read while
        // the row was unchanged, so it "un-read itself" on the next reload.
        console.error("[notifications] markAsRead failed:", err);
        await reloadFromDb();
      }
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await dbMarkAllAsRead();
    } catch (err) {
      console.error("[notifications] markAllAsRead failed:", err);
      await reloadFromDb();
    }
  }, []);

  const deleteNotification = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        await dbDeleteNotification(id);
      } catch (err) {
        console.error("[notifications] delete failed:", err);
        await reloadFromDb();
      }
    },
    [],
  );

  const clearAll = useCallback(async () => {
    setNotifications([]);
    try {
      await dbClearAll();
    } catch (err) {
      console.error("[notifications] clearAll failed:", err);
      await reloadFromDb();
    }
  }, []);

  const generateNotifications = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    try {
      const newNotifications: Notification[] = [];

      if (settings.scanReminders) {
        const reminder = generateScanReminder();
        if (reminder) newNotifications.push(reminder);
      }

      if (settings.dailyTips) {
        const tip = generateDailyTip();
        if (tip) newNotifications.push(tip);
      }

      if (newNotifications.length === 0) return;

      // De-dupe against the ids already in state (stale-closure safe: the
      // final prepend below filters against `prev` again).
      const existingIds = new Set(notifications.map((n) => n.id));
      const candidates = newNotifications.filter((n) => !existingIds.has(n.id));
      if (candidates.length === 0) return;

      for (const n of candidates) {
        await insertNotification(n);
      }
      setNotifications((prev) => {
        const prevIds = new Set(prev.map((n) => n.id));
        const fresh = candidates.filter((n) => !prevIds.has(n.id));
        if (fresh.length === 0) return prev;
        return [...fresh, ...prev].slice(0, 50);
      });
    } finally {
      generatingRef.current = false;
    }
  }, [settings, notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const refresh = useCallback(async () => {
    try {
      await syncAppointmentReplies();
      setNotifications(dedupeById(await getNotifications()));
    } catch (err) {
      console.error("Error refreshing notifications:", err);
    }
  }, []);

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
        refresh,
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
