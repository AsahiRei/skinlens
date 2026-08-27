import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("skinlens.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY,
      username TEXT,
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

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      record_id TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}
