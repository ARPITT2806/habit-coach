import Link from "next/link";

import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <div className="animate-rise relative z-10">
        <p className="eyebrow">HabItiva</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight text-ink">
          Create your space.
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Start with one goal. The coach waits until it has real evidence.
        </p>

        <div className="card mt-8 p-6">
          <AuthForm mode="signup" />
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>

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