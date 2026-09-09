/**
 * Backend base URL resolution for the production Coach transport.
 *
 * Order: explicit dev override (localStorage, never shipped) → build-time
 * NEXT_PUBLIC_HABITIVA_API_URL (public by nature: it is only a URL) → null
 * (offline/local-only mode). Production builds refuse non-HTTPS URLs except
 * loopback hosts, so a misconfigured APK fails closed instead of leaking a
 * Bearer token over cleartext.
 */

const OVERRIDE_KEY = "habitiva.backendUrl";

function normalize(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (
    process.env.NODE_ENV === "production" &&
    trimmed.toLowerCase().startsWith("http://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function getBackendUrl(): string | null {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage.getItem(OVERRIDE_KEY);
      if (override && override.trim()) {
        const normalized = normalize(override);
        if (normalized) return normalized;
      }
    } catch {
      // storage is best-effort
    }
  }
  const configured = process.env.NEXT_PUBLIC_HABITIVA_API_URL;
  if (configured && configured.trim()) return normalize(configured);
  return null;
}

export function setBackendUrlOverride(url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!url || !url.trim()) {
      window.localStorage.removeItem(OVERRIDE_KEY);
    } else {
      window.localStorage.setItem(OVERRIDE_KEY, url.trim());
    }
  } catch {
    // storage is best-effort
  }
}
