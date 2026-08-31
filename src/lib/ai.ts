import OpenAI from "openai";
import type { CheckIn, Goal, HabitCompletion } from "@prisma/client";
import {
  checkInAverage,
  comparableTimeBuckets,
  hasEnoughPatternData,
  habitPerformance,
  mostCommonFailureReason,
  overallConsistency,
  recentTrend,
  timeBucketPerformance,
  type HabitWithLogs,
} from "./behavior";

export type CoachObservation = {
  kind: "observation" | "insufficient_data";
  content: string;
  evidence: Record<string, unknown>;
};

function deterministicObservation(facts: Record<string, unknown>): CoachObservation {
  if (facts.insufficient) {
    return {
      kind: "insufficient_data",
      content:
        "I don't have enough data yet to identify a pattern. Keep tracking for a few more days.",
      evidence: facts,
    };
  }

  const lines: string[] = [];
  const time = facts.time as
    | { bucket: string; completed: number; total: number; rate: number }
    | undefined;
  const weak = facts.weakest as { title: string; rate: number } | undefined;
  const strong = facts.strongest as { title: string; rate: number } | undefined;
  const failure = facts.failure as { label: string; count: number } | undefined;
  const trend = facts.trend as { recent: number; previous: number; direction: string } | undefined;

  if (time) {
    lines.push(
      `Your completion rate is highest in the ${time.bucket} (${time.completed} of ${time.total}, ${time.rate}%).`,
    );
  }
  if (strong && weak && strong.title !== weak.title) {
    lines.push(
      `${strong.title} is currently strongest at ${strong.rate}%. ${weak.title} is weakest at ${weak.rate}%.`,
    );
  }
  if (failure) {
    lines.push(`The most common reason for missed habits is "${failure.label}" (${failure.count} times).`);
  }
  if (trend && trend.direction !== "flat") {
    lines.push(
      `This week's consistency is ${trend.recent}%, compared with ${trend.previous}% the week before.`,
    );
  }

  if (lines.length === 0) {
    return {
      kind: "insufficient_data",
      content:
        "I can see your tracking, but there isn't a stable pattern yet. Keep logging completions and reasons.",
      evidence: facts,
    };
  }

  return {
    kind: "observation",
    content: lines.join(" "),
    evidence: facts,
  };
}

export function collectFacts(input: {
  goals: Goal[];
  habits: HabitWithLogs[];
  logs: HabitCompletion[];
  checkIns: CheckIn[];
}): Record<string, unknown> {
  const { goals, habits, logs, checkIns } = input;
  if (!hasEnoughPatternData(logs)) {
    return {
      insufficient: true,
      logCount: logs.length,
      needed: 8,
      goals: goals.map((goal) => goal.title),
    };
  }

  const consistency7 = overallConsistency(habits, 7);
  const consistency30 = overallConsistency(habits, 30);
  const performance = habitPerformance(habits);
  const strongest = [...performance].sort((a, b) => b.days30.rate - a.days30.rate)[0];
  const weakest = [...performance].sort((a, b) => a.days30.rate - b.days30.rate)[0];
  const buckets = comparableTimeBuckets(timeBucketPerformance(logs));
  const bestTime = [...buckets].sort((a, b) => b.rate - a.rate)[0];
  const failure = mostCommonFailureReason(logs);
  const trend = recentTrend(habits);
  const mood = checkInAverage(checkIns, 7);

  return {
    insufficient: false,
    goals: goals.map((goal) => goal.title),
    consistency7,
    consistency30,
    strongest: strongest
      ? { title: strongest.habit.title, rate: strongest.days30.rate, completed: strongest.days30.completed }
      : null,
    weakest: weakest
      ? { title: weakest.habit.title, rate: weakest.days30.rate, completed: weakest.days30.completed }
      : null,
    time: bestTime ?? null,
    buckets,
    failure,
    trend,
    mood7: mood,
  };
}

export async function generateCoachCopy(facts: Record<string, unknown>): Promise<CoachObservation> {
  const fallback = deterministicObservation(facts);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || facts.insufficient) return fallback;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a calm habit coach. Use only the JSON facts provided. Never invent counts, times, or reasons. Write 2-3 short sentences. No hype, no emojis, no guarantees.",
        },
        {
          role: "user",
          content: JSON.stringify(facts),
        },
      ],
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return fallback;
    return { kind: "observation", content, evidence: facts };
  } catch {
    return fallback;
  }
}
