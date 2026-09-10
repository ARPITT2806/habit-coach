import { buildCoachContext, type CoachCompletionInput, type CoachHabitInput } from "./coach-context";
import { chatWithCoach, type ChatOutcome, type ChatTurn } from "./coach-analysis";

/**
 * Shared production Coach core. Thin boundaries (the /api/coach/chat route,
 * the dev server action) adapt their transport/auth to this contract — the
 * OpenAI client and context builder are never duplicated.
 *
 * Imports here must stay resolvable by plain Node (relative paths only, no
 * `@/` aliases, no next/*, no Prisma) because this module is exercised
 * directly by the zero-dependency node:test suite.
 */

export type CoachApiErrorCode =
  | "UNAUTHORIZED"
  | "AI_CONSENT_REQUIRED"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "UPSTREAM_ERROR";

export type CoachApiResult =
  | {
      ok: true;
      message: string;
      usage: { model: string; latencyMs: number };
    }
  | { ok: false; code: CoachApiErrorCode; error: string; retryAfterMs?: number };

export type HabitRow = {
  id: string;
  title: string;
  frequencyPerWeek: number;
  daysOfWeek: number[];
  preferredTime: string;
  difficulty: string;
};

export type CompletionRow = {
  habitId: string;
  date: string;
  status: string;
};

export type CoachStore = {
  verifyToken(token: string): Promise<{ id: string; email: string } | null>;
  loadUser(userId: string): Promise<{ id: string; aiConsentAt: Date | null } | null>;
  loadHabits(userId: string): Promise<HabitRow[]>;
  loadCompletions(userId: string): Promise<CompletionRow[]>;
  getUsage(userId: string, windowType: "hour" | "day", windowStart: Date): Promise<number>;
  addUsage(userId: string, windowType: "hour" | "day", windowStart: Date): Promise<void>;
};

export type CoachLimits = {
  perHour: number;
  perDay: number;
};

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_TURNS = 10;
export const MAX_TURN_CHARS = 1000;

/** Strict `Authorization: Bearer <token>` parsing. Anything else → null. */
export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  const token = match[1]?.trim() ?? "";
  return token.length > 0 && token.length <= 4096 ? token : null;
}

export function hourWindowStart(nowMs: number): Date {
  const d = new Date(nowMs);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export function dayWindowStart(nowMs: number): Date {
  const d = new Date(nowMs);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function friendlyUpstreamError(message: string): string {
  if (
    message.startsWith("OPENAI_API_KEY") ||
    message.startsWith("The coach returned")
  ) {
    return message;
  }
  return "The coach couldn't be reached just now. Check your connection and retry.";
}

export async function runCoachTurn(
  store: CoachStore,
  limits: CoachLimits,
  authHeader: string | null,
  message: unknown,
  history: unknown,
  callModel: (
    context: Parameters<typeof chatWithCoach>[0],
    text: string,
    turns: ChatTurn[],
  ) => Promise<ChatOutcome> = chatWithCoach,
  nowMs: number = Date.now(),
): Promise<CoachApiResult> {
  const token = parseBearerToken(authHeader);
  if (!token) {
    return { ok: false, code: "UNAUTHORIZED", error: "Authentication required." };
  }

  const session = await store.verifyToken(token).catch(() => null);
  if (!session) {
    return { ok: false, code: "UNAUTHORIZED", error: "Invalid or expired session." };
  }

  // The authenticated user comes ONLY from the verified token.
  const userId = session.id;

  if (typeof message !== "string" || message.trim().length === 0) {
    return { ok: false, code: "BAD_REQUEST", error: "Message must not be empty." };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, code: "BAD_REQUEST", error: "Keep questions under 1000 characters." };
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) {
    return { ok: false, code: "BAD_REQUEST", error: "Conversation history is too long." };
  }
  const turns: ChatTurn[] = [];
  for (const turn of history) {
    if (typeof turn !== "object" || turn === null) {
      return { ok: false, code: "BAD_REQUEST", error: "Malformed conversation history." };
    }
    const role = (turn as { role?: unknown }).role;
    const content = (turn as { content?: unknown }).content;
    if ((role !== "user" && role !== "coach") || typeof content !== "string") {
      return { ok: false, code: "BAD_REQUEST", error: "Malformed conversation history." };
    }
    if (content.length === 0 || content.length > MAX_TURN_CHARS) {
      return { ok: false, code: "BAD_REQUEST", error: "Malformed conversation history." };
    }
    turns.push({ role, content });
  }

  const user = await store.loadUser(userId).catch(() => null);
  if (!user) {
    return { ok: false, code: "UNAUTHORIZED", error: "Account not found." };
  }

  if (!user.aiConsentAt) {
    return {
      ok: false,
      code: "AI_CONSENT_REQUIRED",
      error: "AI coaching needs your consent first. Please accept coaching consent and retry.",
    };
  }

  const hourStart = hourWindowStart(nowMs);
  const dayStart = dayWindowStart(nowMs);
  const [hourCount, dayCount] = await Promise.all([
    store.getUsage(userId, "hour", hourStart),
    store.getUsage(userId, "day", dayStart),
  ]);
  if (hourCount >= limits.perHour) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      error: "You're sending messages quickly — give the coach a bit, then retry.",
      retryAfterMs: hourStart.getTime() + 3_600_000 - nowMs,
    };
  }
  if (dayCount >= limits.perDay) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      error: "Today's coaching allowance is used up — try again tomorrow.",
      retryAfterMs: dayStart.getTime() + 86_400_000 - nowMs,
    };
  }
  await Promise.all([
    store.addUsage(userId, "hour", hourStart),
    store.addUsage(userId, "day", dayStart),
  ]);

  const [habitRows, completionRows] = await Promise.all([
    store.loadHabits(userId),
    store.loadCompletions(userId),
  ]);

  const indexById = new Map(habitRows.map((habit, index) => [habit.id, index]));
  const habitInputs: CoachHabitInput[] = habitRows.map((habit) => ({
    title: habit.title,
    frequencyPerWeek: habit.frequencyPerWeek,
    daysOfWeek: habit.daysOfWeek,
    preferredTime: habit.preferredTime,
    difficulty: habit.difficulty,
  }));
  const completionInputs: CoachCompletionInput[] = [];
  for (const log of completionRows) {
    const index = indexById.get(log.habitId);
    if (index === undefined) continue;
    completionInputs.push({ habit: index, date: log.date, status: log.status });
  }

  const context = buildCoachContext(habitInputs, completionInputs);
  if (context.habits.length === 0) {
    return {
      ok: true,
      message:
        "You don't have any active habits yet, so there's nothing for me to analyze. Add your first habit and log a few days — then ask me anything about your progress, streaks, or routine.",
      usage: { model: process.env.OPENAI_MODEL || "gpt-4o-mini", latencyMs: 0 },
    };
  }

  const outcome = await callModel(context, message, turns);
  if (!outcome.ok) {
    return { ok: false, code: "UPSTREAM_ERROR", error: friendlyUpstreamError(outcome.error) };
  }
  return {
    ok: true,
    message: outcome.reply,
    usage: { model: outcome.model, latencyMs: outcome.latencyMs },
  };
}
