package io.habitiva.android.reminders;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * Shared alarm-scheduling engine used by both the Capacitor plugin
 * (foreground syncs from the WebView layer) and the boot/time-change
 * receiver (which has no JS runtime and must rebuild alarms alone).
 *
 * <p>Design rules:
 * <ul>
 *   <li>At most {@link #MAX_ALARMS} alarms per sync — never flood the queue.</li>
 *   <li>Exact alarms only when the OS grants them; otherwise inexact fallback.</li>
 *   <li>Every sync reconciles: tracked codes absent from the new set are
 *       cancelled, so edits/deletes never leave ghost notifications.</li>
 *   <li>The last synced habit specs are persisted ({@link #KEY_ITEMS}) so a
 *       reboot can rebuild the schedule without the app running.</li>
 *   <li>No database access here: the plugin runs on the UI thread, and the
 *       receiver verifies habit/completion state at fire time instead.</li>
 *   <li>All device-local timezone handling via the default timezone.</li>
 * </ul>
 */
public final class ReminderEngine {
    static final String PREFS = "habitiva_reminders";
    static final String KEY_CODES = "scheduled_codes";
    static final String KEY_ITEMS = "reminder_items_json";
    /** One-off reschedules from the notification RESCHEDULE action: habitId|dateKey|HH:MM. */
    static final String KEY_ONEOFFS = "oneoff_items";
    /** Upper bound so one sync can never flood the alarm queue. */
    static final int MAX_ALARMS = 64;
    /** How many days ahead a single sync schedules. */
    static final int HORIZON_DAYS = 7;
    /** Cap persisted snapshot size (habit specs are tiny; this is paranoia). */
    private static final int MAX_SNAPSHOT_CHARS = 100_000;

    private ReminderEngine() {
    }

    /**
     * Schedule alarms for the given habit specs, reconcile against the
     * previously tracked set, and persist both. Returns alarms scheduled.
     */
    static int scheduleAll(Context context, JSONArray items, String todayAnchor) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return 0;

        Calendar base = parseDateKey(todayAnchor);
        boolean exact = exactAlarmsAllowed(context);
        Set<String> wanted = new HashSet<>();
        int scheduled = 0;

        outer:
        for (int d = 0; d < HORIZON_DAYS; d++) {
            Calendar day = (Calendar) base.clone();
            day.add(Calendar.DAY_OF_YEAR, d);
            int jsDow = day.get(Calendar.DAY_OF_WEEK) - 1; // 0=Sunday, like JS getDay()
            String dateKey = String.format(Locale.US, "%04d-%02d-%02d",
                    day.get(Calendar.YEAR),
                    day.get(Calendar.MONTH) + 1,
                    day.get(Calendar.DAY_OF_MONTH));

            for (int i = 0; i < items.length(); i++) {
                JSONObject item;
                try {
                    item = items.getJSONObject(i);
                } catch (Exception skipped) {
                    continue;
                }
                String habitId = item.optString("habitId", "");
                String preferredTime = item.optString("preferredTime", "");
                JSONArray days = item.optJSONArray("daysOfWeek");
                if (habitId.isEmpty() || habitId.length() > 128
                        || preferredTime.isEmpty() || days == null) {
                    continue;
                }

                boolean matches = false;
                for (int k = 0; k < days.length(); k++) {
                    if (days.optInt(k, -1) == jsDow) {
                        matches = true;
                        break;
                    }
                }
                if (!matches) continue;

                int[] hm = parseTime(preferredTime);
                if (hm == null) continue;
                Calendar fire = (Calendar) day.clone();
                fire.set(Calendar.HOUR_OF_DAY, hm[0]);
                fire.set(Calendar.MINUTE, hm[1]);
                fire.set(Calendar.SECOND, 0);
                fire.set(Calendar.MILLISECOND, 0);
                if (fire.getTimeInMillis() <= System.currentTimeMillis() + 30_000L) continue;

                int code = ReminderFireReceiver.codeFor(habitId, dateKey);
                if (!wanted.add(code + ":" + dateKey)) continue;
                if (scheduled >= MAX_ALARMS) break outer;

                if (scheduleOne(context, alarms, exact, item, habitId, dateKey,
                        fire.getTimeInMillis(), code)) {
                    scheduled++;
                }
            }
        }

        scheduled += applyOneOffs(context, alarms, exact, wanted, todayAnchor);
        reconcile(context, alarms, wanted);
        return scheduled;
    }

    /**
     * Schedule a one-off reminder for a single habit occurrence (used by the
     * notification RESCHEDULE action). Uses the same request code as the
     * regular alarm so it replaces the original notification instead of
     * duplicating it. Returns true when an alarm was scheduled.
     */
    static boolean scheduleOneOff(Context context, String habitId, String dateKey, String timeHHMM) {
        try {
            if (habitId == null || habitId.isEmpty() || habitId.length() > 128) return false;
            if (dateKey == null || !dateKey.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
            int[] hm = parseTime(timeHHMM == null ? "" : timeHHMM);
            if (hm == null) return false;

            Calendar day = parseDateKey(dateKey);
            day.set(Calendar.HOUR_OF_DAY, hm[0]);
            day.set(Calendar.MINUTE, hm[1]);
            day.set(Calendar.SECOND, 0);
            day.set(Calendar.MILLISECOND, 0);
            if (day.getTimeInMillis() <= System.currentTimeMillis() + 30_000L) return false;

            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) return false;

            JSONObject item = snapshotItemFor(context, habitId);
            item.put("preferredTime", timeHHMM);
            int code = ReminderFireReceiver.codeFor(habitId, dateKey);
            boolean exact = exactAlarmsAllowed(context);
            if (!scheduleOne(context, alarms, exact, item, habitId, dateKey,
                    day.getTimeInMillis(), code)) {
                return false;
            }

            Set<String> oneOffs = oneOffs(context);
            oneOffs.add(habitId + "|" + dateKey + "|" + timeHHMM);
            persistOneOffs(context, oneOffs);

            Set<String> tracked = trackedCodes(context);
            tracked.add(code + ":" + dateKey);
            persistCodes(context, tracked);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Forget the one-off reschedule for a habit occurrence (done, deleted, or superseded). */
    static void removeOneOff(Context context, String habitId, String dateKey) {
        try {
            Set<String> oneOffs = oneOffs(context);
            boolean changed = false;
            for (String entry : new HashSet<>(oneOffs)) {
                String[] parts = entry.split("\\|", -1);
                if (parts.length == 3 && parts[0].equals(habitId) && parts[1].equals(dateKey)) {
                    oneOffs.remove(entry);
                    changed = true;
                }
            }
            if (changed) persistOneOffs(context, oneOffs);
        } catch (Exception ignored) {
        }
    }

    /**
     * Re-apply persisted one-off reschedules on top of the regular schedule so
     * later syncs (habit edits, reboots) never drop them. Adds each kept entry
     * to {@code wanted} so reconcile() does not cancel it.
     */
    private static int applyOneOffs(Context context, AlarmManager alarms, boolean exact,
                                    Set<String> wanted, String todayAnchor) {
        int scheduled = 0;
        try {
            Set<String> oneOffs = oneOffs(context);
            if (oneOffs.isEmpty()) return 0;
            Set<String> kept = new HashSet<>();
            for (String entry : oneOffs) {
                String[] parts = entry.split("\\|", -1);
                if (parts.length != 3) continue;
                String habitId = parts[0];
                String dateKey = parts[1];
                String timeHHMM = parts[2];
                if (dateKey.compareTo(todayAnchor) < 0) continue; // past dates fall away
                int[] hm = parseTime(timeHHMM);
                if (hm == null) continue;
                Calendar day = parseDateKey(dateKey);
                day.set(Calendar.HOUR_OF_DAY, hm[0]);
                day.set(Calendar.MINUTE, hm[1]);
                day.set(Calendar.SECOND, 0);
                day.set(Calendar.MILLISECOND, 0);
                if (day.getTimeInMillis() <= System.currentTimeMillis() + 30_000L) continue;
                JSONObject item = snapshotItemFor(context, habitId);
                item.put("preferredTime", timeHHMM);
                int code = ReminderFireReceiver.codeFor(habitId, dateKey);
                if (wanted.add(code + ":" + dateKey)
                        && scheduleOne(context, alarms, exact, item, habitId, dateKey,
                                day.getTimeInMillis(), code)) {
                    scheduled++;
                }
                kept.add(entry);
            }
            if (!kept.equals(oneOffs)) persistOneOffs(context, kept);
        } catch (Exception ignored) {
        }
        return scheduled;
    }

    private static Set<String> oneOffs(Context context) {
        return new HashSet<>(prefs(context).getStringSet(KEY_ONEOFFS, new HashSet<String>()));
    }

    private static void persistOneOffs(Context context, Set<String> oneOffs) {
        prefs(context).edit().putStringSet(KEY_ONEOFFS, new HashSet<>(oneOffs)).apply();
    }

    /** Best-effort lookup of a habit's display fields from the last synced snapshot. */
    private static JSONObject snapshotItemFor(Context context, String habitId) {
        JSONObject fallback = new JSONObject();
        try {
            fallback.put("title", "Habit reminder");
            String json = prefs(context).getString(KEY_ITEMS, null);
            if (json == null || json.isEmpty()) return fallback;
            JSONArray items = new JSONArray(json);
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null && habitId.equals(item.optString("habitId", ""))) {
                    return item;
                }
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }

    /**
     * Rebuild the schedule from the last persisted snapshot (used after
     * reboot / time changes when no JS runtime exists). Returns alarms
     * scheduled, or 0 when no snapshot was ever stored.
     */
    static int rescheduleFromStored(Context context) {
        String json = prefs(context).getString(KEY_ITEMS, null);
        if (json == null || json.isEmpty()) return 0;
        try {
            JSONArray items = new JSONArray(json);
            return scheduleAll(context, items, localTodayKey());
        } catch (Exception e) {
            return 0;
        }
    }

    /** Persist the latest habit specs for future boot-time rescheduling. */
    static void persistItems(Context context, JSONArray items) {
        try {
            String json = items.toString();
            if (json.length() > MAX_SNAPSHOT_CHARS) return;
            prefs(context).edit().putString(KEY_ITEMS, json).apply();
        } catch (Exception ignored) {
        }
    }

    /** Cancel every tracked alarm and forget all scheduling state. */
    static void clearAll(Context context) {
        try {
            AlarmManager alarms =
                    (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms != null) {
                for (String key : trackedCodes(context)) {
                    try {
                        cancelOne(context, alarms, Integer.parseInt(key.split(":")[0]));
                    } catch (Exception ignored) {
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            try {
                prefs(context).edit().remove(KEY_CODES).remove(KEY_ITEMS).apply();
            } catch (Exception ignored) {
            }
        }
    }

    static int trackedCount(Context context) {
        try {
            return trackedCodes(context).size();
        } catch (Exception e) {
            return 0;
        }
    }

    static boolean notificationsAllowed(Context context) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            return context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    static boolean exactAlarmsAllowed(Context context) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) return true;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarms == null || alarms.canScheduleExactAlarms();
    }

    // ---------- internals ----------

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static Set<String> trackedCodes(Context context) {
        return new HashSet<>(prefs(context).getStringSet(KEY_CODES, new HashSet<String>()));
    }

    private static void persistCodes(Context context, Set<String> codes) {
        prefs(context).edit().putStringSet(KEY_CODES, new HashSet<>(codes)).apply();
    }

    /** Cancel tracked alarms that are no longer wanted, then persist the new set. */
    private static void reconcile(Context context, AlarmManager alarms, Set<String> wanted) {
        Set<String> tracked = trackedCodes(context);
        for (String key : tracked) {
            if (!wanted.contains(key)) {
                try {
                    cancelOne(context, alarms, Integer.parseInt(key.split(":")[0]));
                } catch (Exception ignored) {
                }
            }
        }
        persistCodes(context, wanted);
    }

    private static void cancelOne(Context context, AlarmManager alarms, int code) {
        Intent base = new Intent(context, ReminderFireReceiver.class)
                .setAction(ReminderScheduler.ACTION_FIRE);
        base.setPackage(context.getPackageName());
        PendingIntent pi = PendingIntent.getBroadcast(
                context, code, base,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            alarms.cancel(pi);
        } catch (Exception ignored) {
        }
    }

    private static boolean scheduleOne(Context context, AlarmManager alarms, boolean exact,
                                       JSONObject item, String habitId, String dateKey,
                                       long fireAtMillis, int code) {
        try {
            String title = item.optString("title", "Habit reminder");
            if (title.isEmpty()) title = "Habit reminder";
            String why = item.optString("why", "");
            String consequence = item.optString("consequence", "");
            String contextText = !why.isEmpty() ? why
                    : !consequence.isEmpty() ? ("Skipping means " + consequence)
                    : item.optString("preferredTime", "");

            Intent intent = new Intent(context, ReminderFireReceiver.class)
                    .setAction(ReminderScheduler.ACTION_FIRE);
            intent.setPackage(context.getPackageName());
            intent.putExtra("habitId", habitId);
            intent.putExtra("dateKey", dateKey);
            intent.putExtra("title", title);
            intent.putExtra("timeText", item.optString("preferredTime", ""));
            intent.putExtra("contextText", contextText);
            intent.putExtra("requestCode", code);
            intent.putExtra("notificationId", code);
            PendingIntent pi = PendingIntent.getBroadcast(
                    context, code, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            try {
                if (exact) {
                    alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, pi);
                } else {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, pi);
                }
            } catch (SecurityException noExact) {
                // Exact-alarm permission revoked between check and schedule.
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, pi);
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static Calendar parseDateKey(String today) {
        Calendar cal = Calendar.getInstance(TimeZone.getDefault());
        try {
            String[] parts = today.split("-");
            cal.set(Calendar.YEAR, Integer.parseInt(parts[0]));
            cal.set(Calendar.MONTH, Integer.parseInt(parts[1]) - 1);
            cal.set(Calendar.DAY_OF_MONTH, Integer.parseInt(parts[2]));
            cal.set(Calendar.HOUR_OF_DAY, 0);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
        } catch (Exception ignored) {
            // Fall back to right now; scheduling still filters past times.
        }
        return cal;
    }

    static String localTodayKey() {
        Calendar cal = Calendar.getInstance(TimeZone.getDefault());
        return String.format(Locale.US, "%04d-%02d-%02d",
                cal.get(Calendar.YEAR),
                cal.get(Calendar.MONTH) + 1,
                cal.get(Calendar.DAY_OF_MONTH));
    }

    private static int[] parseTime(String hhmm) {
        try {
            String[] parts = hhmm.split(":");
            int h = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            if (h < 0 || h > 23 || m < 0 || m > 59) return null;
            return new int[]{h, m};
        } catch (Exception e) {
            return null;
        }
    }
}
