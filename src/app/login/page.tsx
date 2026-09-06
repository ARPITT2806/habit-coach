import Link from "next/link";

import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[-80px] z-0 h-[260px] w-[260px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="animate-rise relative z-10">
        <p className="overline">Habit Coach</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight text-ink">
          A quieter way to stay consistent.
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Track less. Understand more. Change habits only when the data supports it.
        </p>

        <div className="card mt-8 p-6">
          <AuthForm mode="login" />
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
