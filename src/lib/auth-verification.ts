import { randomBytes } from "crypto";

import { authThrottled, recordAuthFail } from "./auth-rate";
import { sendVerificationEmail } from "./email";

/**
 * Logged-out verification-email resend core. Shared by the JSON route (and
 * any future caller) so there is exactly one implementation.
 *
 * Anti-enumeration contract: every outcome — unknown email, already verified,
 * throttled, mailed, mailer failure — returns the same neutral shape. The
 * message is worded conditionally so it never claims an email was sent.
 * The token is generated here, persisted by the caller-provided store, and
 * never returned or logged.
 */

export type VerificationStore = {
  findUnverifiedId(email: string): Promise<string | null>;
  saveToken(email: string, token: string, expires: Date): Promise<void>;
};

export type VerificationResult = {
  ok: true;
  message: string;
};

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function generateVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export async function requestVerificationResend(
  store: VerificationStore,
  email: string,
  sendMail: (to: string, token: string) => Promise<{ ok: boolean }> = sendVerificationEmail,
  generateToken: () => string = generateVerificationToken,
): Promise<VerificationResult> {
  const normalized = email.trim().toLowerCase();
  const neutral: VerificationResult = {
    ok: true,
    message:
      "If an unverified account exists for this email, a verification email has been sent.",
  };

  if (!normalized || normalized.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: true, message: "Enter a valid email address." };
  }

  if (authThrottled(`verify:${normalized}`)) {
    return neutral;
  }
  // Count every attempt (namespaced away from the login budget) so the
  // endpoint cannot be used to flood an address with emails.
  recordAuthFail(`verify:${normalized}`);

  const userId = await store.findUnverifiedId(normalized).catch(() => null);
  if (!userId) {
    return neutral;
  }

  const token = generateToken();
  const expires = new Date(Date.now() + VERIFICATION_TTL_MS);
  await store.saveToken(normalized, token, expires);
  const mailed = await sendMail(normalized, token).catch(() => ({ ok: false }) as const);
  if (!mailed.ok) {
    return neutral;
  }
  return neutral;
}
