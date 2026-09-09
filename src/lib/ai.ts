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

/* ---------- OpenAI Configuration ---------- */

interface OpenAIConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  maxRequestsPerUserPerDay: number;
  maxRequestsPerUserPerHour: number;
  cacheTTLMinutes: number;
}

function getOpenAIConfig(): OpenAIConfig {
  return {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: Number(process.env.OPENAI_TEMPERATURE ?? "0.2"),
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? "200"),
    maxRequestsPerUserPerDay: Number(process.env.OPENAI_MAX_DAILY_REQUESTS ?? "50"),
    maxRequestsPerUserPerHour: Number(process.env.OPENAI_MAX_HOURLY_REQUESTS ?? "10"),
    cacheTTLMinutes: Number(process.env.OPENAI_CACHE_TTL_MINUTES ?? "60"),
  };
}

/* ---------- Simple in-memory rate limiting & caching ---------- */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface CacheEntry {
  observation: CoachObservation;
  expiresAt: number;
}

const userRateLimits = new Map<string, RateLimitEntry>();
const userCaches = new Map<string, CacheEntry>();

/** In-memory maps must stay bounded on long-lived servers. */
function boundMaps(): void {
  if (userRateLimits.size > 2000) userRateLimits.clear();
  if (userCaches.size > 2000) {
    const now = Date.now();
    for (const [key, entry] of userCaches) {
      if (now >= entry.expiresAt) userCaches.delete(key);
    }
    if (userCaches.size > 2000) userCaches.clear();
  }
}

function checkRateLimit(userId: string, config: OpenAIConfig): { allowed: boolean; retryAfterMs?: number } {
  boundMaps();
  const now = Date.now();
  const entry = userRateLimits.get(userId);

  // Daily limit
  if (entry) {
    if (now > entry.resetAt) {
      // Reset daily counter
      entry.count = 0;
      entry.resetAt = now + 24 * 60 * 60 * 1000;
    }
    if (entry.count >= config.maxRequestsPerUserPerDay) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }
  } else {
    userRateLimits.set(userId, { count: 0, resetAt: now + 24 * 60 * 60 * 1000 });
  }

  // Hourly limit (simplified - using same counter with hourly check)
  const hourlyEntry = userRateLimits.get(`${userId}:hourly`);
  if (hourlyEntry) {
    if (now > hourlyEntry.resetAt) {
      hourlyEntry.count = 0;
      hourlyEntry.resetAt = now + 60 * 60 * 1000;
    }
    if (hourlyEntry.count >= config.maxRequestsPerUserPerHour) {
      return { allowed: false, retryAfterMs: hourlyEntry.resetAt - now };
    }
  } else {
    userRateLimits.set(`${userId}:hourly`, { count: 0, resetAt: now + 60 * 60 * 1000 });
  }

  return { allowed: true };
}

function incrementRateLimit(userId: string) {
  const entry = userRateLimits.get(userId);
  if (entry) entry.count += 1;
  const hourlyEntry = userRateLimits.get(`${userId}:hourly`);
  if (hourlyEntry) hourlyEntry.count += 1;
}

function getCachedObservation(userId: string, factsHash: string, config: OpenAIConfig): CoachObservation | null {
  const cacheKey = `${userId}:${factsHash}`;
  const entry = userCaches.get(cacheKey);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.observation;
  }
  return null;
}

function setCachedObservation(userId: string, factsHash: string, observation: CoachObservation, config: OpenAIConfig) {
  const cacheKey = `${userId}:${factsHash}`;
  userCaches.set(cacheKey, {
    observation,
    expiresAt: Date.now() + config.cacheTTLMinutes * 60 * 1000,
  });
}

function hashFacts(facts: Record<string, unknown>): string {
  // Simple deterministic hash of the facts object
  const str = JSON.stringify(facts, Object.keys(facts).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/* ---------- OpenAI Integration ---------- */

export async function generateCoachCopy(
  userId: string,
  facts: Record<string, unknown>,
): Promise<CoachObservation> {
  const fallback = deterministicObservation(facts);
  const apiKey = process.env.OPENAI_API_KEY;
  const config = getOpenAIConfig();

  if (!apiKey || facts.insufficient) return fallback;

  // Check rate limit
  const rateLimit = checkRateLimit(userId, config);
  if (!rateLimit.allowed) {
    return fallback;
  }

  // Check cache
  const factsHash = hashFacts(facts);
  const cached = getCachedObservation(userId, factsHash, config);
  if (cached) return cached;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
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

    const observation: CoachObservation = { kind: "observation", content, evidence: facts };

    // Cache the result
    setCachedObservation(userId, factsHash, observation, config);

    // Increment rate limit counters
    incrementRateLimit(userId);

    return observation;
  } catch {
    return fallback;
  }
}