import { Capacitor } from "@capacitor/core";
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";

const DATABASE_NAME = "habit_flow";
const DATABASE_VERSION = 1;

let connection: SQLiteConnection | null = null;
let database: SQLiteDBConnection | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function getLocalDatabase(): Promise<SQLiteDBConnection> {
  if (!isNativeApp()) {
    throw new Error("Local SQLite is only available in the native app.");
  }

  if (database) {
    return database;
  }

  connection ??= new SQLiteConnection(CapacitorSQLite);

  const consistency = await connection.checkConnectionsConsistency();

  if (!consistency.result) {
    database = await connection.createConnection(
      DATABASE_NAME,
      false,
      "no-encryption",
      DATABASE_VERSION,
      false,
    );
  } else {
    try {
      database = await connection.retrieveConnection(DATABASE_NAME, false);
    } catch {
      database = await connection.createConnection(
        DATABASE_NAME,
        false,
        "no-encryption",
        DATABASE_VERSION,
        false,
      );
    }
  }

  await database.open();
  await initializeDatabase(database);

  return database;
}

async function initializeDatabase(db: SQLiteDBConnection): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      onboarded_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      goal_id TEXT,
      title TEXT NOT NULL,
      why TEXT,
      frequency_per_week INTEGER NOT NULL,
      days_of_week TEXT NOT NULL,
      preferred_time TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      target_duration_min INTEGER,
      target_quantity INTEGER,
      unit TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS habit_completions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      habit_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      reason_other TEXT,
      preferred_time_at_log TEXT,
      logged_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(habit_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS check_ins (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      mood INTEGER NOT NULL,
      blocker TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      evidence TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      habit_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      evidence TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_goals_user
      ON goals(user_id);

    CREATE INDEX IF NOT EXISTS idx_habits_user_active
      ON habits(user_id, is_active);

    CREATE INDEX IF NOT EXISTS idx_completions_user_date
      ON habit_completions(user_id, date);

    CREATE INDEX IF NOT EXISTS idx_checkins_user_date
      ON check_ins(user_id, date);

    CREATE INDEX IF NOT EXISTS idx_insights_user_created
      ON ai_insights(user_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_recommendations_user_created
      ON ai_recommendations(user_id, created_at);
  `);
}
