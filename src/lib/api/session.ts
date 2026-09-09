import { Preferences } from "@capacitor/preferences";

import { getBackendUrl } from "./backend-url";

const TOKEN_KEY = "habitiva.sessionToken";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

export type AuthResult =
  | { ok: true; token: string; user: SessionUser; verified?: boolean }
  | { ok: false; code: string; error: string };

/** Token storage: Capacitor Preferences (native) with localStorage fallback. */
export async function getSessionToken(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    if (value) return value;
  } catch {
    // fall through to localStorage
  }
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    await Preferences.set({ key: TOKEN_KEY, value: token });
    return;
  } catch {
    // fall through
  }
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage is best-effort
  }
}

export async function clearSessionToken(): Promise<void> {
  try {
    await Preferences.remove({ key: TOKEN_KEY });
  } catch {
    // fall through
  }
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage is best-effort
  }
}

async function postAuth(
  path: "/api/auth/login" | "/api/auth/signup",
  body: Record<string, unknown>,
): Promise<AuthResult> {
  const baseUrl = getBackendUrl();
  if (!baseUrl) {
    return { ok: false, code: "NO_BACKEND", error: "No production backend is configured." };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      code: "OFFLINE",
      error: "Could not reach the Habitiva server. Check your connection.",
    };
  }

  let payload: { ok?: unknown; token?: unknown; user?: unknown; code?: unknown } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { ok: false, code: "UPSTREAM_ERROR", error: "Unexpected server response." };
  }

  if (
    response.ok &&
    payload.ok === true &&
    typeof payload.token === "string" &&
    typeof payload.user === "object" &&
    payload.user !== null
  ) {
    const user = payload.user as { id?: unknown; email?: unknown; name?: unknown };
    if (typeof user.id !== "string" || typeof user.email !== "string") {
      return { ok: false, code: "UPSTREAM_ERROR", error: "Unexpected server response." };
    }
    const result = {
      ok: true as const,
      token: payload.token,
      user: {
        id: user.id,
        email: user.email,
        name: typeof user.name === "string" ? user.name : null,
      },
      verified: (payload as { verified?: unknown }).verified !== false,
    };
    await setSessionToken(result.token);
    return result;
  }

  const code = typeof payload.code === "string" ? payload.code : "UNAUTHORIZED";
  const errors: Record<string, string> = {
    EMAIL_UNVERIFIED: "Please verify your email before signing in.",
    EMAIL_TAKEN: "An account with that email already exists.",
    EMAIL_SEND_FAILED: "Could not send the verification email. Please try signing up again.",
    BAD_REQUEST: "Check your details and try again.",
    UPSTREAM_ERROR: "The server is temporarily unavailable.",
  };
  return { ok: false, code, error: errors[code] ?? "Email or password is incorrect." };
}

export function logIn(email: string, password: string): Promise<AuthResult> {
  return postAuth("/api/auth/login", { email, password });
}

export function signUp(email: string, password: string, name?: string): Promise<AuthResult> {
  return postAuth("/api/auth/signup", { email, password, name });
}

export async function logOut(): Promise<void> {
  await clearSessionToken();
}
