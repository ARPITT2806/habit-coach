/**
 * Minimal CORS for the production Coach/API routes. Same-origin browser calls
 * need no headers; cross-origin callers (the Capacitor APK) must be
 * allowlisted. Bearer auth means no credentialed requests, so a
 * reflected-but-validated origin is sufficient.
 *
 * Origin set (exact match, no wildcards):
 * - COACH_ALLOWED_ORIGINS env (comma-separated extras, e.g. dev servers)
 * - Built-in local-app origins: the Capacitor native shells. Android uses
 *   https://localhost by default (CapConfig androidScheme), iOS/macOS use
 *   capacitor://localhost, and http://localhost covers local dev shells.
 *   These can only originate from software running on the user's own
 *   device/machine — never from a remote website (whose Origin would be its
 *   own domain) — so listing them explicitly does not open the API to the web.
 */

export const LOCAL_APP_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
];

export function allowedOrigins(): string[] {
  const fromEnv = (process.env.COACH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const merged = new Set<string>([...fromEnv, ...LOCAL_APP_ORIGINS]);
  return [...merged];
}

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!allowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function corsPreflightResponse(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  const headers = corsHeadersFor(request);
  if (Object.keys(headers).length === 0) {
    return Response.json({ ok: false, code: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
