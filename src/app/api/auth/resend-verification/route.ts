import { z } from "zod";

import { requestVerificationResend } from "@/lib/auth-verification";
import { prisma } from "@/lib/db";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * Logged-out verification-email resend. Accepts an email, and — only when it
 * belongs to an existing UNVERIFIED account — rotates the verification token
 * and sends the verification email through the existing Resend mailer.
 * Always returns the same neutral response so callers cannot enumerate
 * accounts. POST-only so the static-export Android build skips this route.
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
    return withCors(request, { ok: false, code: "BAD_REQUEST" }, 400);
  }

  try {
    const result = await requestVerificationResend(
      {
        findUnverifiedId: async (email) => {
          const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, emailVerified: true },
          });
          return user && !user.emailVerified ? user.id : null;
        },
        saveToken: async (email, token, expires) => {
          await prisma.user.update({
            where: { email },
            data: { emailVerificationToken: token, emailVerificationExpires: expires },
          });
        },
      },
      parsed.data.email,
    );
    return withCors(request, result);
  } catch {
    return withCors(request, { ok: false, code: "UPSTREAM_ERROR" }, 503);
  }
}
