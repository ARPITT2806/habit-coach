import { defaultDaysForFrequency, parseDaysOfWeek } from "@/lib/constants";
import { formatTime, parseDateKey, todayKey } from "@/lib/dates";
import {
  createHabit,
  getCompletions,
  getGoals,
  getHabits,
  logHabit,
  updateHabitPreferredTime,
  type LocalCompletion,
  type LocalHabit,
} from "@/lib/local/habits";
import { syncAllReminders } from "@/lib/local/reminders";
import { getLocalUser } from "@/lib/local/session";
import type { VoiceIntent } from "./intents";

export type CommandReply = {
  text: string;
  ok: boolean;
  changed?: boolean;
};

export async function runVoiceCommand(intent: VoiceIntent): Promise<CommandReply> {
  switch (intent.kind) {
    case "show_plan_today":
      return showPlanToday();
    case "show_progress":
      return showProgress();
    case "show_calories":
      return {
        text: "I don't track calories yet. Ask me about today's habits or your progress instead.",
        ok: true,
      };
    case "mark_complete":
      return markToday(intent.habitName, "completed");
    case "mark_skipped":
      return markToday(intent.habitName, "skipped");
    case "set_reminder":
      return setReminder(intent.habitName, intent.time);
    default:
      return {
        text: "I didn't catch that. Try: \"What is my workout today?\", \"Mark gym complete.\", or \"Remind me to read at 8pm.\"",
        ok: false,
      };
  }
}

async function showPlanToday(): Promise<CommandReply> {
  const user = await getLocalUser();
  const habits = await getHabits(user.id);

  const today = todayKey();
  const scheduled = habits
    .filter((habit) => isScheduledOn(habit, today))
    .sort((a, b) => a.preferredTime.localeCompare(b.preferredTime));

  if (scheduled.length === 0) {
    return {
      text: "Nothing is scheduled today. Rest is part of the rhythm, so enjoy it.",
      ok: true,
    };
  }

  const lines = scheduled.map(
    (habit) => `- ${habit.title} at ${formatTime(habit.preferredTime)}`,
  );

  return {
    text: `Today's plan (${scheduled.length} scheduled):\n${lines.join("\n")}`,
    ok: true,
  };
}

async function showProgress(): Promise<CommandReply> {
  const user = await getLocalUser();
  const [habits, completions] = await Promise.all([
    getHabits(user.id),
    getCompletions(user.id),
  ]);

  const today = todayKey();
  const scheduledToday = habits.filter((habit) => isScheduledOn(habit, today));
  const doneToday = scheduledToday.filter(
    (habit) =>
      completions.some(
        (item) =>
          item.habitId === habit.id &&
          item.date === today &&
          item.status === "completed",
      ),
  ).length;

  const week = weeklyConsistency(habits, completions);

  if (scheduledToday.length === 0) {
    return {
      text: `You've kept a ${week}% rhythm over the last 7 days. Nothing is scheduled today.`,
      ok: true,
    };
  }

  return {
    text: `You've completed ${doneToday} of ${scheduledToday.length} scheduled habits today. Your 7-day consistency is ${week}%.`,
    ok: true,
  };
}

async function markToday(
  habitName: string | null,
  status: "completed" | "skipped",
): Promise<CommandReply> {
  if (!habitName) {
    return {
      text: `Which habit should I log as ${status}?`,
      ok: false,
    };
  }

  const user = await getLocalUser();
  const habits = await getHabits(user.id);
  const habit = matchHabit(habits, habitName);

  if (!habit) {
    const candidates = habits.slice(0, 4).map((item) => `- ${item.title}`);
    return {
      text: `I couldn't find a habit called "${habitName}".\nYour habits:\n${candidates.join("\n")}`,
      ok: false,
    };
  }

  await logHabit({
    userId: user.id,
    habitId: habit.id,
    date: todayKey(),
    status,
  });

  return {
    text:
      status === "completed"
        ? `Logged "${habit.title}" as complete for today.`
        : `Logged "${habit.title}" as skipped. I've noted it so the coach can learn.`,
    ok: true,
    changed: true,
  };
}

async function setReminder(habitName: string, time: string): Promise<CommandReply> {
  const cleaned = habitName.trim();
  if (!cleaned) {
    return { text: "What should I remind you about, and at what time?", ok: false };
  }

  const user = await getLocalUser();
  const habits = await getHabits(user.id);
  const habit = matchHabit(habits, cleaned);

  if (habit) {
    await updateHabitPreferredTime(user.id, habit.id, time);
    await syncAllReminders().catch(() => undefined);
    return {
      text: `Done — I'll remind you about "${habit.title}" at ${formatTime(time)}.`,
      ok: true,
      changed: true,
    };
  }

  const goals = await getGoals(user.id);
  const goalId = goals.at(-1)?.id ?? null;

  const created = await createHabit({
    userId: user.id,
    goalId,
    title: capitalize(cleaned),
    why: null,
    consequence: null,
    isImportant: false,
    frequencyPerWeek: 7,
    daysOfWeek: JSON.stringify(defaultDaysForFrequency(7)),
    preferredTime: time,
    difficulty: "easy",
  });

  await syncAllReminders().catch(() => undefined);

  return {
    text: `I set up a daily reminder: "${created.title}" at ${formatTime(time)}. If reminders are off, switch on Nudges on the Today screen.`,
    ok: true,
    changed: true,
  };
}

function matchHabit(habits: LocalHabit[], name: string): LocalHabit | null {
  const normalized = name.toLowerCase().trim();
  return (
    habits.find((habit) => habit.title.toLowerCase() === normalized) ??
    habits.find((habit) => habit.title.toLowerCase().includes(normalized)) ??
    null
  );
}

function isScheduledOn(habit: LocalHabit, key: string): boolean {
  const weekday = parseDateKey(key).getDay();
  return parseDaysOfWeek(habit.daysOfWeek).includes(weekday);
}

function weeklyConsistency(
  habits: LocalHabit[],
  completions: LocalCompletion[],
): number {
  const active = habits.filter((habit) => habit.isActive);
  if (active.length === 0) return 0;

  const today = new Date();
  let scheduled = 0;
  let completed = 0;

  for (const habit of active) {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);

      const weekday = date.getDay();
      if (!parseDaysOfWeek(habit.daysOfWeek).includes(weekday)) continue;

      scheduled += 1;
      const key = todayKey(date);

      if (
        completions.some(
          (item) =>
            item.habitId === habit.id &&
            item.date === key &&
            item.status === "completed",
        )
      ) {
        completed += 1;
      }
    }
  }

  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

function capitalize(input: string): string {
  return input.length === 0 ? input : input[0]!.toUpperCase() + input.slice(1);
}