"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { ErrorText } from "@/components/states";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, formAction] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => {
      const auth = await import("@/lib/actions/auth");
      return auth.verifyEmail(formData.get("token") as string);
    },
    {},
  );

  if (!token) {
    return (
      <main className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
        <div className="animate-rise relative z-10">
<p className="eyebrow">HabItiva</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight text-ink">
          Verify your email
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          This verification link is invalid or has expired.
        </p>

          <div className="card mt-8 p-6 text-center">
            <p className="text-sm text-muted">
              This verification link is invalid or has expired.
            </p>
            <p className="mt-4 text-center text-sm text-muted">
              <Link
                href="/login"
                className="font-semibold text-accent underline-offset-4 hover:underline"
              >
                Return to login
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-muted">
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-ink"
            >
              Privacy policy
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <div className="animate-rise relative z-10">
        <p className="eyebrow">HabItiva</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight text-ink">
          Verify your email
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Click the button below to confirm your email address and activate your account.
        </p>

        <div className="card mt-8 p-6">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <ErrorText message={state.error} />
            <SubmitButton className="btn-primary w-full">
              Verify email
            </SubmitButton>
          </form>

          {state.error ? null : (
            <p className="mt-4 text-center text-sm text-muted">
              You&apos;ll be redirected to the app after verification.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-ink"
          >
            Privacy policy
          </Link>
        </p>
      </div>
    </main>
  );
}