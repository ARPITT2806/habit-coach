"use client";

import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/states";
import { ArrowIcon, Chip, ProgressRing, SparkIcon } from "@/components/ui";
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

export default function CoachPage() {
  const [habits, setHabits] = useState<LocalHabit[]>([]);
  const [completions, setCompletions] = useState<LocalCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const user = await getLocalUser();

        const [localHabits, localCompletions] = await Promise.all([
          getHabits(user.id),
          getCompletions(user.id),
        ]);

        if (alive) {
          setHabits(localHabits);
          setCompletions(localCompletions);
        }
      } catch {
        if (alive) setError("Could not load your coach.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
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
        const misses = completions.filter(
          (item) =>
            item.habitId === habit.id && item.status !== "completed",
        ).length;

        const completed = completions.filter(
          (item) =>
            item.habitId === habit.id && item.status === "completed",
        ).length;

        return {
          habit,
          misses,
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
        title: "You’re building consistency.",
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
        title: "There’s a clear friction point.",
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
        title: "Protect what’s working",
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

  if (loading && habits.length === 0) {
    return (
      <main className="space-y-4" aria-label="Loading coach">
        <div className="h-12 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-4xl bg-surface-2" />
        <div className="h-32 animate-pulse rounded-4xl bg-surface-2" />
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <EmptyState
          title="Couldn’t load your coach"
          body={error}
          icon={<SparkIcon size={22} />}
        />
      </main>
    );
  }

  return (
    <main className="pb-6">
      <header className="animate-rise">
        <p className="overline">Coach</p>
        <h1 className="mt-2 font-serif text-[2rem] leading-tight tracking-tight text-ink">
          Your coach
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Guidance based on what you actually logged — not assumptions.
        </p>
      </header>

      <section className="animate-rise rise-delay-1 mt-6 flex items-center justify-between gap-5 rounded-4xl border border-accent/10 bg-accent-soft p-6 shadow-lift">
        <div className="min-w-0">
          <p className="overline text-accent">Current signal</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-accent">
            {completedCount} completed
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Across your whole history, from your own logs.
          </p>
        </div>

        <ProgressRing value={consistency7} size={82} stroke={9} trackClass="text-white">
          <p className="text-sm font-bold text-ink">{consistency7}%</p>
        </ProgressRing>
      </section>

      <section className="mt-7" aria-labelledby="observation-heading">
        <h2 id="observation-heading" className="overline px-1">
          Observation
        </h2>

        <div className="mt-3">
          {observation ? (
            <article className="card relative overflow-hidden p-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-rose-soft blur-2xl"
              />
              <div className="relative">
                <Chip className="bg-rose-soft text-rose">
                  <SparkIcon size={13} />
                  Coach says
                </Chip>
                <p className="mt-4 font-serif text-[1.7rem] leading-snug tracking-tight text-ink">
                  {observation.title}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {observation.body}
                </p>
              </div>
            </article>
          ) : (
            <EmptyState
              title="Keep tracking"
              body="I don't have enough real behavior yet to make a useful coaching observation. Keep completing, skipping, or missing habits."
              icon={<SparkIcon size={22} />}
            />
          )}
        </div>
      </section>

      <section className="mt-7" aria-labelledby="rec-heading">
        <h2 id="rec-heading" className="overline px-1">
          Suggested changes
        </h2>

        <div className="mt-3">
          {recommendation ? (
            <article className="rounded-4xl border border-peach/25 bg-peach-soft p-6">
              <Chip className="bg-peach text-white">Suggested change</Chip>
              <p className="mt-4 text-base font-semibold tracking-tight text-ink">
                {recommendation.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {recommendation.rationale}
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-peach">
                Your coach
                <ArrowIcon size={14} />
              </div>
            </article>
          ) : (
            <EmptyState
              title="Nothing to change yet"
              body="No changes suggested so far. Keep tracking so Habit Coach can learn from your actual behavior."
              icon={<ArrowIcon size={22} />}
            />
          )}
        </div>
      </section>
    </main>
  );
}