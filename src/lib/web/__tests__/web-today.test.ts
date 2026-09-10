import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getTodayForSession,
  parseSessionCookie,
  type TodayDeps,
  type WebTodayPayload,
} from "../../queries";

function payloadFor(userId: string, email: string): WebTodayPayload {
  return {
    user: {
      id: userId,
      email,
      name: "Test",
      onboardedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    goals: [],
    habits: [],
    completions: [],
    checkIns: [],
    date: "2026-09-10",
  };
}

function fakeDeps(byToken: Record<string, string>, byUser: Record<string, WebTodayPayload>): TodayDeps & {
  calls: { verify: number; loadFor: string[] };
} {
  const calls = { verify: 0, loadFor: [] as string[] };
  return {
    calls,
    verifyToken: async (token: string) => {
      calls.verify += 1;
      const userId = byToken[token];
      return userId ? { id: userId, email: `${userId}@x.test` } : null;
    },
    load: async (userId: string) => {
      calls.loadFor.push(userId);
      return byUser[userId] ?? null;
    },
  };
}

describe("parseSessionCookie", () => {
  it("extracts the session token from a Cookie header", () => {
    assert.equal(parseSessionCookie("north_session=abc.def.ghi"), "abc.def.ghi");
    assert.equal(
      parseSessionCookie("other=1; north_session=tok123; theme=dark"),
      "tok123",
    );
  });

  it("rejects missing, empty, and foreign cookies", () => {
    assert.equal(parseSessionCookie(null), null);
    assert.equal(parseSessionCookie(""), null);
    assert.equal(parseSessionCookie("theme=dark; other=1"), null);
    assert.equal(parseSessionCookie("north_session="), null);
    assert.equal(parseSessionCookie("north_session"), null);
  });
});

describe("getTodayForSession authorization", () => {
  it("rejects requests without a usable session and never touches data", async () => {
    const deps = fakeDeps({ tok: "user-1" }, { "user-1": payloadFor("user-1", "u@x.test") });
    for (const header of [null, "", "theme=dark", "north_session=", "north_session=bogus"]) {
      const result = await getTodayForSession(header, deps);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
    }
    assert.deepEqual(deps.calls.loadFor, []);
  });

  it("rejects tokens for unknown users", async () => {
    const deps = fakeDeps({ tok: "ghost" }, {});
    const result = await getTodayForSession("north_session=tok", deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
  });

  it("serves User A only User A's data", async () => {
    const deps = fakeDeps(
      { "tok-a": "user-a", "tok-b": "user-b" },
      { "user-a": payloadFor("user-a", "a@x.test"), "user-b": payloadFor("user-b", "b@x.test") },
    );
    const a = await getTodayForSession("north_session=tok-a", deps);
    assert.equal(a.ok, true);
    if (a.ok) {
      assert.equal(a.data.user.id, "user-a");
      assert.equal(a.data.user.email, "a@x.test");
    }
    const b = await getTodayForSession("north_session=tok-b", deps);
    assert.equal(b.ok, true);
    if (b.ok) assert.equal(b.data.user.id, "user-b");
    assert.deepEqual(deps.calls.loadFor, ["user-a", "user-b"]);
  });

  it("maps database failures to UPSTREAM_ERROR without leaking details", async () => {
    const deps = fakeDeps({ tok: "user-1" }, {});
    deps.load = async () => {
      throw new Error("connect ECONNREFUSED secret-host");
    };
    const result = await getTodayForSession("north_session=tok", deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "UPSTREAM_ERROR");
    }
  });

  it("treats verifier crashes as unauthenticated", async () => {
    const deps = fakeDeps({ tok: "user-1" }, { "user-1": payloadFor("user-1", "u@x.test") });
    deps.verifyToken = async () => {
      throw new Error("jose failure");
    };
    const result = await getTodayForSession("north_session=tok", deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNAUTHORIZED");
  });
});
