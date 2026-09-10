import { z } from "zod";

import { createHabit } from "@/lib/actions/onboarding";
import { readSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-token";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * Web habit creation. POST-only so the static-export Android build skips it
 * (same convention as the other /api/web/* routes) — this keeps "use server"
 * modules out of the client bundle entirely.
 *
 * Thin delegation to the existing session-scoped createHabit server action in
 * lib/actions/onboarding: field validation, goal ensure/create semantics, and
 * habit persistence all live there and are reused verbatim. Identity comes
 * ONLY from the httpOnly session cookie; no userId parameter exists.
 *
 * Note: device-only form fields (consequence, important) have no server
 * columns and are not persisted by createHabit — same as every other server
 * caller. All server-supported fields are forwarded.
 */

const bodySchema = z.object({
  title: z.string().min(1).max(80),
  goalTitle: z.string().max(80).optional(),
  why: z.string().max(200).optional(),
  frequencyPerWeek: z.number().int().min(1).max(7),
  preferredTime: z.string().max(5),
  difficulty: z.string().max(10),
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
    return withCors(request, { ok: false, code: "BAD_REQUEST", error: "Check the habit details and try again." }, 400);
  }

  // Delegate: createHabit re-verifies the session from the cookie, validates
  // every field authoritatively, ensures/creates the goal, and persists the
  // habit under the authenticated user.
  try {
    const formData = new FormData();
    formData.set("title", parsed.data.title);
    if (parsed.data.goalTitle !== undefined) formData.set("goalTitle", parsed.data.goalTitle);
    if (parsed.data.why !== undefined) formData.set("why", parsed.data.why);
    formData.set("frequencyPerWeek", String(parsed.data.frequencyPerWeek));
    formData.set("preferredTime", parsed.data.preferredTime);
    formData.set("difficulty", parsed.data.difficulty);
    const result = await createHabit({}, formData);
    if (result?.error) {
      return withCors(request, { ok: false, code: "BAD_REQUEST", error: result.error }, 400);
    }
    return withCors(request, { ok: true });
  } catch {
    return withCors(
      request,
      { ok: false, code: "UPSTREAM_ERROR", error: "Could not save habit." },
      503,
    );
  }
}
