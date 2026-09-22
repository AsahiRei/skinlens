import type { Notification } from "@/types/schema";
import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { getDatabase } from "./database";

function now() {
  return new Date().toISOString();
}

function swallow(p: PromiseLike<unknown>) {
  Promise.resolve(p).catch(() => {});
}

function rowToNotification(row: {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: number;
  created_at: string;
}): Notification {
  return {
    id: row.id,
    type: row.type as Notification["type"],
    title: row.title,
    message: row.message,
    read: row.read === 1,
    created_at: row.created_at,
  };
}

export async function getNotifications(): Promise<Notification[]> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return [];
  }
  const db = await getDatabase();

  const local = await db.getAllAsync<{
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    read: number;
    created_at: string;
  }>(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`, [
    user.id,
  ]);

  if (local.length > 0) {
    swallow(
      (async () => {
        const { data } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (data && data.length > 0) {
          for (const n of data) {
            await db.runAsync(
              `INSERT OR REPLACE INTO notifications (id, user_id, type, title, message, read, created_at, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                n.id,
                n.user_id,
                n.type,
                n.title,
                n.message,
                n.read ? 1 : 0,
                n.created_at,
                now(),
              ],
            );
          }
        }
      })(),
    );
    return local.map(rowToNotification);
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) return [];

    for (const n of data) {
      await db.runAsync(
        `INSERT OR REPLACE INTO notifications (id, user_id, type, title, message, read, created_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          n.id,
          n.user_id,
          n.type,
          n.title,
          n.message,
          n.read ? 1 : 0,
          n.created_at,
          now(),
        ],
      );
    }
    return data.map((n) => ({
      id: n.id,
      type: n.type as Notification["type"],
      title: n.title,
      message: n.message,
      read: n.read,
      created_at: n.created_at,
    }));
  } catch {
    return [];
  }
}

export async function insertNotification(
  notification: Omit<Notification, "read"> & { read?: boolean },
): Promise<void> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return;
  }
  const db = await getDatabase();
  const isRead = notification.read ? 1 : 0;

  await db.runAsync(
    `INSERT OR REPLACE INTO notifications (id, user_id, type, title, message, read, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      notification.id,
      user.id,
      notification.type,
      notification.title,
      notification.message,
      isRead,
      notification.created_at,
      now(),
    ],
  );
}

export async function markNotificationAsRead(id: string): Promise<void> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return;
  }
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`,
    [id, user.id],
  );
}

export async function markAllNotificationsAsRead(): Promise<void> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return;
  }
  const db = await getDatabase();

  await db.runAsync(`UPDATE notifications SET read = 1 WHERE user_id = ?`, [
    user.id,
  ]);
}

export async function deleteNotification(id: string): Promise<void> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return;
  }
  const db = await getDatabase();

  await db.runAsync(`DELETE FROM notifications WHERE id = ? AND user_id = ?`, [
    id,
    user.id,
  ]);
}

export async function clearAllNotifications(): Promise<void> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return;
  }
  const db = await getDatabase();

  await db.runAsync(`DELETE FROM notifications WHERE user_id = ?`, [user.id]);
}
