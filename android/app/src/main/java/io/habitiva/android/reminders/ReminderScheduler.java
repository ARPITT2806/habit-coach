package io.habitiva.android.reminders;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

public class ReminderScheduler {
    public static final String ACTION_FIRE = "REMINDER_FIRE";
    public static final String ACTION_DONE = "REMINDER_DONE";
    public static final String ACTION_SKIPPED = "REMINDER_SKIPPED";
    public static final String ACTION_RESCHEDULE = "REMINDER_RESCHEDULE";
    public static final String CHANNEL_ID = "habit_reminders";

    /** Bridge store so the RESCHEDULE action can hand a habit occurrence to the WebView layer. */
    private static final String RESCHEDULE_PREFS = "habitiva_reschedule";
    private static final String KEY_RS_HABIT_ID = "habitId";
    private static final String KEY_RS_DATE_KEY = "dateKey";
    private static final String KEY_RS_TITLE = "title";
    private static final String KEY_RS_TIME_TEXT = "timeText";

    public static void savePendingReschedule(Context context, String habitId, String dateKey,
                                             String title, String timeText) {
        try {
            context.getSharedPreferences(RESCHEDULE_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_RS_HABIT_ID, habitId == null ? "" : habitId)
                    .putString(KEY_RS_DATE_KEY, dateKey == null ? "" : dateKey)
                    .putString(KEY_RS_TITLE, title == null ? "" : title)
                    .putString(KEY_RS_TIME_TEXT, timeText == null ? "" : timeText)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    public static android.os.Bundle readPendingReschedule(Context context) {
        android.os.Bundle out = new android.os.Bundle();
        try {
            android.content.SharedPreferences prefs =
                    context.getSharedPreferences(RESCHEDULE_PREFS, Context.MODE_PRIVATE);
            out.putString("habitId", prefs.getString(KEY_RS_HABIT_ID, ""));
            out.putString("dateKey", prefs.getString(KEY_RS_DATE_KEY, ""));
            out.putString("title", prefs.getString(KEY_RS_TITLE, ""));
            out.putString("timeText", prefs.getString(KEY_RS_TIME_TEXT, ""));
        } catch (Exception ignored) {
        }
        return out;
    }

    public static void clearPendingReschedule(Context context) {
        try {
            context.getSharedPreferences(RESCHEDULE_PREFS, Context.MODE_PRIVATE)
                    .edit().clear().apply();
        } catch (Exception ignored) {
        }
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Habit Reminders",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Reminders for your scheduled habits");
            manager.createNotificationChannel(channel);
        }
    }
}