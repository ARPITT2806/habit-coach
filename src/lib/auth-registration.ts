import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { authThrottled, recordAuthFail } from "./auth-rate";
import { prisma } from "./db";
import { sendVerificationEmail } from "./email";

/**
 * Shared account-registration core (used by the JSON signup route and the web
 * signup action so both enforce identical behavior). Plain module: relative
 * imports only, no next/*, so the zero-dependency node:test suite can
 * exercise it with a fake store.
 *
 * Design: accounts are KEPT when verification mail fails (never stranded,
 * never duplicated). Retry signup for an unverified address rotates the
 * token and resends instead of erroring; verified addresses get EMAIL_TAKEN.
 * Signup mail sends draw from a dedicated `signup:` throttle namespace so
 * login brute-force budgets are unaffected.
 */

export type RegistrationInput = {
  email: string;
  password: string;
  name?: string;
};

export type RegistrationStore = {
  findByEmail(email: string): Promise<{ id: string; emailVerified: Date | null } | null>;
  createUser(data: {
    email: string;
    name?: string;
    passwordHash: string;
    token: string;
    expires: Date;
  }): Promise<{ id: string; email: string }>;
  saveToken(userId: string, token: string, expires: Date): Promise<void>;
};

export type RegistrationResult =
  | { ok: true; userId: string; email: string; emailSent: boolean }
  | { ok: false; code: "INVALID" | "THROTTLED" | "EMAIL_TAKEN"; error: string };

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function generateRegistrationToken(): string {
  return randomBytes(32).toString("hex");
}

const GENERIC_ERROR = "Check your details and try again.";

const prismaStore: RegistrationStore = {
  findByEmail: async (email) =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    }),
  createUser: async (data) =>
    prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        emailVerificationToken: data.token,
        emailVerificationExpires: data.expires,
        provider: "email",
      },
      select: { id: true, email: true },
    }),
  saveToken: async (userId, token, expires) => {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerificationToken: token, emailVerificationExpires: expires },
    });
  },
};

export async function registerAccount(
  input: { email: unknown; password: unknown; name?: unknown },
  store: RegistrationStore = prismaStore,
  sendMail: (to: string, token: string) => Promise<{ ok: boolean }> = sendVerificationEmail,
  generateToken: () => string = generateRegistrationToken,
): Promise<RegistrationResult> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const name =
    typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : undefined;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160 || password.length < 8) {
    return { ok: false, code: "INVALID", error: GENERIC_ERROR };
  }

  const budget = `signup:${email}`;
  if (authThrottled(budget)) {
    return { ok: false, code: "THROTTLED", error: GENERIC_ERROR };
  }
  // Every attempt draws from the mail budget so this path cannot be used to
  // flood an address with verification emails.
  recordAuthFail(budget);

  const existing = await store.findByEmail(email).catch(() => null);
  if (existing && existing.emailVerified) {
    return { ok: false, code: "EMAIL_TAKEN", error: "An account with that email already exists." };
  }

  const token = generateToken();
  const expires = new Date(Date.now() + VERIFICATION_TTL_MS);

  let userId: string;
  if (existing) {
    // Unverified retry: rotate the token and resend instead of erroring —
    // no duplicate account, no stuck state.
    await store.saveToken(existing.id, token, expires);
    userId = existing.id;
  } else {
    const created = await store.createUser({
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      token,
      expires,
    });
    userId = created.id;
  }

  const mailed = await sendMail(email, token).catch(() => ({ ok: false }) as const);
  return { ok: true, userId, email, emailSent: mailed.ok };
}
