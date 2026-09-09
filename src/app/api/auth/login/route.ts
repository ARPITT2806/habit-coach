import bcrypt from "bcryptjs";
import { z } from "zod";

import { createSessionToken } from "@/lib/auth-token";
import { authThrottled, clearAuthFails, recordAuthFail } from "@/lib/auth-rate";
import { prisma } from "@/lib/db";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * JSON login for native clients (the static-export APK cannot run server
 * actions). Reuses the exact verification rules of the web login action:
 * zod credentials, per-email brute-force throttle, bcrypt compare, and the
 * email-verified gate. Returns a jose session JWT as a Bearer token.
 * POST-only so the static-export Android build skips this route.
 */

const bodySchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(256),
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
    email: typeof raw === "object" && raw !== null ? String((raw as { email?: unknown }).email ?? "").trim().toLowerCase() : "",
    password: typeof raw === "object" && raw !== null ? String((raw as { password?: unknown }).password ?? "") : "",
  });
  if (!parsed.success) {
    return withCors(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }

  if (authThrottled(parsed.data.email)) {
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }

  let user = null;
  try {
    user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  } catch {
    return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
  }
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    recordAuthFail(parsed.data.email);
    return withCors(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }
  if (!user.emailVerified) {
    return withCors(request, { ok: false, code: "EMAIL_UNVERIFIED" }, 403);
  }

  clearAuthFails(parsed.data.email);
  const token = await createSessionToken({ id: user.id, email: user.email });
  return withCors(request, {
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
}
