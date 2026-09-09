import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  dayWindowStart,
  hourWindowStart,
  parseBearerToken,
  runCoachTurn,
  type CoachStore,
} from "../coach-service";
import { corsHeadersFor, corsPreflightResponse } from "../../api/cors";

const LIMITS = { perHour: 2, perDay: 5 };

function fakeStore(overrides: Partial<CoachStore> = {}): CoachStore & {
  calls: { verify: number; habitsFor: string[]; modelCalls: number };
} {
  const calls = { verify: 0, habitsFor: [] as string[], modelCalls: 0 };
  return {
    calls,
    verifyToken: async (token: string) => {
      calls.verify += 1;
      if (token === "good-token") return { id: "user-1", email: "u@x.test" };
      return null;
    },
    loadUser: async (userId: string) =>
      userId === "user-1" ? { id: userId, aiConsentAt: new Date() } : null,
    loadHabits: async (userId: string) => {
      calls.habitsFor.push(userId);
      return [
        {
          id: "h1",
          title: "Walk",
          frequencyPerWeek: 7,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          preferredTime: "07:00",
          difficulty: "easy",
        },
      ];
    },
    loadCompletions: async () => [],
    getUsage: async () => 0,
    addUsage: async () => undefined,
    ...overrides,
  };
}

const okModel = async () => ({ ok: true as const, reply: "hi", model: "m", latencyMs: 1 });

describe("parseBearerToken", () => {
  it("rejects missing, empty, and non-Bearer schemes", () => {
    assert.equal(parseBearerToken(null), null);
    assert.equal(parseBearerToken(""), null);
    assert.equal(parseBearerToken("Token abc"), null);
    assert.equal(parseBearerToken("Bearer "), null);
    assert.equal(parseBearerToken("Bearer"), null);
  });

  it("extracts the token from a well-formed header", () => {
    assert.equal(parseBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  });

  it("rejects absurdly long tokens", () => {
    assert.equal(parseBearerToken(`Bearer ${"x".repeat(5000)}`), null);
  });
});

describe("runCoachTurn auth boundaries", () => {
  it("rejects missing auth without touching the store or model", async () => {
    const store = fakeStore();
    let modelCalled = false;
    const result = await runCoachTurn(store, LIMITS, null, "hello", [], async () => {
      modelCalled = true;
      return okModel();
    });
    assert.equal(result.ok, false);
    assert.equal(store.calls.verify, 0);
    assert.equal(modelCalled, false);
    if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
  });

  it("rejects invalid and expired tokens", async () => {
    const store = fakeStore();
    for (const header of ["Bearer nonsense", "Bearer expired-token"]) {
      const result = await runCoachTurn(store, LIMITS, header, "hello", [], okModel);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
    }
  });

  it("never lets the body override the authenticated user", async () => {
    const store = fakeStore();
    const result = await runCoachTurn(
      store,
      LIMITS,
      "Bearer good-token",
      "hello",
      [],
      okModel,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(store.calls.habitsFor, ["user-1"]);
  });

  it("rejects unknown users", async () => {
    const store = fakeStore({
      verifyToken: async () => ({ id: "ghost", email: "g@x.test" }),
    });
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", [], okModel);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
  });
});

describe("runCoachTurn consent gating", () => {
  it("requires consent before any model call", async () => {
    let modelCalled = false;
    const store = fakeStore({
      loadUser: async () => ({ id: "user-1", aiConsentAt: null }),
    });
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", [], async () => {
      modelCalled = true;
      return okModel();
    });
    assert.equal(result.ok, false);
    assert.equal(modelCalled, false);
    if (!result.ok) assert.equal(result.code, "AI_CONSENT_REQUIRED");
  });
});

describe("runCoachTurn rate limiting", () => {
  it("rejects over-hourly quota with retry info and no model call", async () => {
    let modelCalled = false;
    const store = fakeStore({
      getUsage: async (_u, windowType) => (windowType === "hour" ? 2 : 0),
    });
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", [], async () => {
      modelCalled = true;
      return okModel();
    });
    assert.equal(result.ok, false);
    assert.equal(modelCalled, false);
    if (!result.ok) {
      assert.equal(result.code, "RATE_LIMITED");
      assert.ok((result.retryAfterMs ?? 0) > 0);
    }
  });

  it("rejects over-daily quota", async () => {
    const store = fakeStore({
      getUsage: async (_u, windowType) => (windowType === "day" ? 5 : 0),
    });
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", [], okModel);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "RATE_LIMITED");
  });
});

describe("runCoachTurn validation", () => {
  it("rejects empty, oversized, and malformed payloads", async () => {
    const store = fakeStore();
    const bad: Array<[unknown, unknown]> = [
      ["", []],
      ["   ", []],
      ["x".repeat(1001), []],
      ["hi", [{ role: "user", content: "" }]],
      ["hi", [{ role: "user", content: "x".repeat(1001) }]],
      ["hi", [{ role: "hacker", content: "x" }]],
      ["hi", "not-an-array"],
      ["hi", new Array(11).fill({ role: "user", content: "x" })],
    ];
    for (const [message, history] of bad) {
      const result = await runCoachTurn(store, LIMITS, "Bearer good-token", message, history, okModel);
      assert.equal(result.ok, false, JSON.stringify(message).slice(0, 40));
      if (!result.ok) assert.equal(result.code, "BAD_REQUEST");
    }
  });
});

describe("runCoachTurn secrets and context", () => {
  it("sanitizes upstream failures and never echoes secrets", async () => {
    const store = fakeStore();
    const result = await runCoachTurn(
      store,
      LIMITS,
      "Bearer good-token",
      "hi",
      [],
      async () => ({
        ok: false as const,
        model: "m",
        latencyMs: 1,
        error: "boom sk-live-SECRET-123 config leak",
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "UPSTREAM_ERROR");
      assert.ok(!result.error.includes("sk-live-SECRET-123"));
    }
  });

  it("answers without a model call when no habits exist", async () => {
    let modelCalled = false;
    const store = fakeStore({ loadHabits: async () => [] });
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", [], async () => {
      modelCalled = true;
      return okModel();
    });
    assert.equal(result.ok, true);
    assert.equal(modelCalled, false);
  });
});

describe("CORS boundaries", () => {
  it("emits no headers for same-origin and disallowed origins", () => {
    assert.deepEqual(corsHeadersFor(new Request("https://api.test/x")), {});
    assert.deepEqual(
      corsHeadersFor(
        new Request("https://api.test/x", { headers: { Origin: "https://evil.test" } }),
      ),
      {},
    );
  });

  it("rejects preflight from disallowed origins", async () => {
    const response = corsPreflightResponse(
      new Request("https://api.test/x", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.test" },
      }),
    );
    assert.ok(response);
    assert.equal(response?.status, 403);
  });

  it("ignores non-preflight requests", () => {
    assert.equal(corsPreflightResponse(new Request("https://api.test/x")), null);
  });
});

describe("window math", () => {
  it("truncates hour and day windows in UTC", () => {
    const at = Date.UTC(2026, 8, 9, 14, 35, 12);
    assert.equal(hourWindowStart(at).toISOString(), "2026-09-09T14:00:00.000Z");
    assert.equal(dayWindowStart(at).toISOString(), "2026-09-09T00:00:00.000Z");
  });
});
