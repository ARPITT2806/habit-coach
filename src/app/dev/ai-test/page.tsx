"use client";

import { AiTestButton } from "@/components/ai-test-button";

/**
 * DEV-ONLY page. Deliberately unavailable outside `next dev`: the static
 * export shipped in the Android APK is a production build, so this route
 * prerenders as "not available" and can never reach OpenAI or any UI flow.
 */
export default function AiTestPage() {
  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="mx-auto max-w-lg px-5 py-10">
        <p className="text-sm text-muted">Not available outside development.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <p className="eyebrow">Development only</p>
      <h1 className="mt-2 font-serif text-2xl text-ink">OpenAI connectivity test</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Calls a server-only action that sends a fixed &ldquo;Reply with exactly: OK&rdquo;
        prompt via the Responses API. No habit data is sent; the API key stays server-side.
      </p>
      <AiTestButton />
    </main>
  );
}
