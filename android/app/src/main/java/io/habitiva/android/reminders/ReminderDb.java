package io.habitiva.android.reminders;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

/**
 * Read/write access to the SAME SQLite file the WebView layer uses
 * ({@code habit_flowSQLite.db}, created by @capacitor-community/sqlite).
 *
 * <p>A previous revision used a separate {@code habit_reminders.db}, which
 * meant notification actions (Right/Wrong) wrote completions the app could
 * never see. Sharing the file keeps a single source of truth.
 *
 * <p>Notes:
 * <ul>
 *   <li>Tables are created with {@code IF NOT EXISTS} only; this class never
 *       migrates or deletes user data.</li>
 *   <li>The shared helper connection is intentionally never closed here —
 *       closing it would break the pool for subsequent receiver runs.</li>
 *   <li>All SQL uses APIs available since API 24 (no upsert syntax, no
 *       {@code java.time}). A busy timeout avoids SQLITE_BUSY races with
 *       the WebView connection.</li>
 * </ul>
 */
public class ReminderDb {
    /** Must match DATABASE_NAME in src/lib/local/database.ts ("habit_flow" + plugin suffix). */
    static final String SHARED_DB_FILE = "habit_flowSQLite.db";
    private static final int DB_VERSION = 1;

    private static class DbHelper extends SQLiteOpenHelper {
        DbHelper(Context context) {
            super(context, context.getDatabasePath(SHARED_DB_FILE).getAbsolutePath(), null, DB_VERSION);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            createTables(db);
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            createTables(db);
        }

        private void createTables(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS habits (" +
                    "id TEXT PRIMARY KEY, " +
                    "user_id TEXT NOT NULL, " +
                    "goal_id TEXT, " +
                    "title TEXT NOT NULL, " +
                    "why TEXT, " +
                    "consequence TEXT, " +
                    "is_important INTEGER NOT NULL DEFAULT 0, " +
                    "frequency_per_week INTEGER NOT NULL, " +
                    "days_of_week TEXT NOT NULL, " +
                    "preferred_time TEXT NOT NULL, " +
                    "difficulty TEXT NOT NULL, " +
                    "target_duration_min INTEGER, " +
                    "target_quantity INTEGER, " +
                    "unit TEXT, " +
                    "is_active INTEGER NOT NULL DEFAULT 1, " +
                    "created_at TEXT NOT NULL, " +
                    "updated_at TEXT NOT NULL" +
                    ");");

            db.execSQL("CREATE TABLE IF NOT EXISTS habit_completions (" +
                    "id TEXT PRIMARY KEY, " +
                    "user_id TEXT NOT NULL, " +
                    "habit_id TEXT NOT NULL, " +
                    "date TEXT NOT NULL, " +
                    "status TEXT NOT NULL, " +
                    "reason TEXT, " +
                    "reason_other TEXT, " +
                    "preferred_time_at_log TEXT, " +
                    "logged_at TEXT NOT NULL, " +
                    "created_at TEXT NOT NULL, " +
                    "UNIQUE(habit_id, date)" +
                    ");");
        }

        @Override
        public void onConfigure(SQLiteDatabase db) {
            // Tolerate brief lock contention with the WebView connection.
            db.execSQL("PRAGMA busy_timeout=5000");
        }
    }

    private static volatile SQLiteOpenHelper sHelper;

    private static SQLiteOpenHelper getHelper(Context context) {
        if (sHelper == null) {
            synchronized (ReminderDb.class) {
                if (sHelper == null) {
                    sHelper = new DbHelper(context.getApplicationContext());
                }
            }
        }
        return sHelper;
    }

    static SQLiteDatabase open(Context context) {
        return getHelper(context).getWritableDatabase();
    }

    static String utcNowIso() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }

    /** Idempotent: insert or replace the completion for (habit, date). */
    public static void logCompletion(Context context, String habitId, String dateKey, String status) {
        SQLiteDatabase db = open(context);
        String timestamp = utcNowIso();
        ContentValues values = new ContentValues();
        values.put("id", UUID.randomUUID().toString());
        values.put("user_id", "local-user");
        values.put("habit_id", habitId);
        values.put("date", dateKey);
        values.put("status", status);
        values.putNull("reason");
        values.putNull("reason_other");
        values.put("preferred_time_at_log", "");
        values.put("logged_at", timestamp);
        values.put("created_at", timestamp);
        db.insertWithOnConflict("habit_completions", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    /** Fail-open: any error means "show the reminder". */
    public static boolean habitActiveOn(SQLiteDatabase db, String habitId, String dateKey) {
        Cursor cursor = null;
        try {
            cursor = db.rawQuery(
                    "SELECT is_active FROM habits WHERE id = ? LIMIT 1",
                    new String[]{habitId});
            if (cursor.moveToFirst()) {
                return cursor.getInt(0) == 1;
            }
            return false;
        } catch (Exception e) {
            return true;
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    public static boolean completionExists(SQLiteDatabase db, String habitId, String dateKey) {
        Cursor cursor = null;
        try {
            cursor = db.rawQuery(
                    "SELECT 1 FROM habit_completions WHERE habit_id = ? AND date = ? LIMIT 1",
                    new String[]{habitId, dateKey});
            return cursor.moveToFirst();
        } catch (Exception e) {
            return false;
        } finally {
            if (cursor != null) cursor.close();
        }
    }
}
