import { SignJWT, jwtVerify } from "jose";

/**
 * Session-token primitives (jose HS256 JWT). Deliberately free of next/headers
 * and Prisma so server boundaries that must stay out of the
 * static-export module graph (e.g. API routes) can verify Bearer tokens
 * without pulling server-only runtimes. Cookie handling lives in lib/auth.
 */

export type SessionUser = {
  id: string;
  email: string;
};

/** Name of the httpOnly web session cookie (see lib/auth). */
export const SESSION_COOKIE_NAME = "north_session";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
