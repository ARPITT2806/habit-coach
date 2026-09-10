import OpenAI from "openai";
import { z } from "zod";

import type { CoachContext } from "./coach-context";

/**
 * Dedicated server-side AI coaching module. UI components must never import
 * this file (it holds the OpenAI client); they go through server actions.
 */

const RecommendationSchema = z.object({
  action: z.string(),
  reason: z.string(),
  priority: z.enum(["high", "medium", "low"]),
});

export const CoachAnalysisSchema = z.object({
  summary: z.string(),
  wins: z.array(z.string()),
  struggles: z.array(z.string()),
  patterns: z.array(z.string()),
  recommendations: z.array(RecommendationSchema).max(4),
  confidence: z.enum(["high", "medium", "low"]),
});

export type CoachAnalysis = z.infer<typeof CoachAnalysisSchema>;

export type AnalysisOutcome =
  | { ok: true; analysis: CoachAnalysis; model: string; latencyMs: number }
  | { ok: false; model: string; latencyMs: number; error: string };

const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    wins: { type: "array", items: { type: "string" } },
    struggles: { type: "array", items: { type: "string" } },
    patterns: { type: "array", items: { type: "string" } },
    recommendations: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["action", "reason", "priority"],
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["summary", "wins", "struggles", "patterns", "recommendations", "confidence"],
};

export type ChatTurn = {
  role: "user" | "coach";
  content: string;
};

export type ChatOutcome =
  | { ok: true; reply: string; model: string; latencyMs: number }
  | { ok: false; model: string; latencyMs: number; error: string };

const MAX_HISTORY_TURNS = 10;
const MAX_TURN_CHARS = 1000;

const CHAT_SYSTEM_PROMPT = [
  "You are Habitiva Coach, a serious behavioral habit coach.",
  "Be intelligent, direct, practical, and action-oriented. Supportive without",
  "being cheerful by default. Never motivational-poster filler (no",
  "'Believe in yourself!', 'Stay consistent!', 'You've got this!') unless the",
  "moment genuinely calls for encouragement.",
  "Ground every data claim in the supplied habit JSON. Distinguish FACTS",
  "(directly supported by the numbers), HYPOTHESES (reasonable",
  "interpretations, labeled as such), and UNKNOWNS (things the data cannot",
  "tell you). Never invent psychological reasons for missed habits.",
  "Match depth to the question: one or two sentences for simple questions,",
  "deeper analysis with specific numbers when asked for patterns or plans.",
  "Plain text only: no emojis, no markdown tables, no headings.",
].join("\n");

/**
 * Conversational coaching over an already-built CoachContext. History is
 * short-term only (bounded above); nothing is persisted here.
 */
export async function chatWithCoach(
  context: CoachContext,
  message: string,
  history: ChatTurn[],
): Promise<ChatOutcome> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const startedAt = Date.now();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      error:
        "OPENAI_API_KEY is not set. Add it to .env (server-side only, never NEXT_PUBLIC) and restart the dev server.",
    };
  }

  const cleanHistory: OpenAI.Responses.ResponseInputItem[] = history
    .filter((turn) => turn.role === "user" || turn.role === "coach")
    .map((turn) => ({
      role: (turn.role === "coach" ? "assistant" : "user") as "user" | "assistant",
      content: turn.content.slice(0, MAX_TURN_CHARS),
    }))
    .slice(-MAX_HISTORY_TURNS);

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      instructions: CHAT_SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: `Authoritative current habit data (JSON): ${JSON.stringify(context)}`,
        },
        ...cleanHistory,
        { role: "user", content: message },
      ],
      max_output_tokens: 500,
    });

    const reply = response.output_text.trim();
    if (!reply) {
      return {
        ok: false,
        model,
        latencyMs: Date.now() - startedAt,
        error: "The coach returned an empty response. Try again.",
      };
    }
    return { ok: true, reply, model, latencyMs: Date.now() - startedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      error: msg.slice(0, 300),
    };
  }
}

const SYSTEM_PROMPT = [
  "You are a calm behavioral habit coach analyzing Habitiva tracking data.",
  "Distinguish strictly between three things:",
  "1. FACTS directly supported by the supplied numbers.",
  "2. HYPOTHESES worth investigating (label them as such).",
  "3. Things you DO NOT KNOW.",
  "Never invent reasons for missed habits. Never claim to know why someone",
  "missed something. Example of the required honesty:",
  "'Exercise completion has dropped on weekdays. The data doesn't tell us",
  "why, but scheduling friction may be worth investigating.'",
  "Identify the strongest and weakest habit from adherence rates, name at most",
  "a few meaningful patterns, and give one or two highest-leverage",
  "interventions. Keep every string short and plain. No emojis, no hype.",
].join("\n");

/**
 * Send a pre-built behavioral context to the Responses API and return the
 * validated structured analysis. Never receives raw database rows — only the
 * minimal CoachContext produced by buildCoachContext.
 */
export async function analyzeHabits(context: CoachContext): Promise<AnalysisOutcome> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const startedAt = Date.now();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      error:
        "OPENAI_API_KEY is not set. Add it to .env (server-side only, never NEXT_PUBLIC) and restart the dev server.",
    };
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input: JSON.stringify(context),
      max_output_tokens: 700,
      text: {
        format: {
          type: "json_schema",
          name: "habit_coaching",
          strict: true,
          schema: ANALYSIS_JSON_SCHEMA,
        },
      },
    });

    const parsed = CoachAnalysisSchema.safeParse(JSON.parse(response.output_text));
    if (!parsed.success) {
      return {
        ok: false,
        model,
        latencyMs: Date.now() - startedAt,
        error: "Model returned output outside the expected coaching schema.",
      };
    }
    return { ok: true, analysis: parsed.data, model, latencyMs: Date.now() - startedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      error: message.slice(0, 300),
    };
  }
}
