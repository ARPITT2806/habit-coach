"use server";

import { z } from "zod";

import { buildCoachContext } from "@/lib/ai/coach-context";
import { chatWithCoach } from "@/lib/ai/coach-analysis";
import {
  minimalCompletionsSchema,
  minimalHabitsSchema,
} from "@/lib/ai/coach-payload";

/**
 * Conversational Habitiva Coach boundary.
 *
 * Data sourcing: the caller supplies minimal habit/completion rows (shaped
 * from Habitiva's local or Prisma rows — titles, schedules, times, statuses
 * only). ALL statistics are recomputed here server-side via
 * buildCoachContext; client-supplied numbers are never trusted.
 *
 * NOTE on auth: this module deliberately imports neither next/headers nor
 * Prisma. Those modules poison the static-export module graph that the
 * Android APK is built from, so no statically-exported route may reference
 * them (verified by build). Session-authoritative Prisma loading therefore
 * cannot live in this UI-reachable action — that is the documented gap
 * requiring a real production backend (see report). The `userId` below is
 * only a rate-limit key namespace, never an authorization decision.
 */

const historySchema = z
  .array(
    z.object({
      role: z.enum(["user", "coach"]),
      content: z.string().min(1).max(1000),
    }),
  )
  .max(10);

const inputSchema = z.object({
  userId: z.string().max(128).optional(),
  habits: minimalHabitsSchema,
  completions: minimalCompletionsSchema,
  message: z.string().trim().min(1).max(1000),
  history: historySchema.optional().default([]),
  // Dev-grade consent flag for the local-first path (no server identity here).
  // The production route enforces User.aiConsentAt from Postgres instead.
  consentGranted: z.boolean(),
});

export type CoachChatResult =
  | { ok: true; reply: string; model: string; latencyMs: number }
  | { ok: false; error: string };

/* Dev-grade in-memory limiter (mirrors the approach in lib/ai.ts). */
const chatLimits = new Map<string, { count: number; resetAt: number }>();
const CHAT_PER_MINUTE = 10;

function chatAllowed(key: string): boolean {
  const now = Date.now();
  const entry = chatLimits.get(key);
  if (!entry || now > entry.resetAt) {
    chatLimits.set(key, { count: 1, resetAt: now + 60_000 });
    if (chatLimits.size > 2000) chatLimits.clear();
    return true;
  }
  if (entry.count >= CHAT_PER_MINUTE) return false;
  entry.count += 1;
  return true;
}

export async function sendCoachMessage(input: {
  userId?: string;
  habits: unknown;
  completions: unknown;
  message: string;
  history?: { role: "user" | "coach"; content: string }[];
  consentGranted?: unknown;
}): Promise<CoachChatResult> {
  const startedAt = Date.now();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That message didn't come through cleanly. Try again." };
  }

  if (!parsed.data.consentGranted) {
    return {
      ok: false,
      error:
        "AI_CONSENT_REQUIRED: coaching needs your consent first — your habit titles, schedules, and completion counts are sent to an external AI service to generate replies.",
    };
  }

  if (!chatAllowed(`chat:${parsed.data.userId ?? "anon"}`)) {
    return {
      ok: false,
      error: "You're sending messages quickly — give the coach a minute, then retry.",
    };
  }

  const context = buildCoachContext(parsed.data.habits, parsed.data.completions);

  if (context.habits.length === 0) {
    return {
      ok: true,
      reply:
        "You don't have any active habits yet, so there's nothing for me to analyze. Add your first habit and log a few days — then ask me anything about your progress, streaks, or routine.",
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
      latencyMs: Date.now() - startedAt,
    };
  }

  const outcome = await chatWithCoach(context, parsed.data.message, parsed.data.history);
  if (!outcome.ok) {
    const friendly =
      outcome.error.startsWith("OPENAI_API_KEY") || outcome.error.startsWith("The coach returned")
        ? outcome.error
        : "The coach couldn't be reached just now. Check your connection and retry.";
    return { ok: false, error: friendly };
  }
  return { ok: true, reply: outcome.reply, model: outcome.model, latencyMs: outcome.latencyMs };
}
