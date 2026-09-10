/**
 * Backend base URL resolution for the production Coach transport.
 *
 * Order: explicit dev override (localStorage, never shipped) → build-time
 * NEXT_PUBLIC_HABITIVA_API_URL (public by nature: it is only a URL) →
 * canonical production API on native builds (so release APKs reach the
 * backend without extra configuration) → null on web (which keeps its
 * development server-action path). Production builds refuse non-HTTPS URLs
 * except loopback hosts, so a misconfigured APK fails closed instead of
 * leaking a Bearer token over cleartext.
 */

import { isNativeApp } from "../local/database";

const OVERRIDE_KEY = "habitiva.backendUrl";

/** Canonical production Habitiva API. Public by nature (a bare hostname). */
export const PRODUCTION_API_URL = "https://habit-coach-ramrakhyaniarpit-3913s-projects.vercel.app";

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
  if (configured && configured.trim()) {
    const normalized = normalize(configured);
    // An explicitly configured but invalid URL fails closed (null) rather
    // than silently falling back — misconfiguration must stay visible.
    if (!normalized) return null;
    return normalized;
  }
  // Release APKs have no build-time URL of their own; point them at the
  // canonical production backend. Web keeps null (dev server-action path).
  if (isNativeApp()) return PRODUCTION_API_URL;
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
