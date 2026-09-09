package io.habitiva.android.reminders;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

@CapacitorPlugin(name = "HabitReminders")
public class HabitRemindersPlugin extends Plugin {

    private static final String PREFS = "habitiva_reminders";
    private static final String KEY_CODES = "scheduled_codes";
    /** Upper bound so one sync can never flood the alarm queue. */
    private static final int MAX_ALARMS = 64;
    /** How many days ahead a single sync schedules. */
    private static final int HORIZON_DAYS = 7;

    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        try {
            call.resolve(new JSObject().put("permissionGranted", notificationsAllowed()));
        } catch (Exception e) {
            call.reject("Could not read notification permission", e);
        }
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getActivity() != null) {
                getActivity().requestPermissions(
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1001);
            }
            // The result arrives asynchronously; the web layer re-reads the
            // real state via isPermissionGranted(), so resolve immediately.
            call.resolve(new JSObject().put("granted", notificationsAllowed()));
        } catch (Exception e) {
            call.reject("Could not request notification permission", e);
        }
    }

    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        try {
            call.resolve(new JSObject().put("granted", exactAlarmsAllowed()));
        } catch (Exception e) {
            call.reject("Could not read exact-alarm state", e);
        }
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getActivity() != null) {
                Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                getActivity().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open exact-alarm settings", e);
        }
    }

    @PluginMethod
    public void syncReminders(PluginCall call) {
        try {
            Context context = getContext();
            JSONArray items = call.getArray("items", new JSArray());
            String today = call.getString("today", "");

            ReminderEngine.persistItems(context, items);
            int scheduled = ReminderEngine.scheduleAll(context, items, today);

            JSObject result = new JSObject();
            result.put("scheduled", scheduled);
            result.put("permissionGranted", ReminderEngine.notificationsAllowed(context));
            result.put("exactAlarmGranted", ReminderEngine.exactAlarmsAllowed(context));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not sync reminders", e);
        }
    }

    @PluginMethod
    public void rescheduleFromSnapshot(PluginCall call) {
        try {
            ReminderEngine.rescheduleFromStored(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not reschedule reminders", e);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            ReminderEngine.clearAll(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not clear reminders", e);
        }
    }

    @PluginMethod
    public void getPendingReschedule(PluginCall call) {
        try {
            Context context = getContext();
            android.os.Bundle pending = ReminderScheduler.readPendingReschedule(context);
            JSObject result = new JSObject();
            result.put("habitId", pending.getString("habitId", ""));
            result.put("dateKey", pending.getString("dateKey", ""));
            result.put("title", pending.getString("title", ""));
            result.put("timeText", pending.getString("timeText", ""));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read pending reschedule", e);
        }
    }

    @PluginMethod
    public void clearPendingReschedule(PluginCall call) {
        try {
            ReminderScheduler.clearPendingReschedule(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not clear pending reschedule", e);
        }
    }

    @PluginMethod
    public void rescheduleReminder(PluginCall call) {
        try {
            String habitId = call.getString("habitId", "");
            String dateKey = call.getString("dateKey", "");
            String newTime = call.getString("newTime", "");
            boolean scheduled =
                    ReminderEngine.scheduleOneOff(getContext(), habitId, dateKey, newTime);
            JSObject result = new JSObject();
            result.put("scheduled", scheduled);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not reschedule reminder", e);
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            Context context = getContext();
            JSObject result = new JSObject();
            result.put("permissionGranted", ReminderEngine.notificationsAllowed(context));
            result.put("exactAlarmGranted", ReminderEngine.exactAlarmsAllowed(context));
            result.put("alarms", ReminderEngine.trackedCount(context));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read reminder status", e);
        }
    }

    // ---------- helpers ----------

    private boolean notificationsAllowed() {
        return ReminderEngine.notificationsAllowed(getContext());
    }

    private boolean exactAlarmsAllowed() {
        return ReminderEngine.exactAlarmsAllowed(getContext());
    }
}
