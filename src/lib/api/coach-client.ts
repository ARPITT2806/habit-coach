/**
 * Production Coach transport for native clients. Talks ONLY to the Habitiva
 * backend (never api.openai.com — no OpenAI key exists client-side). All
 * payloads are bounded before sending; the server re-validates everything.
 */

export type CoachHistoryTurn = {
  role: "user" | "coach";
  content: string;
};

export type CoachRemoteResult =
  | { ok: true; message: string; usage?: { model: string; latencyMs: number } }
  | {
      ok: false;
      code:
        | "NO_BACKEND"
        | "NO_TOKEN"
        | "UNAUTHORIZED"
        | "AI_CONSENT_REQUIRED"
        | "RATE_LIMITED"
        | "BAD_REQUEST"
        | "UPSTREAM_ERROR"
        | "OFFLINE"
        | "TIMEOUT";
      error: string;
      retryAfterMs?: number;
    };

export const COACH_TIMEOUT_MS = 60_000;
export const MAX_HISTORY_TURNS = 10;
export const MAX_TURN_CHARS = 1000;

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds, 3600) * 1000;
}

function classifyNetworkError(err: unknown): CoachRemoteResult {
  if (err instanceof DOMException && err.name === "AbortError") {
    return {
      ok: false,
      code: "TIMEOUT",
      error: "The coach is taking too long. Your message is kept — retry when ready.",
    };
  }
  return {
    ok: false,
    code: "OFFLINE",
    error: "Could not reach the Habitiva server. AI coaching needs an internet connection.",
  };
}

const CODE_MESSAGES: Record<string, string> = {
  AI_CONSENT_REQUIRED: "AI coaching needs your consent first.",
  RATE_LIMITED: "You're sending messages quickly — wait a bit, then retry.",
  BAD_REQUEST: "That message didn't come through cleanly. Try again.",
  UPSTREAM_ERROR: "The coach couldn't be reached just now. Check your connection and retry.",
};

export type CoachPayloadHabit = {
  title: string;
  frequencyPerWeek: number;
  daysOfWeek: number[];
  preferredTime: string;
  difficulty: string;
};

export type CoachPayloadCompletion = {
  habit: number;
  date: string;
  status: string;
};

export async function sendCoachTurn(
  baseUrl: string,
  token: string,
  message: string,
  history: CoachHistoryTurn[],
  timeoutMs: number = COACH_TIMEOUT_MS,
  deviceData?: {
    habits: CoachPayloadHabit[];
    completions: CoachPayloadCompletion[];
  },
): Promise<CoachRemoteResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, code: "BAD_REQUEST", error: "Message must not be empty." };
  }

  const bounded = history
    .filter(
      (turn) =>
        turn &&
        (turn.role === "user" || turn.role === "coach") &&
        typeof turn.content === "string" &&
        turn.content.length > 0,
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_TURN_CHARS) }));

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/coach/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: trimmed.slice(0, 1000),
        history: bounded,
        // Native clients ground the coach on on-device rows (validated
        // server-side, statistics recomputed there); Prisma-backed callers
        // omit this and the server loads their data instead.
        ...(deviceData && deviceData.habits.length > 0
          ? { habits: deviceData.habits, completions: deviceData.completions }
          : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    window.clearTimeout(timer);
    return classifyNetworkError(err);
  }
  window.clearTimeout(timer);

  let payload: {
    ok?: unknown;
    message?: unknown;
    code?: unknown;
    error?: unknown;
    usage?: unknown;
  } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { ok: false, code: "UPSTREAM_ERROR", error: CODE_MESSAGES.UPSTREAM_ERROR };
  }

  if (response.ok && payload.ok === true && typeof payload.message === "string") {
    const usage = payload.usage as { model?: unknown; latencyMs?: unknown } | undefined;
    return {
      ok: true,
      message: payload.message,
      usage:
        usage && typeof usage.model === "string" && typeof usage.latencyMs === "number"
          ? { model: usage.model, latencyMs: usage.latencyMs }
          : undefined,
    };
  }

  if (response.status === 401) {
    return { ok: false, code: "UNAUTHORIZED", error: "Your session expired. Please sign in again." };
  }
  if (response.status === 429) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      error: CODE_MESSAGES.RATE_LIMITED,
      retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")) ?? undefined,
    };
  }

  const code =
    payload.code === "AI_CONSENT_REQUIRED" ||
    payload.code === "RATE_LIMITED" ||
    payload.code === "BAD_REQUEST" ||
    payload.code === "UPSTREAM_ERROR"
      ? payload.code
      : "UPSTREAM_ERROR";
  const result: CoachRemoteResult = {
    ok: false,
    code,
    error:
      typeof payload.error === "string" && payload.error
        ? payload.error
        : (CODE_MESSAGES[code] ?? CODE_MESSAGES.UPSTREAM_ERROR),
  };
  if (code === "RATE_LIMITED") {
    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    if (retryAfterMs !== null) result.retryAfterMs = retryAfterMs;
  }
  return result;
}

export type CoachHistoryMessage = {
  role: "user" | "coach";
  content: string;
  createdAt: string;
};

export type CoachHistoryResult =
  | { ok: true; messages: CoachHistoryMessage[] }
  | { ok: false; code: "UNAUTHORIZED" | "UPSTREAM_ERROR" | "OFFLINE" | "TIMEOUT"; error: string };

/**
 * Restore the authenticated user's persisted Coach conversation (newest last,
 * server-bounded). Identity comes from the Bearer token only — there is no
 * conversation id to forge.
 */
export async function fetchCoachHistory(
  baseUrl: string,
  token: string,
  timeoutMs: number = COACH_TIMEOUT_MS,
): Promise<CoachHistoryResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/coach/history`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (response.status === 401) {
      return { ok: false, code: "UNAUTHORIZED", error: "Your session expired. Please sign in again." };
    }
    let payload: { ok?: unknown; messages?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      return { ok: false, code: "UPSTREAM_ERROR", error: CODE_MESSAGES.UPSTREAM_ERROR };
    }
    if (response.ok && payload.ok === true && Array.isArray(payload.messages)) {
      const messages: CoachHistoryMessage[] = [];
      for (const item of payload.messages) {
        if (
          typeof item === "object" &&
          item !== null &&
          ((item as { role?: unknown }).role === "user" ||
            (item as { role?: unknown }).role === "coach") &&
          typeof (item as { content?: unknown }).content === "string" &&
          typeof (item as { createdAt?: unknown }).createdAt === "string"
        ) {
          messages.push({
            role: (item as { role: "user" | "coach" }).role,
            content: (item as { content: string }).content.slice(0, 1000),
            createdAt: (item as { createdAt: string }).createdAt,
          });
        }
      }
      return { ok: true, messages };
    }
    return { ok: false, code: "UPSTREAM_ERROR", error: CODE_MESSAGES.UPSTREAM_ERROR };
  } catch (err) {
    window.clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        code: "TIMEOUT",
        error: "The request timed out. Nothing was lost — retry when ready.",
      };
    }
    return {
      ok: false,
      code: "OFFLINE",
      error: "Could not reach the Habitiva server. AI coaching needs an internet connection.",
    };
  }
}

export async function grantRemoteConsent(
  baseUrl: string,
  token: string,
  timeoutMs: number = COACH_TIMEOUT_MS,
): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/coach/consent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (response.ok) return { ok: true };
    if (response.status === 401) {
      return { ok: false, code: "UNAUTHORIZED", error: "Your session expired. Please sign in again." };
    }
    return { ok: false, code: "UPSTREAM_ERROR", error: CODE_MESSAGES.UPSTREAM_ERROR };
  } catch (err) {
    window.clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        code: "TIMEOUT",
        error: "The request timed out. Nothing was lost — retry when ready.",
      };
    }
    return {
      ok: false,
      code: "OFFLINE",
      error: "Could not reach the Habitiva server. AI coaching needs an internet connection.",
    };
  }
}
