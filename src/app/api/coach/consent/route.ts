import { readSessionToken } from "@/lib/auth-token";
import { prisma } from "@/lib/db";
import { parseBearerToken } from "@/lib/ai/coach-service";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * Records explicit AI-coaching consent (sets User.aiConsentAt). Authenticated
 * via Authorization: Bearer like the chat route. Idempotent. POST-only so the
 * static-export Android build skips it (see chat route).
 */

function withCors(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeadersFor(request), "Cache-Control": "no-store" },
  });
}

export async function OPTIONS(request: Request) {
  const preflight = corsPreflightResponse(request);
  if (preflight) return preflight;
  return withCors(request, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
}

export async function POST(request: Request) {
  const preflight = corsPreflightResponse(request);
  if (preflight) return preflight;

  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }
  const session = await readSessionToken(token).catch(() => null);
  if (!session) {
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }

  let user: { aiConsentAt: Date | null } | null = null;
  try {
    user = await prisma.user.update({
      where: { id: session.id },
      data: { aiConsentAt: new Date() },
      select: { aiConsentAt: true },
    });
  } catch {
    user = null;
  }
  if (!user) {
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }

  return withCors(request, {
    ok: true,
    consentedAt: user.aiConsentAt?.toISOString() ?? null,
  });
}
