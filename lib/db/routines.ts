import type { Period, Routine } from "@/types/schema";
import { getTodayStr } from "@/utils/date";
import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { getDatabase } from "./database";
import { enqueueSync } from "./sync-queue";

function now() {
  return new Date().toISOString();
}

function swallow(p: PromiseLike<unknown>) {
  Promise.resolve(p).catch(() => {});
}

export async function getLatestRoutine(): Promise<{
  id: number;
  routine: Routine;
} | null> {
  const user = await requireUser();
  const db = await getDatabase();

  const local = await db.getFirstAsync<{
    id: number;
    user_id: string;
    routine_json: string;
  }>(
    `SELECT id, user_id, routine_json FROM routines WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [user.id],
  );

  if (local) {
    // Refresh in background
    swallow(
      (async () => {
        const { data } = await supabase
          .from("routines")
          .select("id, routine_json")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.routine_json) {
          await db.runAsync(
            `INSERT OR REPLACE INTO routines (id, user_id, source_type, routine_json, created_at, synced_at)
             VALUES (?, ?, 'ai_generated', ?, ?, ?)`,
            [data.id, user.id, data.routine_json, now(), now()],
          );
        }
      })(),
    );
    return { id: local.id, routine: JSON.parse(local.routine_json) };
  }

  try {
    const { data, error } = await supabase
      .from("routines")
      .select("id, routine_json")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.routine_json) return null;

    await db.runAsync(
      `INSERT OR REPLACE INTO routines (id, user_id, source_type, routine_json, created_at, synced_at)
       VALUES (?, ?, 'ai_generated', ?, ?, ?)`,
      [data.id, user.id, data.routine_json, now(), now()],
    );
    return { id: data.id, routine: JSON.parse(data.routine_json) };
  } catch {
    return null;
  }
}

export async function insertRoutine(routineJson: string): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();

  // Try server first to get the real id
  let serverId: number | null = null;
  try {
    const { data, error } = await supabase
      .from("routines")
      .insert({
        user_id: user.id,
        source_type: "ai_generated",
        routine_json: routineJson,
      })
      .select("id")
      .single();
    if (error) throw error;
    serverId = data.id;
  } catch {
    // Offline — generate a temp negative id
    const maxRow = await db.getFirstAsync<{ max_id: number | null }>(
      `SELECT MAX(id) as max_id FROM routines WHERE user_id = ?`,
      [user.id],
    );
    serverId = Math.min((maxRow?.max_id ?? 0), 0) - 1;
    await enqueueSync("routines", "insert", String(serverId), {
      user_id: user.id,
      source_type: "ai_generated",
      routine_json: routineJson,
    });
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO routines (id, user_id, source_type, routine_json, created_at, synced_at)
     VALUES (?, ?, 'ai_generated', ?, ?, ?)`,
    [serverId!, user.id, routineJson, now(), now()],
  );
}

export async function getTodayProgress(
  routineId: number,
): Promise<Set<string>> {
  const user = await requireUser();
  const db = await getDatabase();
  const todayStr = getTodayStr();

  const local = await db.getAllAsync<{
    period: string;
    step: number;
  }>(
    `SELECT period, step FROM routine_progress WHERE user_id = ? AND routine_id = ? AND completed_date = ?`,
    [user.id, routineId, todayStr],
  );

  if (local.length === 0) {
    // No local progress — fetch from server and cache it
    swallow(
      (async () => {
        const { data } = await supabase
          .from("routine_progress")
          .select("period, step")
          .eq("user_id", user.id)
          .eq("routine_id", routineId)
          .eq("completed_date", todayStr);
        if (data) {
          for (const row of data) {
            await db.runAsync(
              `INSERT OR REPLACE INTO routine_progress (user_id, routine_id, period, step, completed_date, synced_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [user.id, routineId, row.period, row.step, todayStr, now()],
            );
          }
        }
      })(),
    );
  }

  return new Set(local.map((r) => `${r.period}-${r.step}`));
}

export async function toggleStep(
  routineId: number,
  period: Period,
  step: number,
  isCurrentlyDone: boolean,
): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();
  const todayStr = getTodayStr();
  const key = `${period}-${step}`;

  if (isCurrentlyDone) {
    // Optimistic: remove from local
    await db.runAsync(
      `DELETE FROM routine_progress WHERE user_id = ? AND routine_id = ? AND period = ? AND step = ? AND completed_date = ?`,
      [user.id, routineId, period, step, todayStr],
    );

    await enqueueSync("routine_progress", "delete", key, {
      user_id: user.id,
      routine_id: routineId,
      period,
      step,
      completed_date: todayStr,
    });

    try {
      const { error } = await supabase
        .from("routine_progress")
        .delete()
        .eq("user_id", user.id)
        .eq("routine_id", routineId)
        .eq("period", period)
        .eq("step", step)
        .eq("completed_date", todayStr);
      if (error) throw error;
    } catch {
      // Will be retried
    }
  } else {
    // Optimistic: add to local
    await db.runAsync(
      `INSERT OR REPLACE INTO routine_progress (user_id, routine_id, period, step, completed_date, synced_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, routineId, period, step, todayStr, now()],
    );

    await enqueueSync("routine_progress", "upsert", key, {
      user_id: user.id,
      routine_id: routineId,
      period,
      step,
      completed_date: todayStr,
    });

    try {
      const { error } = await supabase.from("routine_progress").upsert(
        {
          user_id: user.id,
          routine_id: routineId,
          period,
          step,
          completed_date: todayStr,
        },
        { onConflict: "user_id,routine_id,period,step,completed_date" },
      );
      if (error) throw error;
    } catch {
      // Will be retried
    }
  }
}
