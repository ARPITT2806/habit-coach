import { z } from "zod";

import { submitCheckIn } from "@/lib/actions/checkin";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-token";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * Web daily check-in write. POST-only so the static-export Android build skips
 * it (same convention as the other /api/web/* routes) — this keeps "use
 * server" modules out of the client bundle entirely.
 *
 * Thin delegation to the existing session-scoped submitCheckIn server action:
 * mood/blocker validation and the one-check-in-per-user-day upsert all live
 * there and are reused verbatim. Identity comes ONLY from the httpOnly
 * session cookie; no userId parameter exists.
 */

const bodySchema = z.object({
  mood: z.number().int().min(1).max(5),
  blocker: z.string().max(160).optional(),
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
    return withCors(request, { ok: false, code: "BAD_REQUEST", error: "Choose a rating from 1 to 5." }, 400);
  }

  // Delegate: submitCheckIn re-verifies the session from the cookie, validates
  // mood/blocker, and upserts on @@unique(userId, date) — one row per user/day.
  try {
    const formData = new FormData();
    formData.set("mood", String(parsed.data.mood));
    if (parsed.data.blocker !== undefined) formData.set("blocker", parsed.data.blocker);
    const result = await submitCheckIn({}, formData);
    if (result?.error) {
      return withCors(request, { ok: false, code: "BAD_REQUEST", error: result.error }, 400);
    }
    return withCors(request, { ok: true });
  } catch {
    return withCors(
      request,
      { ok: false, code: "UPSTREAM_ERROR", error: "Could not save check-in." },
      503,
    );
  }
}
