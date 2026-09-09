"use server";

import OpenAI from "openai";

export type AiConnectivityResult =
  | { ok: true; model: string; latencyMs: number; response: string }
  | { ok: false; model: string; latencyMs: number; error: string };

/**
 * DEV-ONLY OpenAI connectivity test. Not part of the Android production UI
 * and not the final production architecture — it only proves server-side
 * reachability using the official SDK's Responses API.
 *
 * Reads the key exclusively from process.env.OPENAI_API_KEY (never logged,
 * returned, or exposed). Sends no habit data.
 */
export async function testOpenAIConnectivity(): Promise<AiConnectivityResult> {
  const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
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
      input: "Reply with exactly: OK",
      max_output_tokens: 16,
    });
    return {
      ok: true,
      model,
      latencyMs: Date.now() - startedAt,
      response: response.output_text.trim(),
    };
  } catch (err) {
    // Sanitized: SDK errors can echo request config, so return only the message.
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      error: message.slice(0, 300),
    };
  }
}
