package io.habitiva.android;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import io.habitiva.android.reminders.HabitRemindersPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HabitRemindersPlugin.class);
        super.onCreate(savedInstanceState);
    }
}