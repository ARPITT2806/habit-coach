"use client";

import { AiAnalysisButton } from "@/components/ai-analysis-button";

/**
 * DEV-ONLY page for the first AI coaching vertical slice. Deliberately
 * unavailable outside `next dev`: the static export shipped in the Android
 * APK is a production build, so this route prerenders as "not available".
 */
export default function AiAnalysisPage() {
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
      <h1 className="mt-2 font-serif text-2xl text-ink">AI habit coaching (first slice)</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Loads your real on-device habits through the existing local layer, builds a
        minimal behavioral context server-side, and asks GPT for a structured
        coaching analysis. Only titles, schedules, times, and completion
        counts leave the device — never ids, accounts, or notes.
      </p>
      <AiAnalysisButton />
    </main>
  );
}
