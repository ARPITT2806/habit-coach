export type CoachChatResult =
  | { ok: true; reply: string; model: string; latencyMs: number }
  | { ok: false; error: string };

/**
 * Device-mode stand-in for the conversational coach action, wired via the
 * production resolveAlias in next.config.ts (same pattern as auth-stub).
 *
 * The static-export Android build has no server boundary, so the real action
 * (OpenAI client, zod validation) must stay out of its module graph. This
 * stub keeps the Coach UI fully rendered in the APK and degrades to an
 * honest offline state instead of crashing or hanging.
 */
export async function sendCoachMessage(_input: {
  userId?: string;
  habits: unknown;
  completions: unknown;
  message: string;
  history?: { role: "user" | "coach"; content: string }[];
  consentGranted?: unknown;
}): Promise<CoachChatResult> {
  void _input;
  return {
    ok: false,
    error:
      "The AI coach needs a connection to Habitiva's server, which isn't available in the offline app yet. Your habits and tracking work fully offline — coaching will light up once the production backend ships.",
  };
}
