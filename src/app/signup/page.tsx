import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs uppercase tracking-[0.22em] text-muted">North</p>
      <h1 className="mt-4 font-serif text-4xl leading-tight">Create your space.</h1>
      <p className="mt-3 text-base leading-7 text-muted">
        Start with one goal. The coach waits until it has real evidence.
      </p>
      <div className="mt-10">
        <AuthForm mode="signup" />
      </div>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
