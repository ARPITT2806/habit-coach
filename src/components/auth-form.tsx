"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getBackendUrl } from "@/lib/api/backend-url";
import { markLocalUserOnboarded, setLocalUserDetails } from "@/lib/local/session";
import { ErrorText } from "./states";
import { SubmitButton } from "./submit-button";

const serverMode = Boolean(process.env.NEXT_PUBLIC_HABITFLOW_SERVER);
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function AuthForm({
  mode,
}: {
  mode: "login" | "signup" | "forgot" | "reset";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"menu" | "email" | "reset">("menu");
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [googlePending, startGoogle] = useTransition();
  const [resendState, setResendState] = useState<"idle" | "sending" | "done">("idle");
  const emailRef = useRef<HTMLInputElement>(null);

  const resendVerification = useCallback(async () => {
    const email = emailRef.current?.value.trim().toLowerCase() ?? "";
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    const baseUrl = getBackendUrl() ?? "";
    if (!baseUrl && typeof window !== "undefined" && window.location.protocol === "capacitor:") {
      setError("Verification email needs a connection to the Habitiva server.");
      return;
    }
    setResendState("sending");
    try {
      const response = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setResendState("done");
        setError(undefined);
      } else {
        setResendState("idle");
        setError("Could not request a verification email right now. Try again.");
      }
    } catch {
      setResendState("idle");
      setError("Could not reach the server. Check your connection.");
    }
  }, []);

  const resetToken = searchParams.get("token") ?? "";

  const finish = useCallback(
    async (details?: { name?: string; email?: string }) => {
      if (details?.name || details?.email) {
        await setLocalUserDetails(details);
      }
      await markLocalUserOnboarded();
      router.push("/today");
    },
    [router],
  );

  const requestToken = useCallback(() => {
    if (typeof window === "undefined") return;

    const accounts = (window as unknown as {
      google: { accounts: { initTokenClient: (config: object) => { requestAccessToken: () => void } } };
    }).google?.accounts;

    if (!accounts) {
      setError("Google sign-in is unavailable.");
      return;
    }

    const client = accounts.initTokenClient({
      client_id: googleClientId,
      scope: "openid email profile",
      callback: (response: { access_token?: string; error?: string }) => {
        if (!response.access_token) {
          setError(response.error ? "Google sign-in was cancelled." : "Google sign-in failed.");
          return;
        }
        startGoogle(() => {
          void import("@/lib/actions/auth").then(({ signInWithGoogle }) =>
            signInWithGoogle(response.access_token!).then((result) => {
              if (result?.error) setError(result.error);
            }),
          );
        });
      },
    });

    client.requestAccessToken();
  }, []);

  function openGoogle() {
    setError(undefined);

    if (!serverMode) {
      void finish().catch((err) =>
        setError(err instanceof Error ? err.message : "Could not continue with Google."),
      );
      return;
    }

    if (!googleClientId) {
      setError("Google sign-in is not configured on this server.");
      return;
    }

    if (typeof window === "undefined") return;

    const existing = document.getElementById("gsi-script");
    const g = (window as unknown as { google?: { accounts?: unknown } }).google;

    if (!existing && !g) {
      const script = document.createElement("script");
      script.id = "gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (typeof window === "undefined") return;
        const ready = (window as unknown as { google?: { accounts?: unknown } })
          .google;
        if (!ready?.accounts) {
          setError("Google sign-in is unavailable right now.");
          return;
        }
        requestToken();
      };
      script.onerror = () => {
        setError("Could not load Google sign-in. Try again.");
      };
      document.head.appendChild(script);
      return;
    }

    if (g?.accounts) {
      requestToken();
      return;
    }

    setError("Google sign-in is still loading. Try again in a moment.");
  }

  async function handleEmailSubmit(formData: FormData) {
    setError(undefined);
    setNotice(undefined);
    setPending(true);

    try {
      if (serverMode) {
        const auth = await import("@/lib/actions/auth");
        let result;

        if (mode === "forgot") {
          result = await auth.requestPasswordReset(
            String(formData.get("email") ?? "").trim().toLowerCase(),
          );
        } else if (mode === "reset") {
          result = await auth.resetPassword({}, formData);
        } else {
          result =
            mode === "signup"
              ? await auth.signUp({}, formData)
              : await auth.logIn({}, formData);
        }

        if (result && "error" in result && result.error) {
          setError(result.error);
          setPending(false);
        } else if (result && "notice" in result && result.notice) {
          setNotice(result.notice);
          setPending(false);
        }
        return;
      }

      await finish({
        name: String(formData.get("name") ?? "").trim() || undefined,
        email: String(formData.get("email") ?? "").trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  if (view === "email" || view === "reset") {
    const isReset = view === "reset";

    return (
      <form
        action={handleEmailSubmit}
        className="space-y-4"
        onSubmit={() => setPending(true)}
      >
        <button
          type="button"
          onClick={() => setView("menu")}
          className="flex items-center gap-1.5 text-sm font-semibold text-accent"
        >
          ← Back
        </button>

        {(mode === "signup" || isReset) && !isReset ? (
          <label className="block text-sm text-muted">
            Name
            <input name="name" className="field" autoComplete="name" placeholder="Your name" />
          </label>
        ) : null}

        <label className="block text-sm text-muted">
          Email
          <input
            name="email"
            type="email"
            required
            ref={emailRef}
            className="field"
            autoComplete="email"
          />
        </label>

        {!isReset && serverMode ? (
          <label className="block text-sm text-muted">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="field"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
        ) : isReset ? (
          <>
            <input name="token" type="hidden" value={resetToken} />
            <label className="block text-sm text-muted">
              New password
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="field"
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm text-muted">
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                className="field"
                autoComplete="new-password"
              />
            </label>
          </>
        ) : null}

        {!serverMode && !isReset ? (
          <p className="rounded-2xl bg-sand px-4 py-3 text-xs leading-5 text-muted">
            {mode === "signup"
              ? "A local profile is created on this device with the details above. Nothing leaves the device."
              : "Signing in opens the local profile on this device. No password is required or stored."}
          </p>
        ) : null}

        <ErrorText message={error} />

        {notice && !error ? (
          <p className="rounded-2xl bg-accent-soft px-4 py-3 text-xs leading-5 text-accent">
            {notice}
          </p>
        ) : null}

        <SubmitButton className="btn-primary w-full">
          {pending
            ? "Opening HabItiva…"
            : isReset
            ? "Reset password"
            : mode === "login"
            ? "Continue"
            : mode === "forgot"
            ? "Send reset link"
            : "Create account"}
        </SubmitButton>

        {mode === "login" && !isReset ? (
          <div className="text-center">
            {resendState === "done" ? (
              <p className="text-xs leading-5 text-muted">
                If an unverified account exists for this email, a verification email
                has been sent.
              </p>
            ) : (
              <button
                type="button"
                disabled={resendState === "sending"}
                onClick={() => void resendVerification()}
                className="text-xs font-semibold text-accent underline-offset-4 hover:underline disabled:opacity-50"
              >
                {resendState === "sending"
                  ? "Sending…"
                  : "Didn't get a verification email? Resend it"}
              </button>
            )}
          </div>
        ) : null}
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {mode !== "forgot" && mode !== "reset" && (
        <>
          <button
            type="button"
            onClick={openGoogle}
            disabled={googlePending}
            className="btn-secondary"
          >
            <GoogleGlyph />
            {googlePending
              ? "Signing in with Google…"
              : "Continue with Google"}
          </button>

          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted">or</span>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <button type="button" onClick={() => setView("email")} className="btn-secondary">
        <MailGlyph />
        {mode === "login"
          ? "Continue with email"
          : mode === "forgot"
          ? "Reset password via email"
          : "Sign up with email"}
      </button>

      {!serverMode && mode !== "forgot" && mode !== "reset" ? (
        <p className="rounded-2xl bg-sand px-4 py-3 text-center text-xs leading-5 text-muted">
          Device-only mode · your profile is stored locally on this device.
        </p>
      ) : serverMode && mode !== "forgot" && mode !== "reset" ? (
        <p className="rounded-2xl bg-accent-soft px-4 py-3 text-center text-xs leading-5 text-accent">
          Connected account mode · sign in with Google or a password.
        </p>
      ) : null}

      <ErrorText message={error} />
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}