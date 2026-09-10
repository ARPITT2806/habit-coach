import { z } from "zod";

import { createSessionToken } from "@/lib/auth-token";
import { registerAccount } from "@/lib/auth-registration";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * JSON signup for native clients. Delegates to the shared registration core
 * (same validation, throttle, bcrypt, verification token, and keep-unverified
 * semantics as the web signup action). Unverified retries rotate the token
 * and resend instead of erroring; verified addresses get EMAIL_TAKEN.
 * Accounts verify through the existing flow; login enforces the verified
 * gate either way. POST-only so the static-export Android build skips it.
 */

const bodySchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(256),
  name: z.string().min(1).max(60).optional(),
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
    name:
      typeof raw === "object" && raw !== null && (raw as { name?: unknown }).name
        ? String((raw as { name?: unknown }).name).trim() || undefined
        : undefined,
  });
  if (!parsed.success) {
    return withCors(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }

  let result: Awaited<ReturnType<typeof registerAccount>>;
  try {
    result = await registerAccount({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    });
  } catch {
    return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
  }

  if (!result.ok) {
    if (result.code === "EMAIL_TAKEN") {
      return withCors(request, { ok: false, code: "EMAIL_TAKEN" }, 409);
    }
    return withCors(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }

  try {
    const token = await createSessionToken({ id: result.userId, email: result.email });
    const user = { id: result.userId, email: result.email, name: parsed.data.name ?? null };
    if (!result.emailSent) {
      // Account kept (never stranded, never duplicated): the client guides
      // toward the resend-verification flow instead of retrying signup.
      return withCors(request, {
        ok: true,
        token,
        user,
        verified: false,
        emailSent: false,
      });
    }
    return withCors(request, {
      ok: true,
      token,
      user,
      verified: false,
    });
  } catch {
    return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
  }
}
