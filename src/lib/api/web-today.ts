import type { LocalCheckIn, LocalCompletion, LocalGoal, LocalHabit } from "@/lib/local/habits";
import type { LocalUser } from "@/lib/local/session";

/**
 * Read-only web data transport. Same-origin POST to /api/web/today — the
 * browser attaches the httpOnly session cookie automatically, so no token or
 * userId ever appears in client code. Payload shapes mirror the local layer
 * types, letting pages reuse existing UI logic unchanged.
 */

export type WebTodayData = {
  user: LocalUser;
  goals: LocalGoal[];
  habits: LocalHabit[];
  completions: LocalCompletion[];
  checkIns: LocalCheckIn[];
  date: string;
};

export type WebTodayResult =
  | { ok: true; data: WebTodayData }
  | {
      ok: false;
      code: "UNAUTHORIZED" | "UPSTREAM_ERROR" | "OFFLINE" | "TIMEOUT";
      error: string;
    };

export const WEB_TODAY_TIMEOUT_MS = 30_000;

export type CompleteHabitResult =
  | { ok: true }
  | {
      ok: false;
      code: "UNAUTHORIZED" | "BAD_REQUEST" | "UPSTREAM_ERROR" | "OFFLINE" | "TIMEOUT";
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Validate the server payload shape before it reaches page state. */
function parseData(value: unknown): WebTodayData | null {
  if (!isRecord(value)) return null;
  const { user, goals, habits, completions, checkIns, date } = value as {
    user?: unknown;
    goals?: unknown;
    habits?: unknown;
    completions?: unknown;
    checkIns?: unknown;
    date?: unknown;
  };
  if (!isRecord(user) || typeof user.id !== "string" || typeof user.email !== "string") return null;
  if (!asStringArray(goals) || !asStringArray(habits) || !asStringArray(completions)) return null;
  if (!asStringArray(checkIns) || typeof date !== "string") return null;
  for (const habit of habits) {
    if (!isRecord(habit) || typeof habit.id !== "string" || typeof habit.title !== "string") {
      return null;
    }
  }
  return value as WebTodayData;
}

export async function fetchTodayData(
  timeoutMs: number = WEB_TODAY_TIMEOUT_MS,
): Promise<WebTodayResult> {  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch("/api/web/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
  } catch (err) {
    window.clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        code: "TIMEOUT",
        error: "Loading is taking too long. Check your connection and retry.",
      };
    }
    return {
      ok: false,
      code: "OFFLINE",
      error: "Could not reach the Habitiva server. Check your connection.",
    };
  }
  window.clearTimeout(timer);

  if (response.status === 401) {
    return { ok: false, code: "UNAUTHORIZED", error: "Please sign in to see your data." };
  }

  let payload: { ok?: unknown; data?: unknown } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { ok: false, code: "UPSTREAM_ERROR", error: "Today is temporarily unavailable." };
  }

  if (response.ok && payload.ok === true) {
    const data = parseData(payload.data);
    if (data) return { ok: true, data };
  }
  return { ok: false, code: "UPSTREAM_ERROR", error: "Today is temporarily unavailable." };
}

export type HabitOutcome = {
  status: "completed" | "skipped" | "failed";
  reason?: string;
  reasonOther?: string;
};

/**
 * Web habit-outcome write (completed / skipped / failed). Same-origin POST —
 * the session cookie identifies the user server-side; only the habit id,
 * status, and reason travel in the body, with ownership and reason validity
 * verified there. The server upserts idempotently, so retries and double
 * clicks cannot create duplicates.
 */
export async function completeHabit(
  habitId: string,
  outcome: HabitOutcome = { status: "completed" },
  timeoutMs: number = WEB_TODAY_TIMEOUT_MS,
): Promise<CompleteHabitResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch("/api/web/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        habitId,
        status: outcome.status,
        ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
        ...(outcome.reasonOther !== undefined ? { reasonOther: outcome.reasonOther } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    window.clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        code: "TIMEOUT",
        error: "Saving is taking too long. Check your connection and retry.",
      };
    }
    return {
      ok: false,
      code: "OFFLINE",
      error: "Could not reach the Habitiva server. Check your connection.",
    };
  }
  window.clearTimeout(timer);

  if (response.status === 401) {
    return { ok: false, code: "UNAUTHORIZED", error: "Please sign in to log habits." };
  }

  let payload: { ok?: unknown; error?: unknown; code?: unknown } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { ok: false, code: "UPSTREAM_ERROR", error: "Could not save that check-in." };
  }

  if (response.ok && payload.ok === true) return { ok: true };
  if (response.status === 400) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      error: typeof payload.error === "string" && payload.error ? payload.error : "Could not save that check-in.",
    };
  }
  return { ok: false, code: "UPSTREAM_ERROR", error: "Could not save that check-in." };
}
