"use server";

import { z } from "zod";

import { buildCoachContext, type CoachContext } from "@/lib/ai/coach-context";
import { analyzeHabits, type CoachAnalysis } from "@/lib/ai/coach-analysis";
import { MIN_EVENTS_FOR_PATTERN } from "@/lib/constants";

/**
 * DEV-ONLY vertical-slice test for AI habit coaching. Not production
 * infrastructure and not reachable from the Android UI: it exists so the
 * coaching logic can be proven in the development environment.
 *
 * The client sends already-minimal habit/completion values (shaped from
 * Habitiva's local rows, never raw dumps, ids, or user info); this action
 * builds the behavioral context server-side and calls the Responses API.
 */

import {
  minimalCompletionsSchema,
  minimalHabitsSchema,
} from "@/lib/ai/coach-payload";

const inputSchema = z.object({
  habits: minimalHabitsSchema.refine((habits) => habits.length >= 1, {
    message: "At least one habit is required for analysis.",
  }),
  completions: minimalCompletionsSchema,
});

export type CoachTestResult =
  | {
      ok: true;
      model: string;
      latencyMs: number;
      context: CoachContext;
      analysis: CoachAnalysis;
    }
  | { ok: false; model: string; latencyMs: number; error: string; context?: CoachContext };

export async function testCoachAnalysis(input: {
  habits: unknown;
  completions: unknown;
}): Promise<CoachTestResult> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const startedAt = Date.now();
  const fail = (error: string, context?: CoachContext): CoachTestResult => ({
    ok: false,
    model,
    latencyMs: Date.now() - startedAt,
    error,
    context,
  });

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid habit payload: expected minimal habit/completion values.");
  }

  const context = buildCoachContext(parsed.data.habits, parsed.data.completions);

  if (context.totalScheduled === 0) {
    return fail(
      "No scheduled habit occurrences in the recent window: nothing to analyze yet.",
      context,
    );
  }

  if (context.totalEvents < MIN_EVENTS_FOR_PATTERN) {
    return fail(
      `Insufficient history for coaching (${context.totalEvents} logged events, need at least ${MIN_EVENTS_FOR_PATTERN}). Keep tracking for a few more days.`,
      context,
    );
  }

  const outcome = await analyzeHabits(context);
  if (!outcome.ok) return { ...outcome, context };
  return {
    ok: true,
    model: outcome.model,
    latencyMs: outcome.latencyMs,
    context,
    analysis: outcome.analysis,
  };
}
