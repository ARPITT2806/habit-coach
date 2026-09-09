package io.habitiva.android.reminders;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.database.sqlite.SQLiteDatabase;

import androidx.core.app.NotificationCompat;

import io.habitiva.android.MainActivity;

public class ReminderFireReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) return;
        final Context appContext = context.getApplicationContext();

        String action = intent.getAction();
        String habitId = intent.getStringExtra("habitId");
        String dateKey = intent.getStringExtra("dateKey");
        // Treat action intents as untrusted input: malformed or stale
        // intents must never touch user data.
        if (!validTarget(habitId, dateKey)) return;

        int requestCode = intent.getIntExtra("requestCode", 0);
        int fallback = codeFor(habitId, dateKey);
        if (requestCode == 0) requestCode = fallback;
        int notificationId = intent.getIntExtra("notificationId", requestCode);

        try {
            // "DONE" = done for the exact habit + date. Idempotent and
            // gated on the habit still existing: a notification belonging
            // to a deleted habit must not write anything.
            if (ReminderScheduler.ACTION_DONE.equals(action)) {
                try {
                    SQLiteDatabase db = ReminderDb.open(appContext);
                    if (ReminderDb.habitActiveOn(db, habitId, dateKey)) {
                        ReminderDb.logCompletion(appContext, habitId, dateKey, "completed");
                    }
                } catch (Exception ignored) {
                    // Logging must never leave a stale notification behind.
                } finally {
                    ReminderEngine.removeOneOff(appContext, habitId, dateKey);
                    dismiss(appContext, notificationId);
                }
                return;
            }

            // "Wrong" = not yet / pending. Pending is the absence of a
            // completion record in this data model, so this action only
            // dismisses and deliberately writes nothing.
            if (ReminderScheduler.ACTION_SKIPPED.equals(action)) {
                dismiss(appContext, notificationId);
                return;
            }

            // "Reschedule" = hand this exact habit occurrence to the app so
            // the user can pick a new time. Works from any app state because
            // the receiver launches MainActivity with NEW_TASK and the
            // pending occurrence waits in SharedPreferences for the WebView.
            if (ReminderScheduler.ACTION_RESCHEDULE.equals(action)) {
                try {
                    String title = intent.getStringExtra("title");
                    String timeText = intent.getStringExtra("timeText");
                    ReminderScheduler.savePendingReschedule(
                            appContext, habitId, dateKey,
                            title == null ? "" : title,
                            timeText == null ? "" : timeText);
                } catch (Exception ignored) {
                    // Pending store is best-effort; still open the app.
                } finally {
                    dismiss(appContext, notificationId);
                    openReschedule(appContext, habitId, dateKey);
                }
                return;
            }

            if (ReminderScheduler.ACTION_FIRE.equals(action)) {
                showReminder(appContext, intent, habitId, dateKey, requestCode);
            }
        } catch (Exception ignored) {
            // Receivers must never throw: that would crash the host process.
        }
    }

    private static boolean validTarget(String habitId, String dateKey) {
        if (habitId == null || habitId.isEmpty() || habitId.length() > 128) return false;
        return dateKey != null && dateKey.matches("\\d{4}-\\d{2}-\\d{2}");
    }

    private void showReminder(Context context, Intent intent, String habitId, String dateKey,
                              int requestCode) {
        try {
            // Never close this connection: the helper owns a shared instance.
            SQLiteDatabase db = ReminderDb.open(context);
            if (!ReminderDb.habitActiveOn(db, habitId, dateKey)) {
                cancelAlarm(context, requestCode);
                return;
            }
            if (ReminderDb.completionExists(db, habitId, dateKey)) {
                cancelAlarm(context, requestCode);
                return;
            }
        } catch (Exception e) {
            // DB not readable (locked, missing, first launch) -> show the reminder anyway.
        }

        ReminderScheduler.ensureChannel(context);

        String title = intent.getStringExtra("title");
        if (title == null || title.isEmpty()) title = "Habit reminder";
        String timeText = intent.getStringExtra("timeText");
        if (timeText == null) timeText = "";
        String contextText = intent.getStringExtra("contextText");
        if (contextText == null || contextText.isEmpty()) contextText = timeText;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
                .setSmallIcon(io.habitiva.android.R.drawable.ic_stat_habit)
                .setContentTitle(title)
                .setContentText(contextText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(contextText))
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setColor(0xFF6D5DF0)
                .setContentIntent(openAppPendingIntent(context, requestCode))
                .addAction(0, "DONE",
                        actionPendingIntent(context, requestCode + 5000, habitId, dateKey,
                                requestCode, ReminderScheduler.ACTION_DONE))
                .addAction(0, "RESCHEDULE",
                        reschedulePendingIntent(context, requestCode + 5001, habitId, dateKey,
                                requestCode, title, timeText));

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            try {
                manager.notify(requestCode, builder.build());
            } catch (Exception ignored) {
                // Posting can fail if notifications were revoked mid-flight.
            }
        }
    }

    private PendingIntent openAppPendingIntent(Context context, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent actionPendingIntent(Context context, int requestCode, String habitId,
                                              String dateKey, int notificationId, String action) {
        Intent intent = new Intent(context, ReminderFireReceiver.class).setAction(action);
        // Explicit intents to a declared, non-exported receiver stay inside this app.
        intent.setPackage(context.getPackageName());
        intent.putExtra("habitId", habitId);
        intent.putExtra("dateKey", dateKey);
        intent.putExtra("requestCode", requestCode);
        intent.putExtra("notificationId", notificationId);
        return PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent reschedulePendingIntent(Context context, int requestCode, String habitId,
                                                  String dateKey, int notificationId,
                                                  String title, String timeText) {
        Intent intent = new Intent(context, ReminderFireReceiver.class)
                .setAction(ReminderScheduler.ACTION_RESCHEDULE);
        intent.setPackage(context.getPackageName());
        intent.putExtra("habitId", habitId);
        intent.putExtra("dateKey", dateKey);
        intent.putExtra("requestCode", requestCode);
        intent.putExtra("notificationId", notificationId);
        intent.putExtra("title", title == null ? "" : title);
        intent.putExtra("timeText", timeText == null ? "" : timeText);
        return PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void openReschedule(Context context, String habitId, String dateKey) {
        try {
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("rescheduleHabitId", habitId);
            intent.putExtra("rescheduleDateKey", dateKey);
            context.startActivity(intent);
        } catch (Exception ignored) {
            // Opening the app is best-effort; the pending occurrence remains stored.
        }
    }

    private void cancelAlarm(Context context, int requestCode) {
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;
            Intent base = new Intent(context, ReminderFireReceiver.class)
                    .setAction(ReminderScheduler.ACTION_FIRE);
            base.setPackage(context.getPackageName());
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context, requestCode, base,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            alarmManager.cancel(pendingIntent);
        } catch (Exception ignored) {
        } finally {
            dismiss(context, requestCode);
        }
    }

    private void dismiss(Context context, int notificationId) {
        try {
            NotificationManager manager =
                    (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(notificationId);
        } catch (Exception ignored) {
        }
    }

    static int codeFor(String habitId, String dateKey) {
        long code = (long) habitId.hashCode() * 31L + (long) dateKey.hashCode();
        long positive = Math.abs(code % 100000000L);
        return (int) positive;
    }
}
