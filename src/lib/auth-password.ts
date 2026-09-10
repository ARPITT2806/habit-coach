import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { authThrottled, recordAuthFail } from "./auth-rate";
import { prisma } from "./db";
import { sendPasswordResetEmail } from "./email";

/**
 * Password-reset cores shared by the web actions and the JSON routes so both
 * enforce identical behavior. Plain module: relative imports only, no next/*,
 * so the zero-dependency node:test suite can exercise it with a fake store.
 *
 * Anti-enumeration contract on request: unknown addresses, Google-provider
 * accounts, throttled callers, and mailer failures ALL return the same
 * neutral ok. Reset tokens are 1-hour, single-use (cleared on completion),
 * and a new request overwrites any previous token.
 */

export type PasswordStore = {
  findByEmail(email: string): Promise<{ id: string; provider: string | null } | null>;
  saveResetToken(userId: string, token: string, expires: Date): Promise<void>;
  findByResetToken(token: string, now: Date): Promise<{ id: string } | null>;
  completeReset(userId: string, passwordHash: string): Promise<void>;
};

export const RESET_TTL_MS = 60 * 60 * 1000;

export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

const prismaStore: PasswordStore = {
  findByEmail: async (email) =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true, provider: true },
    }),
  saveResetToken: async (userId, token, expires) => {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });
  },
  findByResetToken: async (token, now) => {
    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token, passwordResetExpires: { gt: now } },
      select: { id: true },
    });
    return user;
  },
  completeReset: async (userId, passwordHash) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
  },
};

function normalizeEmail(email: unknown): string | null {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized || normalized.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export async function requestPasswordReset(
  email: unknown,
  store: PasswordStore = prismaStore,
  sendMail: (to: string, token: string) => Promise<{ ok: boolean }> = sendPasswordResetEmail,
  generateToken: () => string = generateResetToken,
): Promise<{ ok: true }> {
  const neutral = { ok: true as const };
  const normalized = normalizeEmail(email);
  if (!normalized) return neutral;

  const budget = `reset:${normalized}`;
  if (authThrottled(budget)) return neutral;
  // Count every attempt so this endpoint cannot flood an address.
  recordAuthFail(budget);

  const user = await store.findByEmail(normalized).catch(() => null);
  if (!user || user.provider === "google") return neutral;

  const token = generateToken();
  await store.saveResetToken(user.id, token, new Date(Date.now() + RESET_TTL_MS));
  await sendMail(normalized, token).catch(() => ({ ok: false }) as const);
  return neutral;
}

export type ResetResult = { ok: true; userId: string } | { ok: false; error: string };

export async function performPasswordReset(
  token: unknown,
  password: unknown,
  store: PasswordStore = prismaStore,
  hashPassword: (password: string) => Promise<string> = (plain) => bcrypt.hash(plain, 10),
): Promise<ResetResult> {
  if (typeof token !== "string" || !token) {
    return { ok: false, error: "Invalid or expired reset link." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, error: "Use at least 8 characters." };
  }
  const user = await store.findByResetToken(token, new Date()).catch(() => null);
  if (!user) {
    return { ok: false, error: "Invalid or expired reset link." };
  }
  await store.completeReset(user.id, await hashPassword(password));
  return { ok: true, userId: user.id };
}
