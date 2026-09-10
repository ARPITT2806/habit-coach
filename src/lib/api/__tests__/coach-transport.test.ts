import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getBackendUrl, setBackendUrlOverride } from "../backend-url";
import {
  fetchCoachHistory,
  parseRetryAfter,
  sendCoachTurn,
  grantRemoteConsent,
} from "../coach-client";
import { fetchTodayData } from "../web-today";

// Minimal browser stand-ins for client modules under plain Node.
const storage = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  },
  setTimeout: (...args: [() => void, number]) => setTimeout(args[0], args[1]),
  clearTimeout: (...args: [number]) => clearTimeout(args[0]),
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("backend URL resolution", () => {
  beforeEach(() => {
    storage.clear();
    delete process.env.NEXT_PUBLIC_HABITIVA_API_URL;
  });

  it("returns null when nothing is configured", () => {
    assert.equal(getBackendUrl(), null);
  });

  it("honors the build-time URL and trims slashes", () => {
    process.env.NEXT_PUBLIC_HABITIVA_API_URL = "https://api.example.com/";
    assert.equal(getBackendUrl(), "https://api.example.com");
  });

  it("prefers the dev override and clears it", () => {
    process.env.NEXT_PUBLIC_HABITIVA_API_URL = "https://api.example.com";
    setBackendUrlOverride("https://dev.example.com:3000/");
    assert.equal(getBackendUrl(), "https://dev.example.com:3000");
    setBackendUrlOverride(null);
    assert.equal(getBackendUrl(), "https://api.example.com");
  });

  it("rejects non-URL values", () => {
    process.env.NEXT_PUBLIC_HABITIVA_API_URL = "not-a-url";
    assert.equal(getBackendUrl(), null);
  });
});

describe("Retry-After parsing", () => {
  it("parses seconds, rejects garbage, caps at one hour", () => {
    assert.equal(parseRetryAfter(null), null);
    assert.equal(parseRetryAfter("120"), 120_000);
    assert.equal(parseRetryAfter("nope"), null);
    assert.equal(parseRetryAfter("-5"), null);
    assert.equal(parseRetryAfter("99999"), 3_600_000);
  });
});

describe("coach transport", () => {
  it("delivers success replies with usage", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      jsonResponse(200, { ok: true, message: "Focus on walking.", usage: { model: "m", latencyMs: 3 } });
    const result = await sendCoachTurn("https://api.example.com", "tok", "hi", []);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.message, "Focus on walking.");
  });

  it("maps 401 without retry loops", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => jsonResponse(401, { ok: false, code: "UNAUTHORIZED" });
    const result = await sendCoachTurn("https://api.example.com", "tok", "hi", []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
  });

  it("respects Retry-After on 429", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      jsonResponse(429, { ok: false, code: "RATE_LIMITED" }, { "Retry-After": "45" });
    const result = await sendCoachTurn("https://api.example.com", "tok", "hi", []);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "RATE_LIMITED");
      assert.equal(result.retryAfterMs, 45_000);
    }
  });

  it("surfaces consent requirement distinctly", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      jsonResponse(403, { ok: false, code: "AI_CONSENT_REQUIRED" });
    const result = await sendCoachTurn("https://api.example.com", "tok", "hi", []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "AI_CONSENT_REQUIRED");
  });

  it("treats network failure as offline without throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const result = await sendCoachTurn("https://api.example.com", "tok", "hi", []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "OFFLINE");
  });

  it("treats aborts as timeouts", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    const result = await sendCoachTurn("https://api.example.com", "tok", "hi", []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TIMEOUT");
  });

  it("handles malformed backend responses", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => new Response("not json", { status: 200 });
    const result = await sendCoachTurn("https://api.example.com", "tok", "hi", []);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UPSTREAM_ERROR");
  });

  it("bounds history and message size before sending", async () => {
    let seen: { message: string; history: { role: string; content: string }[] } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async (_url: string, init: any) => {
      seen = JSON.parse(init.body) as typeof seen;
      return jsonResponse(200, { ok: true, message: "ok" });
    };
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "coach") as "user" | "coach",
      content: "x".repeat(1500),
    }));
    const result = await sendCoachTurn("https://api.example.com", "tok", "ok", history);
    assert.equal(result.ok, true);
    assert.ok(seen);
    assert.equal(seen?.history.length, 10);
    assert.ok(seen?.history.every((turn) => turn.content.length <= 1000));

    let fetched = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => {
      fetched = true;
      return jsonResponse(200, { ok: true, message: "ok" });
    };
    const empty = await sendCoachTurn("https://api.example.com", "tok", "   ", []);
    assert.equal(empty.ok, false);
    assert.equal(fetched, false);
  });

  it("stores the token on login and clears it on logout", async () => {
    const session = await import("../session");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      jsonResponse(200, {
        ok: true,
        token: "tok-123",
        user: { id: "u1", email: "u@x.test", name: null },
      });
    process.env.NEXT_PUBLIC_HABITIVA_API_URL = "https://api.example.com";
    const logged = await session.logIn("u@x.test", "password123");
    assert.equal(logged.ok, true);
    assert.equal(await session.getSessionToken(), "tok-123");
    await session.logOut();
    assert.equal(await session.getSessionToken(), null);
    delete process.env.NEXT_PUBLIC_HABITIVA_API_URL;
  });

  it("rejects login failures without storing anything", async () => {
    const session = await import("../session");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => jsonResponse(401, { ok: false, code: "UNAUTHORIZED" });
    process.env.NEXT_PUBLIC_HABITIVA_API_URL = "https://api.example.com";
    const logged = await session.logIn("u@x.test", "wrongpass1");
    assert.equal(logged.ok, false);
    assert.equal(await session.getSessionToken(), null);
    delete process.env.NEXT_PUBLIC_HABITIVA_API_URL;
  });

  it("grants consent and maps auth failures", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => jsonResponse(200, { ok: true });
    assert.equal((await grantRemoteConsent("https://api.example.com", "tok")).ok, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => jsonResponse(401, { ok: false, code: "UNAUTHORIZED" });
    const denied = await grantRemoteConsent("https://api.example.com", "tok");
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "UNAUTHORIZED");
  });
});

describe("coach history restore", () => {
  it("returns persisted messages in order", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      jsonResponse(200, {
        ok: true,
        messages: [
          { role: "user", content: "first", createdAt: "2026-09-10T10:00:00.000Z" },
          { role: "coach", content: "reply", createdAt: "2026-09-10T10:00:05.000Z" },
        ],
      });
    const result = await fetchCoachHistory("https://api.example.com", "tok");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.messages, [
        { role: "user", content: "first", createdAt: "2026-09-10T10:00:00.000Z" },
        { role: "coach", content: "reply", createdAt: "2026-09-10T10:00:05.000Z" },
      ]);
    }
  });

  it("drops malformed items and truncates oversized content", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      jsonResponse(200, {
        ok: true,
        messages: [
          { role: "user", content: "x".repeat(1500), createdAt: "2026-09-10T10:00:00.000Z" },
          { role: "hacker", content: "nope", createdAt: "2026-09-10T10:00:01.000Z" },
          { role: "coach", content: 42, createdAt: "2026-09-10T10:00:02.000Z" },
          null,
        ],
      });
    const result = await fetchCoachHistory("https://api.example.com", "tok");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0]?.role, "user");
      assert.equal(result.messages[0]?.content.length, 1000);
    }
  });

  it("maps 401, malformed JSON, and offline distinctly", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => jsonResponse(401, { ok: false, code: "UNAUTHORIZED" });
    const denied = await fetchCoachHistory("https://api.example.com", "tok");
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "UNAUTHORIZED");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => new Response("not json", { status: 200 });
    const broken = await fetchCoachHistory("https://api.example.com", "tok");
    assert.equal(broken.ok, false);
    if (!broken.ok) assert.equal(broken.code, "UPSTREAM_ERROR");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const offline = await fetchCoachHistory("https://api.example.com", "tok");
    assert.equal(offline.ok, false);
    if (!offline.ok) assert.equal(offline.code, "OFFLINE");
  });
});

describe("web today transport", () => {
  const validData = {
    user: { id: "u1", email: "u@x.test", name: null, onboardedAt: null, createdAt: "", updatedAt: "" },
    goals: [],
    habits: [{ id: "h1", title: "Walk" }],
    completions: [],
    checkIns: [],
    date: "2026-09-10",
  };

  it("delivers validated server data", async () => {
    let seenUrl = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async (url: string) => {
      seenUrl = url;
      return jsonResponse(200, { ok: true, data: validData });
    };
    const result = await fetchTodayData();
    assert.equal(result.ok, true);
    assert.equal(seenUrl, "/api/web/today");
    if (result.ok) assert.equal(result.data.user.id, "u1");
  });

  it("rejects malformed payloads instead of passing them to page state", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      jsonResponse(200, { ok: true, data: { user: { id: 42 }, habits: "nope" } });
    const result = await fetchTodayData();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UPSTREAM_ERROR");
  });

  it("maps 401, malformed JSON, and offline distinctly", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => jsonResponse(401, { ok: false, code: "UNAUTHORIZED" });
    const denied = await fetchTodayData();
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "UNAUTHORIZED");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => new Response("not json", { status: 200 });
    const broken = await fetchTodayData();
    assert.equal(broken.ok, false);
    if (!broken.ok) assert.equal(broken.code, "UPSTREAM_ERROR");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const offline = await fetchTodayData();
    assert.equal(offline.ok, false);
    if (!offline.ok) assert.equal(offline.code, "OFFLINE");
  });
});
