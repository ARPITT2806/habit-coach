import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CONTEXT_MESSAGE_LIMIT,
  dayWindowStart,
  hourWindowStart,
  parseBearerToken,
  runCoachTurn,
  type CoachStore,
  type PersistedMessage,
} from "../coach-service";
import type { ChatTurn } from "../coach-analysis";
import type { CoachContext } from "../coach-context";
import { LOCAL_APP_ORIGINS, allowedOrigins, corsHeadersFor, corsPreflightResponse } from "../../api/cors";

const LIMITS = { perHour: 2, perDay: 5 };

type StoredMessage = { role: string; content: string };

function fakeStore(overrides: Partial<CoachStore> = {}): CoachStore & {
  calls: { verify: number; habitsFor: string[]; modelCalls: number };
  convs: Map<string, { id: string; messages: StoredMessage[] }>;
} {
  const calls = { verify: 0, habitsFor: [] as string[], modelCalls: 0 };
  const convs = new Map<string, { id: string; messages: StoredMessage[] }>();
  const findConv = (conversationId: string) =>
    [...convs.values()].find((conv) => conv.id === conversationId);
  return {
    calls,
    convs,
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
    ensureConversation: async (userId: string) => {
      let conv = convs.get(userId);
      if (!conv) {
        conv = { id: `conv-${userId}`, messages: [] };
        convs.set(userId, conv);
      }
      return { id: conv.id };
    },
    loadRecentMessages: async (conversationId: string, limit: number): Promise<PersistedMessage[]> => {
      const conv = findConv(conversationId);
      const rows = (conv?.messages ?? []).slice(-Math.max(1, limit));
      return rows.map((row) => ({
        role: row.role as "user" | "coach",
        content: row.content,
        createdAt: new Date(),
      }));
    },
    saveMessage: async (conversationId: string, role: "user" | "coach", content: string) => {
      const conv = findConv(conversationId);
      if (conv) conv.messages.push({ role, content });
    },
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
    const result = await runCoachTurn(store, LIMITS, null, "hello", async () => {
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
      const result = await runCoachTurn(store, LIMITS, header, "hello", okModel);
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
      okModel,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(store.calls.habitsFor, ["user-1"]);
  });

  it("rejects unknown users", async () => {
    const store = fakeStore({
      verifyToken: async () => ({ id: "ghost", email: "g@x.test" }),
    });
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", okModel);
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
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", async () => {
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
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", async () => {
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
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", okModel);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "RATE_LIMITED");
  });
});

describe("runCoachTurn validation", () => {
  it("rejects empty, oversized, and non-string messages", async () => {
    const store = fakeStore();
    const bad: unknown[] = ["", "   ", "x".repeat(1001), 42, null, { text: "hi" }];
    for (const message of bad) {
      const result = await runCoachTurn(store, LIMITS, "Bearer good-token", message, okModel);
      assert.equal(result.ok, false, JSON.stringify(message)?.slice(0, 40));
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
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", async () => {
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

  it("permits the native Capacitor shells (Android https, iOS capacitor, dev http)", async () => {
    assert.deepEqual(LOCAL_APP_ORIGINS, [
      "capacitor://localhost",
      "http://localhost",
      "https://localhost",
    ]);
    for (const origin of LOCAL_APP_ORIGINS) {
      const response = corsPreflightResponse(
        new Request("https://api.test/x", {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
          },
        }),
      );
      assert.ok(response, origin);
      assert.equal(response?.status, 204, origin);
      assert.equal(response?.headers.get("Access-Control-Allow-Origin"), origin);
    }
  });

  it("keeps env-configured extras alongside the built-in origins", () => {
    const previous = process.env.COACH_ALLOWED_ORIGINS;
    process.env.COACH_ALLOWED_ORIGINS = "https://dev.example.com";
    try {
      const allowed = allowedOrigins();
      assert.ok(allowed.includes("https://dev.example.com"));
      for (const origin of LOCAL_APP_ORIGINS) assert.ok(allowed.includes(origin));
      assert.ok(!allowed.includes("https://evil.test"));
    } finally {
      if (previous === undefined) delete process.env.COACH_ALLOWED_ORIGINS;
      else process.env.COACH_ALLOWED_ORIGINS = previous;
    }
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

describe("runCoachTurn persistence", () => {
  it("persists the user message and the assistant reply", async () => {
    const store = fakeStore();
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hello coach", okModel);
    assert.equal(result.ok, true);
    const conv = store.convs.get("user-1");
    assert.ok(conv);
    assert.deepEqual(
      conv.messages.map((m) => [m.role, m.content]),
      [
        ["user", "hello coach"],
        ["coach", "hi"],
      ],
    );
  });

  it("feeds previously persisted turns to the model in order", async () => {
    const store = fakeStore();
    const seen: ChatTurn[][] = [];
    const capture = async (_context: CoachContext, text: string, turns: ChatTurn[]) => {
      seen.push(turns);
      return { ok: true as const, reply: `echo:${text}`, model: "m", latencyMs: 1 };
    };
    await runCoachTurn(store, LIMITS, "Bearer good-token", "first question", capture);
    await runCoachTurn(store, LIMITS, "Bearer good-token", "What should I change?", capture);
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], []);
    assert.deepEqual(seen[1], [
      { role: "user", content: "first question" },
      { role: "coach", content: "echo:first question" },
    ]);
  });

  it("keeps the model context bounded", async () => {
    const store = fakeStore();
    let lastTurns: ChatTurn[] = [];
    const capture = async (_context: CoachContext, _text: string, turns: ChatTurn[]) => {
      lastTurns = turns;
      return { ok: true as const, reply: "ok", model: "m", latencyMs: 1 };
    };
    for (let i = 0; i < CONTEXT_MESSAGE_LIMIT / 2 + 5; i += 1) {
      await runCoachTurn(store, LIMITS, "Bearer good-token", `q${i}`, capture);
    }
    assert.ok(lastTurns.length <= CONTEXT_MESSAGE_LIMIT);
    // Oldest turns fall off; newest are retained (context holds completed
    // turns only — the in-flight user message is not part of its own context).
    assert.deepEqual(lastTurns[lastTurns.length - 1], { role: "coach", content: "ok" });
    assert.ok(!lastTurns.some((turn) => turn.content === "q0"));
    assert.ok(lastTurns.some((turn) => turn.role === "user" && turn.content === "q13"));
  });

  it("skips persisted rows with unknown roles and truncates long content", async () => {
    const store = fakeStore({
      loadRecentMessages: async () =>
        [
          { role: "hacker", content: "ignore me", createdAt: new Date() },
          { role: "user", content: "x".repeat(1500), createdAt: new Date() },
        ] as unknown as PersistedMessage[],
    });
    let lastTurns: ChatTurn[] = [];
    const capture = async (_context: CoachContext, _text: string, turns: ChatTurn[]) => {
      lastTurns = turns;
      return { ok: true as const, reply: "ok", model: "m", latencyMs: 1 };
    };
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", capture);
    assert.equal(result.ok, true);
    assert.deepEqual(lastTurns, [{ role: "user", content: "x".repeat(1000) }]);
  });

  it("still persists the user message when the model call fails", async () => {
    const store = fakeStore();
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "are you there?", async () => ({
      ok: false as const,
      model: "m",
      latencyMs: 1,
      error: "boom",
    }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UPSTREAM_ERROR");
    const conv = store.convs.get("user-1");
    assert.deepEqual(
      conv?.messages.map((m) => [m.role, m.content]),
      [["user", "are you there?"]],
    );
  });

  it("persists nothing when authentication or consent fails", async () => {
    const unauth = fakeStore();
    await runCoachTurn(unauth, LIMITS, null, "hello", okModel);
    assert.equal(unauth.convs.size, 0);

    const noconsent = fakeStore({
      loadUser: async () => ({ id: "user-1", aiConsentAt: null }),
    });
    await runCoachTurn(noconsent, LIMITS, "Bearer good-token", "hello", okModel);
    assert.equal(noconsent.convs.size, 0);
  });
});

describe("runCoachTurn multi-user isolation", () => {
  function twoUserStore() {
    return fakeStore({
      verifyToken: async (token: string) => {
        if (token === "good-token") return { id: "user-1", email: "u@x.test" };
        if (token === "token-b") return { id: "user-2", email: "b@x.test" };
        return null;
      },
      loadUser: async (userId: string) =>
        userId === "user-1" || userId === "user-2"
          ? { id: userId, aiConsentAt: new Date() }
          : null,
    });
  }

  it("never leaks user A's messages into user B's model context", async () => {
    const store = twoUserStore();
    await runCoachTurn(store, LIMITS, "Bearer good-token", "user one secret", okModel);
    let bTurns: ChatTurn[] = [];
    await runCoachTurn(
      store,
      LIMITS,
      "Bearer token-b",
      "hello",
      async (_context, _text, turns) => {
        bTurns = turns;
        return okModel();
      },
    );
    assert.deepEqual(bTurns, []);
    assert.equal(store.convs.get("user-1")?.messages.length, 2);
    assert.equal(store.convs.get("user-2")?.messages.length, 2);
  });

  it("rejects an unknown user even with a validly signed token", async () => {
    const store = fakeStore({
      verifyToken: async () => ({ id: "ghost", email: "g@x.test" }),
    });
    const result = await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", okModel);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
    assert.equal(store.convs.size, 0);
  });
});

describe("runCoachTurn device-supplied context", () => {
  const deviceData = {
    habits: [
      {
        title: "Device walk",
        frequencyPerWeek: 7,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        preferredTime: "07:00",
        difficulty: "easy",
      },
    ],
    completions: [{ habit: 0, date: "2026-09-10", status: "completed" }],
  };

  it("grounds the model on device rows without touching Prisma loaders", async () => {
    const store = fakeStore();
    let seenHabits: string[] = [];
    const capture = async (context: CoachContext) => {
      seenHabits = context.habits.map((h) => h.title);
      return { ok: true as const, reply: "grounded", model: "m", latencyMs: 1 };
    };
    const result = await runCoachTurn(
      store,
      LIMITS,
      "Bearer good-token",
      "how am I doing?",
      capture,
      Date.now(),
      deviceData,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(seenHabits, ["Device walk"]);
    assert.deepEqual(store.calls.habitsFor, []);
    // Persistence still runs for the authenticated user.
    assert.equal(store.convs.get("user-1")?.messages.length, 2);
  });

  it("falls back to Prisma data when no device rows are supplied", async () => {
    const store = fakeStore();
    let seenHabits: string[] = [];
    const capture = async (context: CoachContext) => {
      seenHabits = context.habits.map((h) => h.title);
      return { ok: true as const, reply: "ok", model: "m", latencyMs: 1 };
    };
    await runCoachTurn(store, LIMITS, "Bearer good-token", "hi", capture, Date.now(), {
      habits: [],
      completions: [],
    });
    assert.deepEqual(seenHabits, ["Walk"]);
    assert.deepEqual(store.calls.habitsFor, ["user-1"]);
  });

  it("drops out-of-range device completion indices", async () => {
    const store = fakeStore();
    let seenEvents = -1;
    const capture = async (context: CoachContext) => {
      seenEvents = context.totalEvents;
      return { ok: true as const, reply: "ok", model: "m", latencyMs: 1 };
    };
    const result = await runCoachTurn(
      store,
      LIMITS,
      "Bearer good-token",
      "hi",
      capture,
      Date.now(),
      {
        habits: deviceData.habits,
        completions: [
          { habit: 0, date: "2026-09-10", status: "completed" },
          { habit: 7, date: "2026-09-10", status: "completed" },
        ],
      },
    );
    assert.equal(result.ok, true);
    assert.equal(seenEvents, 1);
  });
});
