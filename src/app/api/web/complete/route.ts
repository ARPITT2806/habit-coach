import { z } from "zod";

import { logHabit } from "@/lib/actions/habits";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-token";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * Web check-in write. POST-only so the static-export Android build skips it
 * (same convention as /api/web/today and /api/coach/*) — this keeps "use
 * server" modules out of the client bundle entirely.
 *
 * Thin delegation to the existing session-scoped logHabit server action:
 * ownership, validation, and idempotent upsert all live there and are reused
 * verbatim. Only "completed" is exposed here (skip/miss need reasons and stay
 * native-only for this phase). Identity comes ONLY from the httpOnly session
 * cookie; the habit id is verified against the authenticated user server-side.
 */

const bodySchema = z.object({
  habitId: z.string().min(1).max(128),
});

function withCors(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeadersFor(request), "Cache-Control": "no-store" },
  });
}

function sessionTokenFrom(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== SESSION_COOKIE_NAME) continue;
    // JWTs are URL-safe, so the raw value verifies as-is.
    const value = part.slice(index + 1).trim();
    return value || null;
  }
  return null;
}

export async function OPTIONS(request: Request) {
  const preflight = corsPreflightResponse(request);
  if (preflight) return preflight;
  return withCors(request, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
}

export async function POST(request: Request) {
  const preflight = corsPreflightResponse(request);
  if (preflight) return preflight;

  const token = sessionTokenFrom(request);
  if (!token) {
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }
  const session = await readSessionToken(token).catch(() => null);
  if (!session) {
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return withCors(request, { ok: false, code: "BAD_REQUEST", error: "Invalid JSON body." }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(request, { ok: false, code: "BAD_REQUEST", error: "Malformed request." }, 400);
  }

  // Delegate: logHabit re-verifies the session from the cookie, checks habit
  // ownership (id + userId), and upserts idempotently on @@unique(habitId, date).
  try {
    const formData = new FormData();
    formData.set("habitId", parsed.data.habitId);
    formData.set("status", "completed");
    const result = await logHabit({}, formData);
    if (result?.error) {
      return withCors(request, { ok: false, code: "BAD_REQUEST", error: result.error }, 400);
    }
    return withCors(request, { ok: true });
  } catch {
    return withCors(
      request,
      { ok: false, code: "UPSTREAM_ERROR", error: "Could not save that check-in." },
      503,
    );
  }
}
