"use client";

import { useActionState } from "react";
import { logIn, signUp, type AuthState } from "@/lib/actions/auth";
import { ErrorText } from "./states";
import { SubmitButton } from "./submit-button";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? logIn : signUp;
  const [state, formAction] = useActionState(action, {} as AuthState);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "signup" ? (
        <label className="block text-sm text-muted">
          Name
          <input name="name" className="field" autoComplete="name" placeholder="Ada" />
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
          defaultValue={mode === "login" ? "demo@north.app" : ""}
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
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          defaultValue={mode === "login" ? "demo1234" : ""}
        />
      </label>
      <ErrorText message={state.error} />
      <SubmitButton className="btn-primary w-full">
        {mode === "login" ? "Continue" : "Create account"}
      </SubmitButton>
    </form>
  );
}
