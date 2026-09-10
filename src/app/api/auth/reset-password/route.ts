import { z } from "zod";

import { createSessionToken } from "@/lib/auth-token";
import { performPasswordReset } from "@/lib/auth-password";
import { prisma } from "@/lib/db";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * JSON password reset for native clients (the static-export APK cannot run
 * server actions). The emailed token is single-use and expires; on success a
 * fresh session is issued, mirroring the web reset flow. POST-only so the
 * static-export Android build skips this route.
 */

const bodySchema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().min(8).max(256),
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
    return withCors(request, { ok: false, code: "BAD_REQUEST", error: "Invalid JSON body." }, 400);
  }
  const parsed = bodySchema.safeParse({
    token: typeof raw === "object" && raw !== null ? String((raw as { token?: unknown }).token ?? "") : "",
    password:
      typeof raw === "object" && raw !== null ? String((raw as { password?: unknown }).password ?? "") : "",
  });
  if (!parsed.success) {
    return withCors(request, { ok: false, code: "BAD_REQUEST", error: "Check the new password and try again." }, 400);
  }

  try {
    const result = await performPasswordReset(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      return withCors(request, { ok: false, code: "BAD_REQUEST", error: result.error }, 400);
    }
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
    }
    const token = await createSessionToken({ id: user.id, email: user.email });
    return withCors(request, {
      ok: true,
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch {
    return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
  }
}
