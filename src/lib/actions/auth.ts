"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, getSession, setSessionCookie } from "@/lib/auth";
import { authThrottled, clearAuthFails, recordAuthFail } from "@/lib/auth-rate";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
  name: z.string().min(1).max(60).optional(),
});

export type AuthState = { error?: string };

/* ---------- Brute-force throttle (server-side, per email: see lib/auth-rate) ---------- */

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  if (authThrottled(parsed.data.email)) {
    return { error: "Check your details and try again." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) return { error: "An account with that email already exists." };

  const emailVerificationToken = randomBytes(32).toString("hex");
  const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      emailVerificationToken,
      emailVerificationExpires,
      provider: "email",
    },
  });

  const mailed = await sendVerificationEmail(user.email, emailVerificationToken);
  if (!mailed.ok) {
    // Never strand an unverifiable account or claim an email was sent:
    // remove the just-created row so signup can be retried cleanly.
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    return { error: "Account could not be created because the verification email failed. Please try again." };
  }

  await setSessionCookie({ id: user.id, email: user.email });
  redirect("/onboarding");
}

export async function logIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.pick({ email: true, password: true }).safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  if (authThrottled(parsed.data.email)) {
    return { error: "Email or password is incorrect." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    recordAuthFail(parsed.data.email);
    return { error: "Email or password is incorrect." };
  }

  if (!user.emailVerified) {
    return { error: "Please verify your email before signing in." };
  }

  clearAuthFails(parsed.data.email);
  await setSessionCookie({ id: user.id, email: user.email });
  redirect(user.onboardedAt ? "/today" : "/onboarding");
}

export async function logOut() {
  await clearSessionCookie();
  redirect("/login");
}

export async function currentUser() {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      image: true,
      provider: true,
      onboardedAt: true,
    },
  });
}

export type GoogleAuthState = { error?: string };

export async function signInWithGoogle(
  accessToken: string,
): Promise<GoogleAuthState> {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return { error: "Google sign-in is not configured." };
  }

  let info: {
    email?: string;
    email_verified?: boolean;
    name?: string | null;
    picture?: string | null;
    sub?: string;
  };

  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) {
      return { error: "Google could not verify this account." };
    }
    info = (await response.json()) as typeof info;
  } catch {
    return { error: "Could not reach Google to verify your account." };
  }

  const email = info.email?.trim().toLowerCase();
  if (!email || !info.email_verified) {
    return { error: "A verified Google email is required to continue." };
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: info.name ?? null,
      image: info.picture ?? null,
      provider: "google",
      providerId: info.sub ?? null,
      emailVerified: new Date(),
    },
    create: {
      email,
      name: info.name ?? null,
      image: info.picture ?? null,
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      provider: "google",
      providerId: info.sub ?? null,
      emailVerified: new Date(),
    },
  });

  await setSessionCookie({ id: user.id, email: user.email });
  redirect(user.onboardedAt ? "/today" : "/onboarding");
}

export async function verifyEmail(token: string): Promise<AuthState> {
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: token,
      emailVerificationExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return { error: "Invalid or expired verification link." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
  });

  return {};
}

export async function requestPasswordReset(email: string): Promise<AuthState> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || user.provider === "google") {
    return {};
  }

  const resetToken = randomBytes(32).toString("hex");
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    },
  });

  const mailed = await sendPasswordResetEmail(user.email, resetToken);
  if (!mailed.ok) {
    return { error: "Could not send the reset email right now. Please try again." };
  }

  return {};
}

export async function resetPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const schema = z.object({
    token: z.string(),
    password: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

  const parsed = schema.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: parsed.data.token,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return { error: "Invalid or expired reset link." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  await setSessionCookie({ id: user.id, email: user.email });
  redirect("/today");
}

export async function linkGoogleAccount(
  accessToken: string,
): Promise<AuthState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  if (!process.env.GOOGLE_CLIENT_ID) {
    return { error: "Google sign-in is not configured." };
  }

  let info: {
    email?: string;
    email_verified?: boolean;
    name?: string | null;
    picture?: string | null;
    sub?: string;
  };

  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) {
      return { error: "Google could not verify this account." };
    }
    info = (await response.json()) as typeof info;
  } catch {
    return { error: "Could not reach Google to verify your account." };
  }

  const email = info.email?.trim().toLowerCase();
  if (!email || !info.email_verified) {
    return { error: "A verified Google email is required to continue." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== session.id) {
    return { error: "This Google account is already linked to another account." };
  }

  await prisma.user.update({
    where: { id: session.id },
    data: {
      provider: "google",
      providerId: info.sub ?? null,
      emailVerified: new Date(),
      image: info.picture ?? null,
      name: info.name ?? null,
    },
  });

  return {};
}