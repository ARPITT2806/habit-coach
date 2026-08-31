import type { Habit, HabitCompletion } from "@prisma/client";
import {
  comparableTimeBuckets,
  hasEnoughPatternData,
  mostCommonFailureReason,
  timeBucketPerformance,
  windowStats,
  type HabitWithLogs,
} from "./behavior";
import { defaultDaysForFrequency } from "./constants";
import { formatTime } from "./dates";

export type RecommendationDraft = {
  habitId: string;
  type: "time" | "frequency" | "difficulty";
  title: string;
  rationale: string;
  evidence: Record<string, unknown>;
  payload: Record<string, unknown>;
};

function suggestedMorningTime(preferredTime: string): string {
  const [hours] = preferredTime.split(":").map(Number);
  if (!hours || hours <= 8) return "08:00";
  return "08:00";
}

export function buildRecommendations(
  habits: HabitWithLogs[],
  allLogs: HabitCompletion[],
): RecommendationDraft[] {
  if (!hasEnoughPatternData(allLogs)) return [];

  const drafts: RecommendationDraft[] = [];

  const buckets = comparableTimeBuckets(timeBucketPerformance(allLogs));
  const morning = buckets.find((item) => item.bucket === "morning");
  const evening = buckets.find((item) => item.bucket === "evening");
  if (morning && evening && morning.rate - evening.rate >= 25) {
    const eveningHabits = habits.filter((habit) => {
      const [hour] = habit.preferredTime.split(":").map(Number);
      return (hour ?? 0) >= 17;
    });
    for (const habit of eveningHabits) {
      const nextTime = suggestedMorningTime(habit.preferredTime);
      drafts.push({
        habitId: habit.id,
        type: "time",
        title: `Move ${habit.title} to ${formatTime(nextTime)}`,
        rationale: `You completed habits ${morning.completed} of ${morning.total} times in the morning (${morning.rate}%), versus ${evening.completed} of ${evening.total} in the evening (${evening.rate}%).`,
        evidence: { morning, evening, habitTitle: habit.title },
        payload: { preferredTime: nextTime },
      });
    }
  }

  for (const habit of habits) {
    const stats30 = windowStats(habit, habit.completions, 30);
    const reason = mostCommonFailureReason(habit.completions);
    if (stats30.scheduled < 6) continue;

    if (stats30.rate <= 50 && habit.frequencyPerWeek >= 4) {
      const nextFrequency = Math.max(2, habit.frequencyPerWeek - 1);
      drafts.push({
        habitId: habit.id,
        type: "frequency",
        title: `Reduce ${habit.title} to ${nextFrequency} days a week`,
        rationale: `Over the last 30 days, ${habit.title} was completed ${stats30.completed} of ${stats30.completed + stats30.skipped + stats30.failed} logged days (${stats30.rate}%). A lighter cadence is more likely to stick.`,
        evidence: { stats30, habitTitle: habit.title },
        payload: {
          frequencyPerWeek: nextFrequency,
          daysOfWeek: defaultDaysForFrequency(nextFrequency),
        },
      });
    }

    if (
      reason &&
      reason.id === "too_difficult" &&
      reason.count >= 3 &&
      habit.difficulty !== "easy"
    ) {
      const next = habit.difficulty === "hard" ? "medium" : "easy";
      drafts.push({
        habitId: habit.id,
        type: "difficulty",
        title: `Lower the difficulty of ${habit.title}`,
        rationale: `"Too difficult" was logged ${reason.count} times for ${habit.title}. Making the habit easier can restore consistency before you scale back up.`,
        evidence: { reason, habitTitle: habit.title, current: habit.difficulty },
        payload: { difficulty: next },
      });
    }
  }

  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = `${draft.habitId}:${draft.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyPayload(habit: Habit, payload: Record<string, unknown>): Partial<Habit> {
  const next: Partial<Habit> = {};
  if (typeof payload.preferredTime === "string") next.preferredTime = payload.preferredTime;
  if (typeof payload.frequencyPerWeek === "number") next.frequencyPerWeek = payload.frequencyPerWeek;
  if (Array.isArray(payload.daysOfWeek)) next.daysOfWeek = JSON.stringify(payload.daysOfWeek);
  if (typeof payload.difficulty === "string") next.difficulty = payload.difficulty;
  if (typeof payload.targetDurationMin === "number") next.targetDurationMin = payload.targetDurationMin;
  if (typeof payload.targetQuantity === "number") next.targetQuantity = payload.targetQuantity;
  return next;
}
