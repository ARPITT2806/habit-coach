"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sendCoachMessage } from "@/lib/actions/ai-coach";
import { getBackendUrl } from "@/lib/api/backend-url";
import {
  fetchCoachHistory,
  grantRemoteConsent,
  sendCoachTurn,
  type CoachHistoryTurn,
} from "@/lib/api/coach-client";
import {
  clearSessionToken,
  getSessionToken,
  logIn,
  requestPasswordResetEmail as forgotPassword,
  resendVerificationEmail as resendVerification,
  signUp,
} from "@/lib/api/session";
import { parseDaysOfWeek } from "@/lib/constants";
import { isNativeApp } from "@/lib/local/database";
import type { LocalCompletion, LocalHabit } from "@/lib/local/habits";

type Message = {
  role: "user" | "coach";
  content: string;
};

const EXAMPLE_PROMPTS = [
  "Why do I keep missing my workout?",
  "What should I focus on tomorrow?",
  "What patterns do you see in my last 30 days?",
  "I'm feeling unmotivated. What should I do?",
];

/** Dev-mode (local server action) display cache: last N messages per user. */
const DEV_HISTORY_LIMIT = 20;

function devHistoryKey(uid: string): string {
  return `habitiva.coachHistory:${uid}`;
}

function loadDevHistory(uid: string): Message[] {
  try {
    const raw = window.localStorage.getItem(devHistoryKey(uid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: Message[] = [];
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        ((item as { role?: unknown }).role === "user" ||
          (item as { role?: unknown }).role === "coach") &&
        typeof (item as { content?: unknown }).content === "string" &&
        (item as { content: string }).content.length > 0
      ) {
        valid.push({
          role: (item as { role: "user" | "coach" }).role,
          content: (item as { content: string }).content.slice(0, 1000),
        });
      }
    }
    return valid.slice(-DEV_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Conversational Habitiva Coach. Transport selection:
 * - backend URL + session token → production HTTPS transport (Bearer);
 * - otherwise, development server action (dev browser only);
 * - otherwise, honest offline state (APK without a configured backend).
 * Conversation history stays in state only; statistics are always derived
 * server-side (or in the dev action) — never trusted from the client.
 */
export function CoachChat({
  userId,
  habits,
  completions,
}: {
  userId: string;
  habits: LocalHabit[];
  completions: LocalCompletion[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [devRestored, setDevRestored] = useState(false);
  const [error, setError] = useState("");
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [remoteConsentPending, setRemoteConsentPending] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [consentedLocal, setConsentedLocal] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("habitiva.aiConsent") === "1";
    } catch {
      return false;
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setBackendUrl(getBackendUrl());
      const stored = await getSessionToken();
      if (alive && stored) setToken(stored);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (retryUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  const remoteMode = backendUrl !== null && token !== null;
  const devMode = !remoteMode && !isNativeApp();
  const rateLimited = retryUntil > nowTick;
  // Backend configured but no session yet: invite sign-in before anything else.
  const showConnect = needsSignIn || (backendUrl !== null && token === null);

  // Remote mode: restore the persisted conversation (server is the source of
  // truth; identity comes from the session token, never from the client).
  useEffect(() => {
    if (!remoteMode || !backendUrl || !token) return;
    let alive = true;
    const current = token;
    (async () => {
      setHistoryLoading(true);
      const result = await fetchCoachHistory(backendUrl, current);
      if (!alive) return;
      setHistoryLoading(false);
      if (result.ok) {
        setMessages(result.messages.map((m) => ({ role: m.role, content: m.content })));
      } else if (result.code === "UNAUTHORIZED") {
        await clearSessionToken();
        setToken(null);
        setNeedsSignIn(true);
        setError("Your session expired. Please sign in to continue coaching.");
      } else {
        setError(result.error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [remoteMode, backendUrl, token]);

  // Dev mode: no server identity exists, so restore the display cache from
  // local storage (display only — the server action still rebuilds all
  // statistics server-side from the payload on every turn).
  useEffect(() => {
    if (!devMode) return;
    let alive = true;
    (async () => {
      const restored = loadDevHistory(userId);
      if (!alive) return;
      setMessages(restored);
      setDevRestored(true);
    })();
    return () => {
      alive = false;
    };
  }, [devMode, userId]);

  useEffect(() => {
    if (!devMode || !devRestored) return;
    try {
      window.localStorage.setItem(devHistoryKey(userId), JSON.stringify(messages.slice(-DEV_HISTORY_LIMIT)));
    } catch {
      // storage is best-effort
    }
  }, [devMode, devRestored, userId, messages]);

  function grantLocalConsent() {
    try {
      window.localStorage.setItem("habitiva.aiConsent", "1");
    } catch {
      // storage is best-effort; the flag simply won't persist
    }
    setConsentedLocal(true);
    setError("");
  }

  const consented = remoteMode ? !remoteConsentPending : consentedLocal;

  const payload = useMemo(() => {
    const active = habits.filter((habit) => habit.isActive);
    return {
      habits: active.map((habit) => ({
        title: habit.title,
        frequencyPerWeek: habit.frequencyPerWeek,
        daysOfWeek: parseDaysOfWeek(habit.daysOfWeek),
        preferredTime: habit.preferredTime,
        difficulty: habit.difficulty,
      })),
      completions: completions
        .map((log) => ({
          habit: active.findIndex((habit) => habit.id === log.habitId),
          date: log.date,
          status: log.status,
        }))
        .filter((log) => log.habit >= 0),
    };
  }, [habits, completions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const sendRemote = useCallback(
    async (next: Message[], message: string) => {
      if (!backendUrl || !token) return;
      const history: CoachHistoryTurn[] = next.slice(-10);
      // On-device rows ground the server coach (same minimal shapes the dev
      // action accepts); the server revalidates and recomputes everything.
      const result = await sendCoachTurn(backendUrl, token, message, history, undefined, {
        habits: payload.habits,
        completions: payload.completions,
      });
      if (result.ok) {
        setMessages([...next, { role: "coach" as const, content: result.message }]);
        return;
      }
      if (result.code === "UNAUTHORIZED") {
        await clearSessionToken();
        setToken(null);
        setNeedsSignIn(true);
        setError("Your session expired. Please sign in to continue coaching.");
        return;
      }
      if (result.code === "AI_CONSENT_REQUIRED") {
        setRemoteConsentPending(true);
        setError("");
        return;
      }
      if (result.code === "RATE_LIMITED") {
        setRetryUntil(Date.now() + (result.retryAfterMs ?? 60_000));
        setError(result.error);
        return;
      }
      if (result.code === "OFFLINE" || result.code === "TIMEOUT") {
        setDraft(message);
      }
      setError(result.error);
    },
    [backendUrl, token, payload],
  );

  const sendDev = useCallback(
    async (next: Message[], message: string) => {
      const result = await sendCoachMessage({
        userId,
        habits: payload.habits,
        completions: payload.completions,
        message,
        history: next.slice(-10),
        consentGranted: consentedLocal,
      });
      if (result.ok) {
        setMessages([...next, { role: "coach" as const, content: result.reply }]);
      } else {
        setError(result.error);
      }
    },
    [userId, payload, consentedLocal],
  );

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    if (message.length > 1000) {
      setError("Keep questions under 1000 characters.");
      return;
    }
    if (rateLimited) {
      setError("Rate limited — please wait a bit, then retry.");
      return;
    }
    if (!consented) {
      setError("Please accept AI coaching consent above before sending.");
      return;
    }

    const next: Message[] = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    setDraft("");
    setError("");
    setSending(true);

    try {
      if (remoteMode) {
        await sendRemote(next, message);
      } else if (devMode) {
        await sendDev(next, message);
      } else if (!backendUrl) {
        setDraft(message);
        setError(
          "AI coaching isn't configured in this build, so it can't reach the Habitiva server. Your habits and tracking keep working fully offline.",
        );
      } else {
        setDraft(message);
        setError(
          "AI coaching needs an internet connection to the Habitiva server. Your habits and tracking keep working fully offline.",
        );
      }
    } catch {
      setDraft(message);
      setError("The coach couldn't be reached just now. Check your connection and retry.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function retry() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    setError("");
    if (lastUser) void send(lastUser.content);
  }

  async function grantRemote() {
    if (!backendUrl || !token) return;
    setError("");
    const result = await grantRemoteConsent(backendUrl, token);
    if (result.ok) {
      setRemoteConsentPending(false);
    } else if (result.code === "UNAUTHORIZED") {
      await clearSessionToken();
      setToken(null);
      setNeedsSignIn(true);
      setError("Your session expired. Please sign in to continue coaching.");
    } else {
      setError(result.error);
    }
  }

  async function disconnect() {
    await clearSessionToken();
    setToken(null);
    setNeedsSignIn(false);
    setRemoteConsentPending(false);
    setError("");
  }

  return (
    <section aria-labelledby="coach-chat-heading" className="mt-6">
      <div className="flex items-end justify-between px-1">
        <h2 id="coach-chat-heading" className="eyebrow">
          Ask your coach
        </h2>
        {remoteMode ? (
          <button
            type="button"
            onClick={() => void disconnect()}
            className="text-xs font-semibold text-muted underline-offset-2 hover:underline"
          >
            Disconnect
          </button>
        ) : null}
      </div>

      <div className="card mt-3 flex flex-col overflow-hidden">
        {!consented && !showConnect ? (
          <div className="border-b border-line bg-accent-soft/60 px-5 py-4">
            <p className="text-sm font-semibold text-ink">AI coaching needs your consent</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              To reply, the coach sends your habit titles, schedules, reminder times,
              and completion counts to an external AI service (OpenAI). Nothing else
              leaves this device — no account details, notes, or passwords.
            </p>
            <button
              type="button"
              onClick={() => {
                if (remoteMode) void grantRemote();
                else grantLocalConsent();
              }}
              className="btn-primary mt-3 w-full"
            >
              I understand — enable AI coaching
            </button>
          </div>
        ) : null}
        <div
          ref={scrollRef}
          aria-live="polite"
          className="flex max-h-[52vh] min-h-[240px] flex-col gap-3 overflow-y-auto p-5"
        >
          {showConnect ? (
            <ConnectForm
              onConnected={(nextToken) => {
                setToken(nextToken);
                setNeedsSignIn(false);
                setError("");
              }}
              onError={setError}
            />
          ) : messages.length === 0 ? (
            <div className="py-4 text-center">
              <p className="font-serif text-[1.6rem] leading-snug tracking-tight text-ink">
                What would you like to work on?
              </p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted">
                Ask anything about your habits, progress, streaks, or routine — answers
                come from your actual logged data.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={sending}
                    onClick={() => void send(prompt)}
                    className="rounded-full border border-line bg-surface-2 px-3.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:border-accent/40 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "rounded-br-lg bg-charcoal text-white"
                      : "rounded-bl-lg border border-line bg-surface-2 text-ink"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}

          {sending || historyLoading ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-3xl rounded-bl-lg border border-line bg-surface-2 px-4 py-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-muted" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
                <span className="sr-only">Coach is thinking…</span>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-rose-soft/50 px-5 py-3">
            <p className="text-xs leading-5 text-rose">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="shrink-0 rounded-full border border-rose/30 bg-surface px-3.5 py-1.5 text-xs font-semibold text-rose"
            >
              Retry
            </button>
          </div>
        ) : null}

        <form
          className="flex items-end gap-2 border-t border-line bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor="coach-composer" className="sr-only">
            Ask your coach
          </label>
          <textarea
            id="coach-composer"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={consented ? "Ask your coach..." : "Accept consent above to chat..."}
            className="field mt-0 max-h-32 flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={sending || !consented || rateLimited || draft.trim().length === 0}
            aria-label="Send message"
            className="btn-primary h-11 w-11 shrink-0 !rounded-full !p-0 text-lg leading-none"
          >
            ↑
          </button>
        </form>
      </div>
    </section>
  );
}

function ConnectForm({
  onConnected,
  onError,
}: {
  onConnected: (token: string) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [lastCode, setLastCode] = useState("");

  async function submit() {
    if (busy) return;
    if (!email.trim()) {
      onError("Enter your email address.");
      return;
    }
    if (mode !== "forgot" && password.length < 8) {
      onError("Enter your email and password (8+ characters).");
      return;
    }
    setBusy(true);
    setInfo("");
    try {
      if (mode === "forgot") {
        const result = await forgotPassword(email.trim().toLowerCase());
        if (result.ok) {
          setInfo("If an account exists for that email, we'll send password reset instructions.");
        } else {
          onError(result.error);
        }
        return;
      }
      const result =
        mode === "login"
          ? await logIn(email.trim().toLowerCase(), password)
          : await signUp(email.trim().toLowerCase(), password, name.trim() || undefined);
      if (result.ok) {
        if (result.emailSent === false) {
          setLastCode("EMAIL_SENT_FAILED");
          setInfo("Account ready, but the verification email couldn't be sent. Use “Resend it” below, then verify.");
        }
        onConnected(result.token);
      } else {
        setLastCode(result.code);
        onError(result.error);
      }
    } catch {
      onError("Could not reach the Habitiva server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    if (!email.trim()) {
      onError("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      const result = await resendVerification(email.trim().toLowerCase());
      if (result.ok) {
        setInfo("If an unverified account exists for this email, a verification email has been sent.");
      } else {
        onError(result.error);
      }
    } catch {
      onError("Could not reach the Habitiva server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-4">
      <p className="text-center font-serif text-xl text-ink">Connect to AI coaching</p>
      <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-6 text-muted">
        Sign in with your Habitiva account to reach the hosted coach. Your local
        habits keep working offline either way.
      </p>
      <div className="mx-auto mt-4 max-w-xs space-y-3">
        {mode === "signup" ? (
          <label className="block text-sm text-muted">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field"
              autoComplete="name"
              placeholder="Your name"
            />
          </label>
        ) : null}
        <label className="block text-sm text-muted">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            className="field"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        {mode === "forgot" ? (
          <p className="text-xs leading-5 text-muted">
            Enter your account email and we&apos;ll send password reset instructions.
          </p>
        ) : (
          <label className="block text-sm text-muted">
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="field"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="8+ characters"
            />
          </label>
        )}
        <button type="button" disabled={busy} onClick={() => void submit()} className="btn-primary w-full">
          {busy
            ? "Connecting..."
            : mode === "login"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : "Send reset link"}
        </button>
        {mode === "login" ? (
          <button
            type="button"
            onClick={() => {
              setLastCode("");
              setInfo("");
              setMode("forgot");
            }}
            className="w-full text-center text-xs font-semibold text-accent"
          >
            Forgot password?
          </button>
        ) : null}
        {mode !== "forgot" ? (
          <button
            type="button"
            onClick={() => {
              setLastCode("");
              setInfo("");
              setMode(mode === "login" ? "signup" : "login");
            }}
            className="w-full text-center text-xs font-semibold text-accent"
          >
            {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setLastCode("");
              setInfo("");
              setMode("login");
            }}
            className="w-full text-center text-xs font-semibold text-accent"
          >
            Back to sign in
          </button>
        )}
        {mode !== "forgot" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="w-full text-center text-xs font-semibold text-accent disabled:opacity-50"
          >
            Didn&apos;t get a verification email? Resend it
          </button>
        ) : null}
        {info ? (
          <p className="rounded-2xl bg-accent-soft px-4 py-3 text-center text-xs leading-5 text-accent">
            {info}
          </p>
        ) : null}
        {lastCode === "EMAIL_UNVERIFIED" || lastCode === "EMAIL_SENT_FAILED" ? (
          <p className="text-center text-xs leading-5 text-muted">
            Verify your email first — check your inbox, or use “Resend it” above.
          </p>
        ) : null}
      </div>
    </div>
  );
}
