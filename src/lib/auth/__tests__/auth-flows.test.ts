import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  registerAccount,
  type RegistrationStore,
} from "../../auth-registration";
import {
  performPasswordReset,
  requestPasswordReset,
  type PasswordStore,
} from "../../auth-password";

type UserRow = {
  id: string;
  email: string;
  emailVerified: Date | null;
  provider: string | null;
  passwordHash: string;
  vToken: string | null;
  vExp: Date | null;
  rToken: string | null;
  rExp: Date | null;
};

function makeDb() {
  const users = new Map<string, UserRow>();
  let seq = 0;
  return { users, nextId: () => `u${(seq += 1)}` };
}

function regStore(db: ReturnType<typeof makeDb>): RegistrationStore & { db: typeof db } {
  return {
    db,
    findByEmail: async (email) => {
      const row = db.users.get(email);
      return row ? { id: row.id, emailVerified: row.emailVerified } : null;
    },
    createUser: async (data) => {
      const id = db.nextId();
      db.users.set(data.email, {
        id,
        email: data.email,
        emailVerified: null,
        provider: "email",
        passwordHash: data.passwordHash,
        vToken: data.token,
        vExp: data.expires,
        rToken: null,
        rExp: null,
      });
      return { id, email: data.email };
    },
    saveToken: async (userId, token, expires) => {
      for (const row of db.users.values()) {
        if (row.id === userId) {
          row.vToken = token;
          row.vExp = expires;
        }
      }
    },
  };
}

function pwStore(db: ReturnType<typeof makeDb>): PasswordStore {
  return {
    findByEmail: async (email) => {
      const row = db.users.get(email);
      return row ? { id: row.id, provider: row.provider } : null;
    },
    saveResetToken: async (userId, token, expires) => {
      for (const row of db.users.values()) {
        if (row.id === userId) {
          row.rToken = token;
          row.rExp = expires;
        }
      }
    },
    findByResetToken: async (token, now) => {
      for (const row of db.users.values()) {
        if (row.rToken === token && row.rExp && row.rExp > now) return { id: row.id };
      }
      return null;
    },
    completeReset: async (userId, passwordHash) => {
      for (const row of db.users.values()) {
        if (row.id === userId) {
          row.passwordHash = passwordHash;
          row.rToken = null;
          row.rExp = null;
        }
      }
    },
  };
}

const okMailer = async () => ({ ok: true as const });
const failMailer = async () => ({ ok: false as const });

describe("registerAccount", () => {
  it("creates a verified-pending user and sends verification", async () => {
    const db = makeDb();
    const sent: Array<[string, string]> = [];
    const result = await registerAccount(
      { email: "New@x.test ", password: "password123", name: " New User " },
      regStore(db),
      async (to, token) => {
        sent.push([to, token]);
        return okMailer();
      },
      () => "TOK",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.emailSent, true);
    const row = db.users.get("new@x.test");
    assert.ok(row);
    assert.equal(row.emailVerified, null);
    assert.equal(row.vToken, "TOK");
    assert.ok((row.vExp?.getTime() ?? 0) > Date.now() + 23 * 3600_000);
    assert.ok(row.passwordHash !== "password123");
    assert.deepEqual(sent, [["new@x.test", "TOK"]]);
  });

  it("keeps the account when mail fails and reports emailSent:false", async () => {
    const db = makeDb();
    const result = await registerAccount(
      { email: "kept@x.test", password: "password123" },
      regStore(db),
      failMailer,
      () => "TOK",
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.emailSent, false);
    const row = db.users.get("kept@x.test");
    assert.ok(row);
    assert.equal(row.emailVerified, null);
    assert.equal(row.vToken, "TOK");
  });

  it("rejects verified addresses without sending again", async () => {
    const db = makeDb();
    db.users.set("old@x.test", {
      id: "u9",
      email: "old@x.test",
      emailVerified: new Date(),
      provider: "email",
      passwordHash: "h",
      vToken: null,
      vExp: null,
      rToken: null,
      rExp: null,
    });
    let mailed = 0;
    const result = await registerAccount(
      { email: "old@x.test", password: "password123" },
      regStore(db),
      async () => {
        mailed += 1;
        return okMailer();
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "EMAIL_TAKEN");
    assert.equal(mailed, 0);
    assert.equal(db.users.size, 1);
  });

  it("retries unverified addresses by rotating the token, not duplicating", async () => {
    const db = makeDb();
    const store = regStore(db);
    const first = await registerAccount(
      { email: "retry@x.test", password: "password123" },
      store,
      failMailer,
      () => "TOK-1",
    );
    assert.equal(first.ok, true);
    const sent: string[] = [];
    const second = await registerAccount(
      { email: "retry@x.test", password: "password123" },
      store,
      async (_to, token) => {
        sent.push(token);
        return okMailer();
      },
      () => "TOK-2",
    );
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.userId, second.userId);
    assert.equal(db.users.size, 1);
    assert.deepEqual(sent, ["TOK-2"]);
    assert.equal(db.users.get("retry@x.test")?.vToken, "TOK-2");
  });

  it("rejects invalid input without touching the store or mailer", async () => {
    const db = makeDb();
    let mailed = 0;
    for (const input of [
      { email: "not-an-email", password: "password123" },
      { email: "u@x.test", password: "short" },
      { email: "", password: "password123" },
    ]) {
      const result = await registerAccount(input, regStore(db), async () => {
        mailed += 1;
        return okMailer();
      });
      assert.equal(result.ok, false);
    }
    assert.equal(mailed, 0);
    assert.equal(db.users.size, 0);
  });

  it("throttles repeated attempts per address", async () => {
    const db = makeDb();
    let mailed = 0;
    const mailer = async () => {
      mailed += 1;
      return failMailer();
    };
    for (let i = 0; i < 12; i += 1) {
      await registerAccount({ email: "flood@x.test", password: "password123" }, regStore(db), mailer, () => `T${i}`);
    }
    assert.ok(mailed <= 10, `mailed=${mailed}`);
  });
});

describe("requestPasswordReset", () => {
  it("saves a 1-hour token and mails known email users", async () => {
    const db = makeDb();
    db.users.set("u@x.test", {
      id: "u1",
      email: "u@x.test",
      emailVerified: new Date(),
      provider: "email",
      passwordHash: "h",
      vToken: null,
      vExp: null,
      rToken: null,
      rExp: null,
    });
    const sent: Array<[string, string]> = [];
    const before = Date.now();
    const result = await requestPasswordReset(
      "u@x.test",
      pwStore(db),
      async (to, token) => {
        sent.push([to, token]);
        return okMailer();
      },
      () => "RESET-TOK",
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(sent, [["u@x.test", "RESET-TOK"]]);
    const row = db.users.get("u@x.test");
    assert.equal(row?.rToken, "RESET-TOK");
    assert.ok((row?.rExp?.getTime() ?? 0) > before + 55 * 60_000);
  });

  it("stays neutral for unknown, google, and invalid addresses", async () => {
    const db = makeDb();
    db.users.set("g@x.test", {
      id: "g1",
      email: "g@x.test",
      emailVerified: new Date(),
      provider: "google",
      passwordHash: "h",
      vToken: null,
      vExp: null,
      rToken: null,
      rExp: null,
    });
    let mailed = 0;
    const mailer = async () => {
      mailed += 1;
      return okMailer();
    };
    for (const email of ["nobody@x.test", "g@x.test", "not-an-email", ""]) {
      const result = await requestPasswordReset(email, pwStore(db), mailer);
      assert.deepEqual(result, { ok: true }, String(email));
    }
    assert.equal(mailed, 0);
    assert.equal(db.users.get("g@x.test")?.rToken, null);
  });

  it("caps mail sends under repeated requests", async () => {
    const db = makeDb();
    db.users.set("f@x.test", {
      id: "f1",
      email: "f@x.test",
      emailVerified: new Date(),
      provider: "email",
      passwordHash: "h",
      vToken: null,
      vExp: null,
      rToken: null,
      rExp: null,
    });
    let mailed = 0;
    for (let i = 0; i < 15; i += 1) {
      await requestPasswordReset("f@x.test", pwStore(db), async () => {
        mailed += 1;
        return okMailer();
      });
    }
    assert.ok(mailed <= 10, `mailed=${mailed}`);
  });
});

describe("performPasswordReset", () => {
  function seeded() {
    const db = makeDb();
    db.users.set("u@x.test", {
      id: "u1",
      email: "u@x.test",
      emailVerified: new Date(),
      provider: "email",
      passwordHash: "old-hash",
      vToken: null,
      vExp: null,
      rToken: "GOOD-TOK",
      rExp: new Date(Date.now() + 3600_000),
    });
    db.users.set("e@x.test", {
      id: "e1",
      email: "e@x.test",
      emailVerified: new Date(),
      provider: "email",
      passwordHash: "old-hash",
      vToken: null,
      vExp: null,
      rToken: "OLD-TOK",
      rExp: new Date(Date.now() - 1000),
    });
    return db;
  }

  it("resets with a valid token and invalidates it", async () => {
    const db = seeded();
    const hashes: string[] = [];
    const result = await performPasswordReset("GOOD-TOK", "newpassword1", pwStore(db), async (plain) => {
      hashes.push(plain);
      return `hashed:${plain}`;
    });
    assert.deepEqual(result, { ok: true, userId: "u1" });
    assert.deepEqual(hashes, ["newpassword1"]);
    assert.equal(db.users.get("u@x.test")?.passwordHash, "hashed:newpassword1");
    assert.equal(db.users.get("u@x.test")?.rToken, null);
    const reuse = await performPasswordReset("GOOD-TOK", "anotherpass1", pwStore(db));
    assert.equal(reuse.ok, false);
  });

  it("rejects unknown, expired, empty tokens and short passwords", async () => {
    const db = seeded();
    for (const [token, password] of [
      ["NOPE", "newpassword1"],
      ["OLD-TOK", "newpassword1"],
      ["", "newpassword1"],
      ["GOOD-TOK", "short"],
    ] as Array<[unknown, unknown]>) {
      const result = await performPasswordReset(token, password, pwStore(db));
      assert.equal(result.ok, false);
    }
    assert.equal(db.users.get("u@x.test")?.passwordHash, "old-hash");
    assert.equal(db.users.get("u@x.test")?.rToken, "GOOD-TOK");
  });
});
