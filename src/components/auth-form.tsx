"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { getLocalUser, markLocalUserOnboarded } from "@/lib/local/session";
import { ErrorText } from "./states";
import { SubmitButton } from "./submit-button";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(undefined);
    setPending(true);

    try {
      const user = await getLocalUser();

      if (mode === "signup") {
        const name = String(formData.get("name") ?? "").trim();

        if (name) {
          const db = await import("@/lib/local/database").then(
            ({ getLocalDatabase }) => getLocalDatabase(),
          );

          const now = new Date().toISOString();

          await db.run(
            `UPDATE users SET name = ?, updated_at = ? WHERE id = ?`,
            [name, now, user.id],
          );
        }
      }

      await markLocalUserOnboarded();
      router.push("/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-4"
      onSubmit={() => setPending(true)}
    >
      {mode === "signup" ? (
        <label className="block text-sm text-muted">
          Name
          <input
            name="name"
            className="field"
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
      ) : null}

      <label className="block text-sm text-muted">
        Email
        <input
          name="email"
          type="email"
          required
          className="field"
          autoComplete="email"
        />
      </label>

      <label className="block text-sm text-muted">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="field"
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
        />
      </label>

      <ErrorText message={error} />

      <SubmitButton className="btn-primary w-full">
        {pending
          ? "Opening Habit Coach…"
          : mode === "login"
            ? "Continue"
            : "Create account"}
      </SubmitButton>
    </form>
  );
}
