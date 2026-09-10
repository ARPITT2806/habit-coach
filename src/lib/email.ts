import { Resend } from "resend";

/**
 * Server-only transactional email (Resend). Never imported by client code:
 * the API key stays server-side, and tokens/links are never logged.
 *
 * Sender is environment-configured (EMAIL_FROM) so a custom Habitiva domain
 * can replace the provider testing sender later with no code changes.
 * Until then the default testing sender applies, which can only deliver to
 * the Resend account owner's address — documented, not worked around.
 */

export type EmailResult = { ok: true } | { ok: false; error: string };

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_HABITIVA_API_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}

function sender(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) return from;
  return "HabItiva <onboarding@resend.dev>";
}

export function verificationLink(token: string): string {
  return `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function passwordResetLink(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[habitiva-email] missing RESEND_API_KEY");
    return { ok: false, error: "Email delivery is not configured." };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: sender(),
      to,
      subject,
      html,
      text,
    });
    if (error) {
      // Safe diagnostics only: Resend's message can echo the recipient
      // address, so log just the machine-readable code. Never log the
      // message, the address, tokens, or the API key.
      const details = error as { statusCode?: unknown; name?: unknown };
      console.error("[habitiva-email] resend rejected", {
        statusCode: typeof details.statusCode === "number" ? details.statusCode : null,
        name: typeof details.name === "string" ? details.name : null,
      });
      return { ok: false, error: "Email delivery was rejected. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[habitiva-email] resend threw", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return { ok: false, error: "Email delivery failed. Please try again." };
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<EmailResult> {
  const link = verificationLink(token);
  return sendEmail(
    to,
    "Verify your HabItiva account",
    `<p>Welcome to HabItiva! Confirm your email to finish creating your account:</p><p><a href="${link}">Verify my email</a></p><p>This link expires in 24 hours. If you didn't sign up, ignore this message.</p>`,
    `Welcome to HabItiva! Confirm your email (expires in 24 hours): ${link}\nIf you didn't sign up, ignore this message.`,
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<EmailResult> {
  const link = passwordResetLink(token);
  return sendEmail(
    to,
    "Reset your HabItiva password",
    `<p>Someone requested a password reset for your HabItiva account:</p><p><a href="${link}">Reset my password</a></p><p>This link expires in 1 hour. If that wasn't you, ignore this message.</p>`,
    `Reset your HabItiva password (expires in 1 hour): ${link}\nIf that wasn't you, ignore this message.`,
  );
}
