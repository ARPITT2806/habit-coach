import type { Habit, HabitCompletion, CheckIn } from "@prisma/client";
import {
  MIN_BUCKET_FOR_COMPARE,
  MIN_EVENTS_FOR_PATTERN,
  parseDaysOfWeek,
  reasonLabel,
} from "./constants";
import { dateKeysInclusive, percent, timeBucket, todayKey } from "./dates";

export type HabitWithLogs = Habit & { completions: HabitCompletion[] };

export type ConsistencyWindow = {
  scheduled: number;
  completed: number;
  skipped: number;
  failed: number;
  pending: number;
  rate: number;
};

function isScheduled(habit: Habit, dateKey: string) {
  const days = parseDaysOfWeek(habit.daysOfWeek);
  const weekday = new Date(`${dateKey}T12:00:00`).getDay();
  return days.includes(weekday);
}

export function scheduledDates(habit: Habit, keys: string[]): string[] {
  return keys.filter((key) => isScheduled(habit, key));
}

export function windowStats(
  habit: Habit,
  logs: HabitCompletion[],
  days: number,
  end = todayKey(),
): ConsistencyWindow {
  const keys = dateKeysInclusive(end, days);
  const scheduled = scheduledDates(habit, keys);
  const byDate = new Map(logs.map((log) => [log.date, log]));
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let pending = 0;

  for (const key of scheduled) {
    const log = byDate.get(key);
    if (!log) {
      if (key === end) pending += 1;
      else failed += 1;
      continue;
    }
    if (log.status === "completed") completed += 1;
    else if (log.status === "skipped") skipped += 1;
    else failed += 1;
  }

  const resolved = completed + skipped + failed;
  return {
    scheduled: scheduled.length,
    completed,
    skipped,
    failed,
    pending,
    rate: percent(completed, resolved),
  };
}

export function overallConsistency(
  habits: HabitWithLogs[],
  days: number,
  end = todayKey(),
): ConsistencyWindow {
  const empty: ConsistencyWindow = {
    scheduled: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    pending: 0,
    rate: 0,
  };
  return habits.reduce((acc, habit) => {
    const stats = windowStats(habit, habit.completions, days, end);
    const scheduled = acc.scheduled + stats.scheduled;
    const completed = acc.completed + stats.completed;
    const skipped = acc.skipped + stats.skipped;
    const failed = acc.failed + stats.failed;
    const pending = acc.pending + stats.pending;
    const resolved = completed + skipped + failed;
    return {
      scheduled,
      completed,
      skipped,
      failed,
      pending,
      rate: percent(completed, resolved),
    };
  }, empty);
}

export type HabitPerformance = {
  habit: Habit;
  days7: ConsistencyWindow;
  days30: ConsistencyWindow;
};

export function habitPerformance(habits: HabitWithLogs[]): HabitPerformance[] {
  return habits.map((habit) => ({
    habit,
    days7: windowStats(habit, habit.completions, 7),
    days30: windowStats(habit, habit.completions, 30),
  }));
}

export type TimeBucketStats = {
  bucket: "morning" | "afternoon" | "evening";
  completed: number;
  total: number;
  rate: number;
};

export function timeBucketPerformance(logs: HabitCompletion[]): TimeBucketStats[] {
  const buckets: Record<"morning" | "afternoon" | "evening", { completed: number; total: number }> = {
    morning: { completed: 0, total: 0 },
    afternoon: { completed: 0, total: 0 },
    evening: { completed: 0, total: 0 },
  };

  for (const log of logs) {
    const time = log.preferredTimeAtLog;
    if (!time) continue;
    const bucket = timeBucket(time);
    if (!bucket) continue;
    buckets[bucket].total += 1;
    if (log.status === "completed") buckets[bucket].completed += 1;
  }

  return (Object.keys(buckets) as Array<TimeBucketStats["bucket"]>).map((bucket) => ({
    bucket,
    completed: buckets[bucket].completed,
    total: buckets[bucket].total,
    rate: percent(buckets[bucket].completed, buckets[bucket].total),
  }));
}

export function mostCommonFailureReason(logs: HabitCompletion[]): {
  id: string;
  label: string;
  count: number;
} | null {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (log.status === "completed" || !log.reason) continue;
    counts.set(log.reason, (counts.get(log.reason) ?? 0) + 1);
  }
  let best: { id: string; count: number } | null = null;
  for (const [id, count] of counts) {
    if (!best || count > best.count) best = { id, count };
  }
  if (!best) return null;
  return { id: best.id, label: reasonLabel(best.id), count: best.count };
}

export function recentTrend(habits: HabitWithLogs[]): {
  recent: number;
  previous: number;
  direction: "up" | "down" | "flat";
} | null {
  const end = todayKey();
  const recent = overallConsistency(habits, 7, end);
  const previousEnd = dateKeysInclusive(end, 8)[0];
  if (!previousEnd) return null;
  const previous = overallConsistency(habits, 7, previousEnd);
  if (recent.scheduled < 3 || previous.scheduled < 3) return null;
  const delta = recent.rate - previous.rate;
  return {
    recent: recent.rate,
    previous: previous.rate,
    direction: delta >= 8 ? "up" : delta <= -8 ? "down" : "flat",
  };
}

export function hasEnoughPatternData(logs: HabitCompletion[]): boolean {
  return logs.length >= MIN_EVENTS_FOR_PATTERN;
}

export function comparableTimeBuckets(stats: TimeBucketStats[]) {
  return stats.filter((item) => item.total >= MIN_BUCKET_FOR_COMPARE);
}

export function checkInAverage(checkIns: CheckIn[], days: number): number | null {
  const keys = new Set(dateKeysInclusive(todayKey(), days));
  const recent = checkIns.filter((item) => keys.has(item.date));
  if (recent.length === 0) return null;
  const sum = recent.reduce((acc, item) => acc + item.mood, 0);
  return Math.round((sum / recent.length) * 10) / 10;
}
