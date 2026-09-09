import { AuthForm } from "@/components/auth-form";

export default function ResetPasswordPage() {
  return (
    <main className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <div className="animate-rise relative z-10">
        <p className="eyebrow">HabItiva</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight text-ink">
          Reset your password
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Enter your new password below. It must be at least 8 characters.
        </p>

        <div className="card mt-8 p-6">
          <AuthForm mode="reset" />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          <a
            href="/privacy"
            className="underline underline-offset-4 hover:text-ink"
          >
            Privacy policy
          </a>
        </p>
      </div>
    </main>
  );
}