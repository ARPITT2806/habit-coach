import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { DeleteAllData } from "@/components/delete-all-data";

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <div className="animate-rise relative z-10">
        <p className="eyebrow">HabItiva</p>
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

        <p className="mt-3 text-center text-sm text-muted">
          <Link
            href="/forgot-password"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Forgot password?
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

        <DeleteAllData />
      </div>
    </main>
  );
}
