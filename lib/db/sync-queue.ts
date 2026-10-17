import { getDatabase } from "./database";

export type SyncOperation = "upsert" | "insert" | "delete" | "update";

/**
 * Queues a write for the next sync pass and returns the queue row id, so a
 * caller that ALSO pushes the same row to Supabase inline can drop the
 * entry again — otherwise the queue replays it and the server ends up with
 * a duplicate (sensitivity_history, profile upserts).
 */
export async function enqueueSync(
  tableName: string,
  operation: SyncOperation,
  recordId: string | null,
  payload: Record<string, unknown>,
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO sync_queue (table_name, operation, record_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      tableName,
      operation,
      recordId ?? null,
      JSON.stringify(payload),
      new Date().toISOString(),
    ],
  );
  return result.lastInsertRowId;
}

/** True while a write for this record is still waiting to reach the server. */
export async function hasPendingSync(
  tableName: string,
  recordId: string,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM sync_queue WHERE table_name = ? AND record_id = ? LIMIT 1`,
    [tableName, recordId],
  );
  return row != null;
}

export async function dequeueSync(): Promise<
  {
    id: number;
    table_name: string;
    operation: string;
    record_id: string | null;
    payload: Record<string, unknown>;
  }[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    table_name: string;
    operation: string;
    record_id: string | null;
    payload: string;
  }>(`SELECT * FROM sync_queue ORDER BY id ASC`);
  return rows.map((r) => ({
    ...r,
    payload: JSON.parse(r.payload),
  }));
}

export async function removeSyncEntry(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}
