import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs uppercase tracking-[0.22em] text-muted">North</p>
      <h1 className="mt-4 font-serif text-4xl leading-tight text-ink">A quieter way to stay consistent.</h1>
      <p className="mt-3 text-base leading-7 text-muted">
        Track less. Understand more. Change habits only when the data supports it.
      </p>
      <div className="mt-10">
        <AuthForm mode="login" />
      </div>
      <p className="mt-6 text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="text-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-8 text-xs leading-5 text-muted">
        Demo account is prefilled: demo@north.app / demo1234, with two weeks of sample behavior.
      </p>
    </main>
  );
}
