import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  requestVerificationResend,
  type VerificationStore,
} from "../auth-verification";

function fakeStore(users: Record<string, { id: string; verified: boolean }>) {
  const saved: { email: string; token: string; expires: Date }[] = [];
  const mailed: { to: string; token: string }[] = [];
  const store: VerificationStore = {
    findUnverifiedId: async (email: string) => {
      const user = users[email];
      return user && !user.verified ? user.id : null;
    },
    saveToken: async (email: string, token: string, expires: Date) => {
      saved.push({ email, token, expires });
    },
  };
  return {
    store,
    saved,
    mailed,
    mailer: async (to: string, token: string) => {
      mailed.push({ to, token });
      return { ok: true };
    },
  };
}

describe("resend verification", () => {
  it("mails a fresh token for an unverified account without exposing it", async () => {
    const f = fakeStore({ "u@x.test": { id: "u1", verified: false } });
    const result = await requestVerificationResend(
      f.store,
      "U@x.test ",
      f.mailer,
      () => "FIXEDTOKEN",
    );
    assert.equal(result.ok, true);
    assert.equal(f.saved.length, 1);
    assert.equal(f.saved[0]?.token, "FIXEDTOKEN");
    assert.ok((f.saved[0]?.expires.getTime() ?? 0) > Date.now());
    assert.deepEqual(f.mailed, [{ to: "u@x.test", token: "FIXEDTOKEN" }]);
    assert.ok(!JSON.stringify(result).includes("FIXEDTOKEN"));
  });

  it("returns neutral responses for unknown and verified accounts", async () => {
    const f = fakeStore({ "v@x.test": { id: "v1", verified: true } });
    const unknown = await requestVerificationResend(f.store, "nobody@x.test", f.mailer, () => "T");
    const verified = await requestVerificationResend(f.store, "v@x.test", f.mailer, () => "T");
    assert.equal(unknown.ok, true);
    assert.equal(verified.ok, true);
    assert.equal(f.saved.length, 0);
    assert.equal(f.mailed.length, 0);
    assert.ok(!JSON.stringify(unknown).includes("T1"));
  });

  it("rejects malformed email without touching store or mailer", async () => {
    const f = fakeStore({});
    const result = await requestVerificationResend(f.store, "not-an-email", f.mailer, () => "T");
    assert.equal(result.ok, true);
    assert.equal(f.saved.length, 0);
    assert.equal(f.mailed.length, 0);
  });

  it("rate-limits repeated requests for one address", async () => {
    const f = fakeStore({ "u@x.test": { id: "u1", verified: false } });
    for (let i = 0; i < 12; i += 1) {
      const result = await requestVerificationResend(f.store, "u@x.test", f.mailer, () => `T${i}`);
      assert.equal(result.ok, true);
    }
    assert.ok(f.mailed.length <= 10);
  });

  it("stays neutral when the mailer fails", async () => {
    const f = fakeStore({ "u@x.test": { id: "u1", verified: false } });
    const result = await requestVerificationResend(
      f.store,
      "u@x.test",
      async () => ({ ok: false }),
      () => "T",
    );
    assert.equal(result.ok, true);
    assert.ok(!JSON.stringify(result).includes("T0"));
  });
});
