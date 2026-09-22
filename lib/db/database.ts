import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync("skinlens.db");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS user_profile (
        id TEXT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        email TEXT,
        age TEXT,
        phone_number TEXT,
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

    // Clean stuck notification entries from sync queue (string IDs can't sync to bigint column)
    await db.runAsync(
      `DELETE FROM sync_queue WHERE table_name = 'notifications'`,
    );

    return db;
  })();
  return dbPromise;
}
