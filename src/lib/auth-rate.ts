/**
 * Brute-force throttle for email auth endpoints (shared by the form actions
 * and the JSON login/signup API routes so both enforce identical limits).
 * Dev-grade in-memory store, matching the existing approach in lib/ai.ts.
 */

const MAX_AUTH_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 10 * 60 * 1000;

const authAttempts = new Map<string, { fails: number; resetAt: number }>();

export function authThrottled(email: string): boolean {
  const now = Date.now();
  const entry = authAttempts.get(email);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(email, { fails: 0, resetAt: now + AUTH_WINDOW_MS });
    if (authAttempts.size > 5000) authAttempts.clear();
    return false;
  }
  return entry.fails >= MAX_AUTH_ATTEMPTS;
}

export function recordAuthFail(email: string): void {
  const now = Date.now();
  const entry = authAttempts.get(email);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(email, { fails: 1, resetAt: now + AUTH_WINDOW_MS });
  } else {
    entry.fails += 1;
  }
}

export function clearAuthFails(email: string): void {
  authAttempts.delete(email);
}
