import { z } from "zod";

import { requestPasswordReset } from "@/lib/auth-password";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * JSON password-reset request for native clients (the static-export APK
 * cannot run server actions). Delegates to the shared core: neutral ok for
 * unknown/Google/throttled/failed-mail outcomes alike, so addresses cannot
 * be enumerated and the endpoint cannot flood inboxes (per-address budget).
 * POST-only so the static-export Android build skips this route.
 */

const bodySchema = z.object({
  email: z.string().email().max(160),
});

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

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return withCors(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }
  const parsed = bodySchema.safeParse({
    email:
      typeof raw === "object" && raw !== null
        ? String((raw as { email?: unknown }).email ?? "").trim().toLowerCase()
        : "",
  });
  if (!parsed.success) {
    // Malformed shape (not merely unknown address) is a client bug.
    return withCors(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }

  try {
    await requestPasswordReset(parsed.data.email);
    return withCors(request, { ok: true });
  } catch {
    return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
  }
}
