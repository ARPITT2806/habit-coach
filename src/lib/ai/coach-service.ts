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

export type PersistedMessage = {
  role: "user" | "coach";
  content: string;
  createdAt: Date;
};

export type CoachStore = {
  verifyToken(token: string): Promise<{ id: string; email: string } | null>;
  loadUser(userId: string): Promise<{ id: string; aiConsentAt: Date | null } | null>;
  loadHabits(userId: string): Promise<HabitRow[]>;
  loadCompletions(userId: string): Promise<CompletionRow[]>;
  getUsage(userId: string, windowType: "hour" | "day", windowStart: Date): Promise<number>;
  addUsage(userId: string, windowType: "hour" | "day", windowStart: Date): Promise<void>;
  /**
   * Resolve the user's single Coach conversation, creating it on first use.
   * Keyed ONLY by the authenticated userId — callers never supply an id,
   * so one user can never address another user's conversation.
   */
  ensureConversation(userId: string): Promise<{ id: string }>;
  /** Newest-last, bounded by `limit`. Roles outside user/coach are dropped. */
  loadRecentMessages(conversationId: string, limit: number): Promise<PersistedMessage[]>;
  saveMessage(conversationId: string, role: "user" | "coach", content: string): Promise<void>;
};

export type CoachLimits = {
  perHour: number;
  perDay: number;
};

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_TURNS = 10;
/** AI context window: the last N persisted messages (pairs of user/coach turns). */
export const CONTEXT_MESSAGE_LIMIT = MAX_HISTORY_TURNS * 2;
/** Display/restore window for the history endpoint: bounded, never unbounded. */
export const HISTORY_DISPLAY_LIMIT = 100;
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

/**
 * One persisted Coach turn. History is loaded from the store (keyed ONLY by
 * the authenticated userId) — the client never supplies conversation content
 * for context, so it cannot forge, read, or pollute another user's history.
 *
 * Habit context comes from Prisma by default. Native clients (whose habits
 * live in on-device SQLite) may instead supply their own already-minimal
 * rows via `clientData`: the route validates them with the same schemas as
 * the dev action, all statistics are still recomputed server-side, and the
 * payload carries no ids or user info — only titles, schedules, and
 * statuses. Identity, consent, rate limits, and persistence always come from
 * the verified token, never from the client.
 */
export async function runCoachTurn(
  store: CoachStore,
  limits: CoachLimits,
  authHeader: string | null,
  message: unknown,
  callModel: (
    context: Parameters<typeof chatWithCoach>[0],
    text: string,
    turns: ChatTurn[],
  ) => Promise<ChatOutcome> = chatWithCoach,
  nowMs: number = Date.now(),
  clientData?: {
    habits: CoachHabitInput[];
    completions: CoachCompletionInput[];
  } | null,
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
  const cleanMessage = message.trim().slice(0, MAX_MESSAGE_CHARS);

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

  const [habitRows, completionRows, conversation] = await Promise.all([
    clientData && clientData.habits.length > 0 ? [] : store.loadHabits(userId),
    clientData && clientData.habits.length > 0 ? [] : store.loadCompletions(userId),
    store.ensureConversation(userId),
  ]);

  // Server-side history: the model's context comes from persisted messages
  // only — bounded, chronological, and impossible to forge from the client.
  const persisted = await store.loadRecentMessages(conversation.id, CONTEXT_MESSAGE_LIMIT);
  const turns: ChatTurn[] = [];
  for (const row of persisted) {
    if ((row.role === "user" || row.role === "coach") && row.content.length > 0) {
      turns.push({ role: row.role, content: row.content.slice(0, MAX_TURN_CHARS) });
    }
  }

  await store.saveMessage(conversation.id, "user", cleanMessage);

  const indexById = new Map(habitRows.map((habit, index) => [habit.id, index]));
  // Device-supplied rows arrive pre-shaped (validated at the route boundary);
  // server rows are mapped to the identical minimal input shape.
  const habitInputs: CoachHabitInput[] =
    clientData && clientData.habits.length > 0
      ? clientData.habits
      : habitRows.map((habit) => ({
          title: habit.title,
          frequencyPerWeek: habit.frequencyPerWeek,
          daysOfWeek: habit.daysOfWeek,
          preferredTime: habit.preferredTime,
          difficulty: habit.difficulty,
        }));
  const completionInputs: CoachCompletionInput[] = [];
  if (clientData && clientData.habits.length > 0) {
    for (const log of clientData.completions) {
      if (
        Number.isInteger(log.habit) &&
        log.habit >= 0 &&
        log.habit < habitInputs.length &&
        typeof log.date === "string" &&
        typeof log.status === "string"
      ) {
        completionInputs.push({ habit: log.habit, date: log.date, status: log.status });
      }
    }
  } else {
    for (const log of completionRows) {
      const index = indexById.get(log.habitId);
      if (index === undefined) continue;
      completionInputs.push({ habit: index, date: log.date, status: log.status });
    }
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

  const outcome = await callModel(context, cleanMessage, turns);
  if (!outcome.ok) {
    return { ok: false, code: "UPSTREAM_ERROR", error: friendlyUpstreamError(outcome.error) };
  }
  await store.saveMessage(conversation.id, "coach", outcome.reply);
  return {
    ok: true,
    message: outcome.reply,
    usage: { model: outcome.model, latencyMs: outcome.latencyMs },
  };
}
