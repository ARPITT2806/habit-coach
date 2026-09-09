package io.habitiva.android.reminders;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Rebuilds the alarm schedule after events that wipe scheduled alarms
 * (device reboot, time/timezone changes, app update) using the last
 * persisted snapshot — no app launch required.
 *
 * <p>Everything here is guarded so a failing receiver can never crash
 * the app or loop.
 */
public class AlarmRefreshReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        try {
            Context appContext = context.getApplicationContext();
            ReminderScheduler.ensureChannel(appContext);
            ReminderEngine.rescheduleFromStored(appContext);
        } catch (Exception ignored) {
            // Best-effort only: receivers must never throw.
        }
    }
}
