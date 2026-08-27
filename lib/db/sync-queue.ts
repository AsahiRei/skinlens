import { getDatabase } from "./database";

export type SyncOperation = "upsert" | "insert" | "delete" | "update";

export async function enqueueSync(
  tableName: string,
  operation: SyncOperation,
  recordId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
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

export async function clearSyncQueue(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM sync_queue`);
}
