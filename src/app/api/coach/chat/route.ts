import { z } from "zod";

import { readSessionToken } from "@/lib/auth-token";
import { prisma } from "@/lib/db";
import { parseDaysOfWeek } from "@/lib/constants";
import { chatWithCoach } from "@/lib/ai/coach-analysis";
import {
  runCoachTurn,
  type CoachStore,
} from "@/lib/ai/coach-service";
import { corsHeadersFor, corsPreflightResponse } from "@/lib/api/cors";

/**
 * Production Coach transport (P0). POST-only routes are skipped by the
 * static-export collector, so build:android stays green WITHOUT force-static
 * (which would neuter the Request object at runtime). Authenticated via
 * Authorization: Bearer <session JWT>; identity comes ONLY from the verified
 * token, habit data ONLY from Prisma.
 */

const bodySchema = z.object({
  message: z.string(),
  history: z
    .array(z.object({ role: z.enum(["user", "coach"]), content: z.string() }))
    .max(10)
    .optional()
    .default([]),
});

function limits() {
  return {
    perHour: Number(process.env.OPENAI_MAX_HOURLY_REQUESTS ?? "10"),
    perDay: Number(process.env.OPENAI_MAX_DAILY_REQUESTS ?? "50"),
  };
}

function prismaStore(): CoachStore {
  return {
    verifyToken: (token) => readSessionToken(token),
    loadUser: (userId) =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, aiConsentAt: true },
      }),
    loadHabits: async (userId) => {
      const habits = await prisma.habit.findMany({
        where: { userId, isActive: true },
        select: {
          id: true,
          title: true,
          frequencyPerWeek: true,
          daysOfWeek: true,
          preferredTime: true,
          difficulty: true,
        },
      });
      return habits.map((habit) => ({
        id: habit.id,
        title: habit.title,
        frequencyPerWeek: habit.frequencyPerWeek,
        daysOfWeek: parseDaysOfWeek(habit.daysOfWeek),
        preferredTime: habit.preferredTime,
        difficulty: habit.difficulty,
      }));
    },
    loadCompletions: (userId) =>
      prisma.habitCompletion.findMany({
        where: { userId },
        select: { habitId: true, date: true, status: true },
      }),
    getUsage: async (userId, windowType, windowStart) => {
      const row = await prisma.coachUsage.findUnique({
        where: { userId_windowType_windowStart: { userId, windowType, windowStart } },
        select: { count: true },
      });
      return row?.count ?? 0;
    },
    addUsage: async (userId, windowType, windowStart) => {
      await prisma.coachUsage.upsert({
        where: { userId_windowType_windowStart: { userId, windowType, windowStart } },
        create: { userId, windowType, windowStart, count: 1 },
        update: { count: { increment: 1 } },
      });
    },
  };
}

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

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return withCors(
      request,
      { ok: false, code: "BAD_REQUEST", error: "Malformed request." },
      400,
    );
  }

  let result: Awaited<ReturnType<typeof runCoachTurn>>;
  try {
    result = await runCoachTurn(
      prismaStore(),
      limits(),
      request.headers.get("authorization"),
      parsed.data.message,
      parsed.data.history,
      chatWithCoach,
    );
  } catch {
    return withCors(
      request,
      { ok: false, code: "UPSTREAM_ERROR", error: "The coach is temporarily unavailable." },
      503,
    );
  }

  if (!result.ok) {
    const status =
      result.code === "UNAUTHORIZED"
        ? 401
        : result.code === "RATE_LIMITED"
          ? 429
          : result.code === "AI_CONSENT_REQUIRED"
            ? 403
            : 400;
    const headers: Record<string, string> = {
      ...corsHeadersFor(request),
      "Cache-Control": "no-store",
    };
    if (result.code === "RATE_LIMITED" && result.retryAfterMs !== undefined) {
      headers["Retry-After"] = String(Math.max(1, Math.ceil(result.retryAfterMs / 1000)));
    }
    return Response.json(result, { status, headers });
  }

  return withCors(request, {
    ok: true,
    message: result.message,
    usage: result.usage,
  });
}
