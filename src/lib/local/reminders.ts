import { registerPlugin } from "@capacitor/core";

import { parseDaysOfWeek } from "@/lib/constants";
import { todayKey } from "@/lib/dates";
import { isNativeApp } from "./database";
import { getHabits } from "./habits";
import { getLocalUser } from "./session";

export type ReminderItem = {
  habitId: string;
  title: string;
  why: string | null;
  consequence: string | null;
  isImportant: boolean;
  preferredTime: string;
  daysOfWeek: number[];
};

export type ReminderSyncResult = {
  scheduled: number;
  permissionGranted: boolean;
  exactAlarmGranted: boolean;
};

export type ReminderStatus = {
  permissionGranted: boolean;
  exactAlarmGranted: boolean;
  alarms: number[];
};

export type PendingReschedule = {
  habitId: string;
  dateKey: string;
  title: string;
  timeText: string;
};

interface HabitRemindersPlugin {
  isPermissionGranted(): Promise<{ permissionGranted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  canScheduleExactAlarms(): Promise<{ granted: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  syncReminders(options: {
    items: ReminderItem[];
    today: string;
  }): Promise<ReminderSyncResult>;
  rescheduleFromSnapshot(): Promise<void>;
  clear(): Promise<void>;
  status(): Promise<ReminderStatus>;
  getPendingReschedule(): Promise<PendingReschedule>;
  clearPendingReschedule(): Promise<void>;
  rescheduleReminder(options: {
    habitId: string;
    dateKey: string;
    newTime: string;
  }): Promise<{ scheduled: boolean }>;
}

const Reminders = registerPlugin<HabitRemindersPlugin>("HabitReminders");

export function remindersAvailable(): boolean {
  return isNativeApp();
}

export async function notificationPermissionGranted(): Promise<boolean> {
  if (!remindersAvailable()) return false;
  return (await Reminders.isPermissionGranted()).permissionGranted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!remindersAvailable()) return false;
  return (await Reminders.requestPermission()).granted;
}

export async function exactAlarmsGranted(): Promise<boolean> {
  if (!remindersAvailable()) return true;
  return (await Reminders.canScheduleExactAlarms()).granted;
}

export async function openExactAlarmSettings(): Promise<void> {
  if (!remindersAvailable()) return;
  await Reminders.openExactAlarmSettings();
}

export async function syncAllReminders(): Promise<ReminderSyncResult | null> {
  if (!remindersAvailable()) return null;

  const user = await getLocalUser();
  const habits = await getHabits(user.id);

  const items: ReminderItem[] = habits
    .filter((habit) => habit.isActive)
    .map((habit) => ({
      habitId: habit.id,
      title: habit.title,
      why: habit.why,
      consequence: habit.consequence,
      isImportant: habit.isImportant,
      preferredTime: habit.preferredTime,
      daysOfWeek: parseDaysOfWeek(habit.daysOfWeek),
    }));

  return Reminders.syncReminders({ items, today: todayKey() });
}

export async function rescheduleFromSnapshot(): Promise<void> {
  if (!remindersAvailable()) return;
  await Reminders.rescheduleFromSnapshot();
}

export async function clearReminders(): Promise<void> {
  if (!remindersAvailable()) return;
  await Reminders.clear();
}

export async function reminderStatus(): Promise<ReminderStatus | null> {
  if (!remindersAvailable()) return null;
  return Reminders.status();
}

export async function getPendingReschedule(): Promise<PendingReschedule | null> {
  if (!remindersAvailable()) return null;
  const pending = await Reminders.getPendingReschedule();
  if (!pending.habitId || !pending.dateKey) return null;
  return pending;
}

export async function clearPendingReschedule(): Promise<void> {
  if (!remindersAvailable()) return;
  await Reminders.clearPendingReschedule();
}

export async function rescheduleReminder(
  habitId: string,
  dateKey: string,
  newTime: string,
): Promise<boolean> {
  if (!remindersAvailable()) return false;
  const result = await Reminders.rescheduleReminder({ habitId, dateKey, newTime });
  return result.scheduled;
}