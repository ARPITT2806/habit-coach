"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, getSession, setSessionCookie } from "@/lib/auth";
import { authThrottled, clearAuthFails, recordAuthFail } from "@/lib/auth-rate";
import { performPasswordReset, requestPasswordReset as requestPasswordResetCore } from "@/lib/auth-password";
import { registerAccount } from "@/lib/auth-registration";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
  name: z.string().min(1).max(60).optional(),
});

export type AuthState = { error?: string; notice?: string };

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

  const result = await registerAccount({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? ""),
  });
  if (!result.ok) {
    // EMAIL_TAKEN carries its specific message; every other failure stays
    // generic (the form already enforces length client-side).
    return { error: result.code === "EMAIL_TAKEN" ? result.error : "Check your details and try again." };
  }

  await setSessionCookie({ id: result.userId, email: result.email });
  if (!result.emailSent) {
    // Account exists but the verification mail could not be delivered: keep
    // the session and guide toward the resend flow instead of stranding the
    // user or forcing a duplicate signup.
    return {
      notice:
        "Your account was created, but we couldn't send the verification email. Sign in, then use “Didn't get a verification email? Resend it”.",
    };
  }
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
  // Always neutral (unknown addresses, Google accounts, throttling, and
  // mailer failures share one response) so emails cannot be enumerated.
  await requestPasswordResetCore(email);
  return {
    notice: "If an account exists for that email, we'll send password reset instructions.",
  };
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

  const result = await performPasswordReset(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    return { error: result.error };
  }

  const session = await getSession();
  if (session) {
    redirect("/today");
  }
  return { notice: "Password reset successfully. You can now sign in." };
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