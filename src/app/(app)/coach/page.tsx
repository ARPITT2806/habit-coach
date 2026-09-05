"use client";

import { useEffect, useMemo, useState } from "react";

import { FAILURE_REASONS } from "@/lib/constants";
import {
  getCompletions,
  getHabits,
  type LocalCompletion,
  type LocalHabit,
} from "@/lib/local/habits";
import { getLocalUser } from "@/lib/local/session";

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduledOn(habit: LocalHabit, date: Date): boolean {
  try {
    const days = JSON.parse(habit.daysOfWeek) as number[];
    return days.includes(date.getDay());
  } catch {
    return true;
  }
}

function consistency(
  habits: LocalHabit[],
  completions: LocalCompletion[],
  days: number,
) {
  let scheduled = 0;
  let completed = 0;

  const active = habits.filter((habit) => habit.isActive);
  const today = new Date();

  for (const habit of active) {
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - offset);

      if (!scheduledOn(habit, date)) continue;

      scheduled += 1;

      if (
        completions.some(
          (item) =>
            item.habitId === habit.id &&
            item.date === dateKey(date) &&
            item.status === "completed",
        )
      ) {
        completed += 1;
      }
    }
  }

  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl border border-line bg-paper p-5">
      <p className="font-serif text-2xl text-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

function RecommendationCard({
  title,
  rationale,
}: {
  title: string;
  rationale: string;
}) {
  return (
    <article className="rounded-3xl border border-line bg-paper p-5">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{rationale}</p>
    </article>
  );
}

export default function CoachPage() {
  const [habits, setHabits] = useState<LocalHabit[]>([]);
  const [completions, setCompletions] = useState<LocalCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const user = await getLocalUser();

        const [localHabits, localCompletions] = await Promise.all([
          getHabits(user.id),
          getCompletions(user.id),
        ]);

        setHabits(localHabits);
        setCompletions(localCompletions);
      } catch (err) {
        console.error(err);
        setError("Could not load your coach.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const completedCount = completions.filter(
    (item) => item.status === "completed",
  ).length;

  const enough = completedCount >= 3;

  const consistency7 = useMemo(
    () => consistency(habits, completions, 7),
    [habits, completions],
  );

  const commonMiss = useMemo(() => {
    const misses = completions.filter(
      (item) => item.status !== "completed" && item.reason,
    );

    if (misses.length === 0) return null;

    const counts = new Map<string, number>();

    for (const item of misses) {
      counts.set(item.reason!, (counts.get(item.reason!) ?? 0) + 1);
    }

    const reason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    return reason
      ? FAILURE_REASONS.find((item) => item.id === reason) ?? null
      : null;
  }, [completions]);

  const weakestHabit = useMemo(() => {
    if (habits.length === 0) return null;

    const scores = habits
      .filter((habit) => habit.isActive)
      .map((habit) => {
        const scheduled = completions.filter(
          (item) =>
            item.habitId === habit.id &&
            item.status !== "completed",
        ).length;

        const completed = completions.filter(
          (item) =>
            item.habitId === habit.id &&
            item.status === "completed",
        ).length;

        return {
          habit,
          misses: scheduled,
          completed,
        };
      });

    return [...scores].sort((a, b) => {
      const aTotal = a.misses + a.completed;
      const bTotal = b.misses + b.completed;

      const aRate = aTotal === 0 ? 100 : a.completed / aTotal;
      const bRate = bTotal === 0 ? 100 : b.completed / bTotal;

      return aRate - bRate;
    })[0] ?? null;
  }, [habits, completions]);

  const observation = useMemo(() => {
    if (!enough) return null;

    if (consistency7 >= 80) {
      return {
        title: "You're building consistency.",
        body: `You've completed ${consistency7}% of scheduled habits over the last 7 days. Keep the current routine stable before adding more.`,
      };
    }

    if (consistency7 >= 50) {
      return {
        title: "Your routine is taking shape.",
        body: `Your 7-day consistency is ${consistency7}%. The next improvement is likely to come from making the existing habits easier to complete.`,
      };
    }

    if (commonMiss) {
      return {
        title: "There's a clear friction point.",
        body: `Your most common recorded reason for missing a habit is "${commonMiss.label}". Start by reducing that specific obstacle rather than adding more habits.`,
      };
    }

    return {
      title: "Keep the experiment small.",
      body: `Your current 7-day consistency is ${consistency7}%. Keep tracking before making major changes.`,
    };
  }, [enough, consistency7, commonMiss]);

  const recommendation = useMemo(() => {
    if (!enough) return null;

    if (weakestHabit && weakestHabit.misses > weakestHabit.completed) {
      return {
        title: `Make "${weakestHabit.habit.title}" easier`,
        rationale:
          "This habit has more misses than completions in your recorded history. Reduce the starting effort before changing the whole routine.",
      };
    }

    if (consistency7 >= 80) {
      return {
        title: "Protect what's working",
        rationale:
          "Your recent consistency is strong. Avoid adding unnecessary complexity while the current routine is working.",
      };
    }

    return {
      title: "Keep tracking before changing",
      rationale:
        "There isn't enough evidence for a major change yet. More real behavior will make the next recommendation more reliable.",
    };
  }, [enough, weakestHabit, consistency7]);

  if (loading) {
    return (
      <main>
        <p className="text-sm text-muted">Loading your coach...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <p className="text-sm text-muted">{error}</p>
      </main>
    );
  }

  return (
    <main>
      <h1 className="font-serif text-4xl">Your coach</h1>

      <p className="mt-2 text-sm leading-6 text-muted">
        Guidance based on what you actually logged — not assumptions.
      </p>

      <div className="mt-8">
        <div className="rounded-3xl border border-line bg-paper p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Current signal
          </p>

          <p className="mt-3 text-2xl font-medium text-ink">
            {completedCount} completed
          </p>

          <p className="mt-2 text-sm text-muted">
            {consistency7}% consistency over the last 7 days.
          </p>
        </div>
      </div>

      <section className="mt-6">
        {observation ? (
          <article className="rounded-3xl border border-line bg-paper p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Observation
            </p>

            <p className="mt-3 font-serif text-2xl leading-snug text-ink">
              {observation.title}
            </p>

            <p className="mt-3 text-sm leading-6 text-muted">
              {observation.body}
            </p>
          </article>
        ) : (
          <EmptyState
            title="Keep tracking"
            body="I don't have enough real behavior yet to make a useful coaching observation. Keep completing, skipping, or missing habits."
          />
        )}
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="rec-heading">
        <h2
          id="rec-heading"
          className="text-sm uppercase tracking-[0.18em] text-muted"
        >
          Suggested changes
        </h2>

        {recommendation ? (
          <RecommendationCard
            title={recommendation.title}
            rationale={recommendation.rationale}
          />
        ) : (
          <p className="text-sm leading-6 text-muted">
            No changes suggested yet. Keep tracking so Habit Flow can learn
            from your actual behavior.
          </p>
        )}
      </section>
    </main>
  );
}
