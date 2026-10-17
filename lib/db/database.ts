import * as SQLite from "expo-sqlite";

const DB_NAME = "skinlens.db";

let rawDb: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Serializes all statements issued against the single shared handle.
// Concurrent prepare/execute/finalize lifecycles on one handle corrupt the
// native statement registry on Android (SIGSEGV / bare NPE /
// "shared object already released" — expo#48995).
let queue: Promise<void> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // Keep the chain alive even if this call rejects.
  queue = run.then(
    () => {},
    () => {},
  );
  return run;
}

function isPoisonedHandleError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message} ${"cause" in err ? String((err as { cause?: unknown }).cause) : ""}`
      : String(err);
  return (
    msg.includes("NullPointerException") ||
    msg.includes("prepareAsync") ||
    msg.includes("shared object already released") ||
    msg.includes("NativeDatabase") ||
    msg.includes("NativeStatement")
  );
}

async function openAndMigrate(useNewConnection: boolean): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(
    DB_NAME,
    useNewConnection ? { useNewConnection: true } : undefined,
  );
  await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS user_profile (
        id TEXT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        email TEXT,
        age TEXT,
        gender TEXT,
        user_setup INTEGER,
        face_image_url TEXT,
        face_embedding TEXT,
        created_at TEXT,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS skin_profile (
        id TEXT PRIMARY KEY,
        skin_type TEXT,
        main_concerns TEXT,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS lifestyle_profile (
        id TEXT PRIMARY KEY,
        sleep_quality TEXT,
        water_intake TEXT,
        stress_level TEXT,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        severity TEXT,
        description TEXT,
        healthscore REAL,
        image_url TEXT,
        source_type TEXT,
        recommendations TEXT,
        created_at TEXT,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        source_type TEXT,
        routine_json TEXT,
        created_at TEXT,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS routine_progress (
        user_id TEXT,
        routine_id INTEGER,
        period TEXT,
        step INTEGER,
        completed_date TEXT,
        synced_at TEXT,
        PRIMARY KEY (user_id, routine_id, period, step, completed_date)
      );

      CREATE TABLE IF NOT EXISTS sensitivity_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        trigger_cause TEXT,
        severity TEXT,
        notes TEXT,
        occurred_at TEXT,
        created_at TEXT,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        type TEXT,
        title TEXT,
        message TEXT,
        read INTEGER DEFAULT 0,
        created_at TEXT,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        record_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Secondary indexes for the WHERE / ORDER BY clauses the app actually
    // issues (the schema above is all CREATE TABLE — without these every
    // read is a full table scan, including the per-server-row natural-key
    // lookups in sensitivity.ts).
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_results_user_created
        ON results (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_results_user_id
        ON results (user_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_routines_user_id
        ON routines (user_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_sensitivity_user_trigger
        ON sensitivity_history (user_id, trigger_cause);
      CREATE INDEX IF NOT EXISTS idx_sensitivity_user_occurred
        ON sensitivity_history (user_id, occurred_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_lookup
        ON sync_queue (table_name, record_id);
    `);

    // Column migrations — driven by PRAGMA table_info instead of the old
    // "try ALTER, swallow the duplicate-column error" loop, which threw and
    // caught ~11 exceptions (with stack capture) on every single app open.
    await ensureColumns(db, "results", [
      { name: "confidence", type: "REAL" },
      { name: "detection_label", type: "TEXT" },
      { name: "survey_answers", type: "TEXT" },
      { name: "validation_status", type: "TEXT" },
      { name: "doctor_notes", type: "TEXT" },
      { name: "validated_by", type: "TEXT" },
      { name: "validated_at", type: "TEXT" },
    ]);
    await ensureColumns(db, "user_profile", [
      { name: "first_name", type: "TEXT" },
      // Face recognition enrollment (offline mirror of the server-side
      // ALTER TABLE public.user_profile ADD COLUMN ...).
      { name: "face_image_url", type: "TEXT" },
      { name: "face_embedding", type: "TEXT" },
    ]);

    // Drop the legacy phone_number column when it is still present.
    if (await hasColumn(db, "user_profile", "phone_number")) {
      try {
        await db.runAsync(`ALTER TABLE user_profile DROP COLUMN phone_number`);
      } catch {
        // SQLite version doesn't support DROP COLUMN — harmless, leave it.
      }
    }

    // Clean stuck notification entries from sync queue (string IDs can't sync to bigint column)
    await db.runAsync(
      `DELETE FROM sync_queue WHERE table_name = 'notifications'`,
    );

  return db;
}

async function tableColumns(
  db: SQLite.SQLiteDatabase,
  table: string,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  return new Set(rows.map((r) => r.name));
}

async function hasColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  return (await tableColumns(db, table)).has(column);
}

async function ensureColumns(
  db: SQLite.SQLiteDatabase,
  table: string,
  columns: { name: string; type: string }[],
): Promise<void> {
  const existing = await tableColumns(db, table);
  for (const col of columns) {
    if (existing.has(col.name)) continue;
    await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
    existing.add(col.name);
  }
}

/**
 * Wraps the shared handle so every async statement runs one-at-a-time and a
 * dead native handle (bare NPE after a runtime teardown / Fast Refresh —
 * expo#48999) is discarded and reopened with a fresh connection.
 */
function wrap(db: SQLite.SQLiteDatabase): SQLite.SQLiteDatabase {
  const handler: ProxyHandler<SQLite.SQLiteDatabase> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (
        typeof value === "function" &&
        (prop === "execAsync" ||
          prop === "runAsync" ||
          prop === "getFirstAsync" ||
          prop === "getAllAsync" ||
          prop === "prepareAsync")
      ) {
        return (...args: unknown[]) =>
          serialize(async () => {
            try {
              return await (value as (...a: unknown[]) => Promise<unknown>).apply(
                target,
                args,
              );
            } catch (err) {
              if (!isPoisonedHandleError(err)) throw err;
              // Drop the poisoned handle and reopen on a new connection.
              // A plain reopen returns the same cached native object and never
              // recovers, so useNewConnection is required. NOTE: retry runs
              // directly on the fresh raw handle — routing it through
              // getDatabase()/serialize would deadlock (we are already inside
              // the serialize lock).
              console.warn(
                "[db] poisoned SQLite handle detected, reopening with new connection",
              );
              const freshRaw = await openAndMigrate(true);
              rawDb = freshRaw;
              dbPromise = Promise.resolve(wrap(freshRaw));
              const retryFn = (
                freshRaw as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
              )[prop as string].bind(freshRaw);
              return await retryFn(...args);
            }
          });
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  };
  return new Proxy(db, handler);
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      rawDb = await openAndMigrate(false);
    } catch (err) {
      // First open failed (e.g. poisoned cached native handle left over from
      // a torn-down runtime). Retry once on a fresh connection.
      console.warn("[db] open failed, retrying with new connection:", err);
      rawDb = await openAndMigrate(true);
    }
    return wrap(rawDb);
  })();
  // If init itself rejects, clear the cached promise so the next call retries
  // instead of replaying the same rejection forever.
  dbPromise.catch(() => {
    dbPromise = null;
    rawDb = null;
  });
  return dbPromise;
}
