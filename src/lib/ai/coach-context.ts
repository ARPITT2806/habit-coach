import { todayKey as defaultTodayKey, addDays } from "../dates";

/**
 * Minimal, deliberately-shaped coaching input. These are plain app-level
 * values mapped from Habitiva's LocalHabit / LocalCompletion rows — never
 * raw database objects, never ids, user info, tokens, or free-text notes.
 */
export type CoachHabitInput = {
  title: string;
  frequencyPerWeek: number;
  /** JS weekdays (0=Sunday) parsed from the habit's daysOfWeek. */
  daysOfWeek: number[];
  preferredTime: string;
  difficulty: string;
};

export type CoachCompletionInput = {
  /** Index into the habits array sent alongside this payload. */
  habit: number;
  /** YYYY-MM-DD. */
  date: string;
  /** completed | skipped | failed (anything else counts as missed). */
  status: string;
};

export type HabitContext = {
  title: string;
  frequencyPerWeek: number;
  preferredTime: string;
  difficulty: string;
  scheduled: number;
  completed: number;
  /** Whole percent, 0-100. */
  adherence: number;
  currentStreak: number;
  /** Last 14 calendar days, oldest first: C completed, M missed, - not scheduled. */
  recentPattern: ("C" | "M" | "-")[];
};

export type CoachContext = {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  overallAdherence: number;
  totalScheduled: number;
  totalCompleted: number;
  totalEvents: number;
  habits: HabitContext[];
};

const WINDOW_DAYS = 30;
const PATTERN_DAYS = 14;

function isCompleted(status: string): boolean {
  return status === "completed";
}

function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/**
 * Build the minimal behavioral context for coaching from Habitiva's existing
 * data shapes. Pure function: no database, no network, no OpenAI.
 */
export function buildCoachContext(
  habits: CoachHabitInput[],
  completions: CoachCompletionInput[],
  today: string = defaultTodayKey(),
  windowDays: number = WINDOW_DAYS,
): CoachContext {
  const windowStart = addDays(today, -(windowDays - 1));

  const byHabit = new Map<number, Set<string>>();
  for (const log of completions) {
    if (!isCompleted(log.status)) continue;
    if (log.date < windowStart || log.date > today) continue;
    let set = byHabit.get(log.habit);
    if (!set) {
      set = new Set<string>();
      byHabit.set(log.habit, set);
    }
    set.add(log.date);
  }

  const habitContexts: HabitContext[] = habits.map((habit, index) => {
    const done = byHabit.get(index) ?? new Set<string>();
    const scheduledDays: string[] = [];
    for (let offset = 0; offset < windowDays; offset += 1) {
      const day = addDays(today, -offset);
      if (habit.daysOfWeek.includes(weekdayOf(day))) scheduledDays.push(day);
    }

    const completed = scheduledDays.filter((day) => done.has(day)).length;

    // Current streak: walk back over scheduled days; unscheduled days ignored.
    let streak = 0;
    for (let offset = 0; offset < windowDays; offset += 1) {
      const day = addDays(today, -offset);
      if (!habit.daysOfWeek.includes(weekdayOf(day))) continue;
      if (done.has(day)) {
        streak += 1;
      } else {
        break;
      }
    }

    const pattern: ("C" | "M" | "-")[] = [];
    for (let offset = PATTERN_DAYS - 1; offset >= 0; offset -= 1) {
      const day = addDays(today, -offset);
      if (!habit.daysOfWeek.includes(weekdayOf(day))) {
        pattern.push("-");
      } else {
        pattern.push(done.has(day) ? "C" : "M");
      }
    }

    return {
      title: habit.title,
      frequencyPerWeek: habit.frequencyPerWeek,
      preferredTime: habit.preferredTime,
      difficulty: habit.difficulty,
      scheduled: scheduledDays.length,
      completed,
      adherence:
        scheduledDays.length === 0
          ? 0
          : Math.round((completed / scheduledDays.length) * 100),
      currentStreak: streak,
      recentPattern: pattern,
    };
  });

  const totalScheduled = habitContexts.reduce((sum, h) => sum + h.scheduled, 0);
  const totalCompleted = habitContexts.reduce((sum, h) => sum + h.completed, 0);

  return {
    windowDays,
    windowStart,
    windowEnd: today,
    overallAdherence:
      totalScheduled === 0 ? 0 : Math.round((totalCompleted / totalScheduled) * 100),
    totalScheduled,
    totalCompleted,
    totalEvents: completions.filter((c) => c.date >= windowStart && c.date <= today).length,
    habits: habitContexts,
  };
}
