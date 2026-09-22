import type { SensitivityEntry } from "@/types/schema";
import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { getDatabase } from "./database";
import { dequeueSync, enqueueSync } from "./sync-queue";

function now() {
  return new Date().toISOString();
}

function swallow(p: PromiseLike<unknown>) {
  Promise.resolve(p).catch(() => {});
}

export async function getSensitivityHistory(): Promise<SensitivityEntry[]> {
  const user = await requireUser();
  const db = await getDatabase();

  const local = await db.getAllAsync<{
    id: number;
    trigger_cause: string;
    severity: string;
    notes: string | null;
    occurred_at: string;
    created_at: string;
  }>(
    `SELECT id, trigger_cause, severity, notes, occurred_at, created_at
     FROM sensitivity_history WHERE user_id = ?
     ORDER BY occurred_at DESC, id DESC`,
    [user.id],
  );

  if (local.length > 0) {
    // Refresh in background if online, without resurrecting locally deleted rows
    swallow(
      (async () => {
        const { data } = await supabase
          .from("sensitivity_history")
          .select("*")
          .eq("user_id", user.id);
        if (!data?.length) return;

        const queue = await dequeueSync();
        const pendingDeletes = new Set(
          queue
            .filter(
              (e) =>
                e.table_name === "sensitivity_history" &&
                e.operation === "delete",
            )
            .map((e) => (e.payload as { id: number }).id),
        );

        for (const row of data) {
          if (pendingDeletes.has(row.id)) continue;
          await db.runAsync(
            `INSERT OR REPLACE INTO sensitivity_history
             (id, user_id, trigger_cause, severity, notes, occurred_at, created_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.id,
              row.user_id,
              row.trigger_cause,
              row.severity,
              row.notes ?? null,
              row.occurred_at,
              row.created_at,
              now(),
            ],
          );
        }
      })(),
    );
    return local;
  }

  try {
    const { data, error } = await supabase
      .from("sensitivity_history")
      .select("*")
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false });
    if (error) throw error;

    for (const row of data) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sensitivity_history
         (id, user_id, trigger_cause, severity, notes, occurred_at, created_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          user.id,
          row.trigger_cause,
          row.severity,
          row.notes ?? null,
          row.occurred_at,
          row.created_at,
          now(),
        ],
      );
    }
    return data.map((row) => ({
      id: row.id,
      trigger_cause: row.trigger_cause,
      severity: row.severity,
      notes: row.notes ?? null,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
    }));
  } catch {
    return [];
  }
}

export async function addSensitivityEntry(input: {
  trigger_cause: string;
  severity: string;
  notes?: string;
}): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();
  const ts = now();

  const result = await db.runAsync(
    `INSERT INTO sensitivity_history (user_id, trigger_cause, severity, notes, occurred_at, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      input.trigger_cause,
      input.severity,
      input.notes?.trim() || null,
      ts,
      ts,
      ts,
    ],
  );

  const payload = {
    id: result.lastInsertRowId,
    user_id: user.id,
    trigger_cause: input.trigger_cause,
    severity: input.severity,
    notes: input.notes?.trim() || null,
    occurred_at: ts,
    created_at: ts,
  };

  await enqueueSync("sensitivity_history", "upsert", String(payload.id), payload);

  try {
    const { error } = await supabase
      .from("sensitivity_history")
      .upsert(payload, { onConflict: "id", ignoreDuplicates: false })
      .single();
    if (error) throw error;
  } catch {
    // Will be retried on next connectivity change
  }
}

export async function deleteSensitivityEntry(id: number): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();

  await db.runAsync(`DELETE FROM sensitivity_history WHERE id = ? AND user_id = ?`, [
    id,
    user.id,
  ]);

  await enqueueSync("sensitivity_history", "delete", String(id), { id });

  try {
    const { error } = await supabase
      .from("sensitivity_history")
      .delete()
      .eq("id", id);
    if (error) throw error;
  } catch {
    // Will be retried on next connectivity change
  }
}
