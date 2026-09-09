"use client";

import { useState } from "react";

import { testCoachAnalysis, type CoachTestResult } from "@/lib/actions/ai-coach-test";
import { parseDaysOfWeek } from "@/lib/constants";
import { getHabits, getCompletions } from "@/lib/local/habits";
import { getLocalUser } from "@/lib/local/session";

/**
 * DEV-ONLY trigger for the first AI coaching vertical slice. Reads REAL
 * habit data through Habitiva's existing local layer, shapes it down to the
 * minimal coaching payload, and sends it through the server-side AI layer.
 * Rendered exclusively by /dev/ai-analysis (unavailable outside development).
 */
export function AiAnalysisButton() {
  const [result, setResult] = useState<CoachTestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function run() {
    setRunning(true);
    setResult(null);
    setLoadError("");
    try {
      const user = await getLocalUser();
      const [habits, completions] = await Promise.all([
        getHabits(user.id),
        getCompletions(user.id),
      ]);

      const active = habits.filter((habit) => habit.isActive);
      const payload = {
        habits: active.map((habit) => ({
          title: habit.title,
          frequencyPerWeek: habit.frequencyPerWeek,
          daysOfWeek: parseDaysOfWeek(habit.daysOfWeek),
          preferredTime: habit.preferredTime,
          difficulty: habit.difficulty,
        })),
        completions: completions.map((log) => {
          const habitIndex = active.findIndex((habit) => habit.id === log.habitId);
          return { habit: habitIndex, date: log.date, status: log.status };
        }).filter((log) => log.habit >= 0),
      };

      setResult(await testCoachAnalysis(payload));
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not load local habit data in this environment.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card mt-6 p-6">
      <button type="button" disabled={running} onClick={() => void run()} className="btn-primary w-full">
        {running ? "Analyzing..." : "Analyze my real habits"}
      </button>

      {loadError ? (
        <p className="mt-4 text-sm leading-6 text-rose">
          {loadError} Local SQLite is only available in the native app — open this page
          via the phone&apos;s dev URL (npm run dev:phone) rather than a desktop browser.
        </p>
      ) : null}

      {result ? (
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface-2 p-4 text-xs leading-5 text-ink">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
