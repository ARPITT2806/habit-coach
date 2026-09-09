/**
 * Minimal CORS for the production Coach API. Same-origin browser calls need
 * no headers; cross-origin callers (the future Capacitor APK) must be
 * explicitly allowlisted via COACH_ALLOWED_ORIGINS. Bearer auth means no
 * credentialed requests, so a reflected-but-validated origin is sufficient.
 * Documented P1 origins: capacitor://localhost, http://localhost.
 */

export function allowedOrigins(): string[] {
  return (process.env.COACH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
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
