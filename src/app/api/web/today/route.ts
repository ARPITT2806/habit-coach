import { getTodayForSession } from "@/lib/queries";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * Read-only web data endpoint. POST-only so the static-export Android build
 * skips it (same convention as /api/coach/*). Authenticated via the existing
 * httpOnly web session cookie — identity comes ONLY from the verified
 * session, habit data ONLY from Prisma, shaped to the minimal web payload.
 * No userId parameter exists, so cross-user access is structurally impossible.
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

  let result: Awaited<ReturnType<typeof getTodayForSession>>;
  try {
    result = await getTodayForSession(request.headers.get("cookie"));
  } catch {
    return withCors(
      request,
      { ok: false, code: "UPSTREAM_ERROR", error: "Today is temporarily unavailable." },
      503,
    );
  }

  if (!result.ok) {
    if (result.code === "UNAUTHORIZED") {
      return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
    }
    return withCors(
      request,
      { ok: false, code: "UPSTREAM_ERROR", error: "Today is temporarily unavailable." },
      503,
    );
  }

  return withCors(request, { ok: true, data: result.data });
}
