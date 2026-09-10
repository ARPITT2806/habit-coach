import { HISTORY_DISPLAY_LIMIT, parseBearerToken } from "@/lib/ai/coach-service";
import { prismaCoachStore } from "@/lib/api/coach-store";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * persisted Coach conversation restore. POST-only so the static-export
 * Android build skips it (same convention as the chat/consent routes).
 * Authenticated via Authorization: Bearer; the conversation is resolved by
 * the verified userId only — no conversation id crosses the client boundary,
 * so one user can never address another user's messages. Reading history
 * requires authentication but not AI consent (no model call happens here).
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

  const store = prismaCoachStore();
  const session = await store.verifyToken(token).catch(() => null);
  if (!session) {
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }

  try {
    const user = await store.loadUser(session.id).catch(() => null);
    if (!user) {
      return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
    }
    const conversation = await store.ensureConversation(session.id);
    const rows = await store.loadRecentMessages(conversation.id, HISTORY_DISPLAY_LIMIT);
    return withCors(request, {
      ok: true,
      messages: rows.map((row) => ({
        role: row.role,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch {
    return withCors(
      request,
      { ok: false, code: "UPSTREAM_ERROR", error: "The coach history is temporarily unavailable." },
      503,
    );
  }
}
