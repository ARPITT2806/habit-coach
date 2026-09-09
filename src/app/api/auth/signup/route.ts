import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { createSessionToken } from "@/lib/auth-token";
import { authThrottled } from "@/lib/auth-rate";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * JSON signup for native clients. Mirrors the web signup action (validation,
 * throttle, unique-email rule, bcrypt hash, verification token) plus the
 * verification email itself. Accounts verify through the existing web flow;
 * the login route enforces the verified gate either way.
 * POST-only so the static-export Android build skips this route.
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

  if (authThrottled(parsed.data.email)) {
    return withCors(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      return withCors(request, { ok: false, code: "EMAIL_TAKEN" }, 409);
    }

    const emailVerificationToken = randomBytes(32).toString("hex");
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        emailVerificationToken,
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        provider: "email",
      },
    });

    const mailed = await sendVerificationEmail(user.email, emailVerificationToken);
    if (!mailed.ok) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      return withCors(request, { ok: false, code: "EMAIL_SEND_FAILED" }, 502);
    }

    const token = await createSessionToken({ id: user.id, email: user.email });
    return withCors(request, {
      ok: true,
      token,
      user: { id: user.id, email: user.email, name: user.name },
      verified: false,
    });
  } catch {
    return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
  }
}
