import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  passwordResetLink,
  sendPasswordResetEmail,
  sendVerificationEmail,
  verificationLink,
} from "../email";

describe("email links", () => {
  it("builds verification and reset links on the configured base", () => {
    process.env.NEXT_PUBLIC_HABITIVA_API_URL = "https://api.example.com/";
    assert.equal(
      verificationLink("tok123"),
      "https://api.example.com/verify-email?token=tok123",
    );
    assert.equal(
      passwordResetLink("tok456"),
      "https://api.example.com/reset-password?token=tok456",
    );
    delete process.env.NEXT_PUBLIC_HABITIVA_API_URL;
  });

  it("URL-encodes tokens in links", () => {
    process.env.NEXT_PUBLIC_HABITIVA_API_URL = "https://api.example.com";
    assert.ok(verificationLink("a/b?c").includes("a%2Fb%3Fc"));
    delete process.env.NEXT_PUBLIC_HABITIVA_API_URL;
  });
});

describe("email sending guards", () => {
  it("fails safely without a Resend key and never touches the network", async () => {
    delete process.env.RESEND_API_KEY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => {
      throw new Error("network must not be reached without a key");
    };
    const verify = await sendVerificationEmail("u@x.test", "tok");
    assert.equal(verify.ok, false);
    const reset = await sendPasswordResetEmail("u@x.test", "tok");
    assert.equal(reset.ok, false);
    if (!verify.ok) assert.ok(!verify.error.includes("tok"));
  });
});
