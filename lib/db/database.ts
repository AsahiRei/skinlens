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

    // Migration: add new columns to results table if they don't exist
    const migrationColumns = [
      { name: "confidence", type: "REAL" },
      { name: "detection_label", type: "TEXT" },
      { name: "survey_answers", type: "TEXT" },
    ];
    for (const col of migrationColumns) {
      try {
        await db.runAsync(`ALTER TABLE results ADD COLUMN ${col.name} ${col.type}`);
      } catch {
        // Column already exists, ignore
      }
    }

    // Migration: add first_name column to user_profile if it doesn't exist
    try {
      await db.runAsync(`ALTER TABLE user_profile ADD COLUMN first_name TEXT`);
    } catch {
      // Column already exists, ignore
    }

    // Migration: drop phone_number column from user_profile if it exists
    try {
      await db.runAsync(`ALTER TABLE user_profile DROP COLUMN phone_number`);
    } catch {
      // Column already removed or SQLite version doesn't support it, ignore
    }

    // Clean stuck notification entries from sync queue (string IDs can't sync to bigint column)
    await db.runAsync(
      `DELETE FROM sync_queue WHERE table_name = 'notifications'`,
    );

  return db;
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
