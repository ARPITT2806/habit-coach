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

type StatProps = {
  label: string;
  value: string;
};

function Stat({ label, value }: StatProps) {
  return (
    <div className="rounded-3xl border border-line bg-paper p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-3 text-xl font-medium text-ink">{value}</p>
    </div>
  );
}

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
  const active = habits.filter((habit) => habit.isActive);

  if (active.length === 0) {
    return { rate: 0, scheduled: 0, completed: 0 };
  }

  const today = new Date();
  let scheduled = 0;
  let completed = 0;

  for (const habit of active) {
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - offset);

      if (!scheduledOn(habit, date)) continue;

      scheduled += 1;

      const completion = completions.find(
        (item) =>
          item.habitId === habit.id &&
          item.date === dateKey(date) &&
          item.status === "completed",
      );

      if (completion) completed += 1;
    }
  }

  return {
    rate: scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100),
    scheduled,
    completed,
  };
}

function habitConsistency(
  habit: LocalHabit,
  completions: LocalCompletion[],
  days: number,
) {
  const today = new Date();
  let scheduled = 0;
  let completed = 0;

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

  return {
    rate: scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100),
    scheduled,
  };
}

export default function InsightsPage() {
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
        setError("Could not load your insights.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const days7 = useMemo(
    () => consistency(habits, completions, 7),
    [habits, completions],
  );

  const days30 = useMemo(
    () => consistency(habits, completions, 30),
    [habits, completions],
  );

  const habitStats = useMemo(
    () =>
      habits
        .filter((habit) => habit.isActive)
        .map((habit) => ({
          habit,
          days30: habitConsistency(habit, completions, 30),
        })),
    [habits, completions],
  );

  const strongest = useMemo(
    () =>
      habitStats.length > 0
        ? [...habitStats].sort((a, b) => b.days30.rate - a.days30.rate)[0]
        : null,
    [habitStats],
  );

  const weakest = useMemo(
    () =>
      habitStats.length > 0
        ? [...habitStats].sort((a, b) => a.days30.rate - b.days30.rate)[0]
        : null,
    [habitStats],
  );

  const bestTime = useMemo(() => {
    const completed = completions.filter(
      (item) => item.status === "completed" && item.preferredTimeAtLog,
    );

    if (completed.length < 3) return null;

    const counts = new Map<string, number>();

    for (const item of completed) {
      const bucket = item.preferredTimeAtLog!.slice(0, 2);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [completions]);

  const failure = useMemo(() => {
    const missed = completions.filter(
      (item) => item.status !== "completed" && item.reason,
    );

    if (missed.length < 2) return null;

    const counts = new Map<string, number>();

    for (const item of missed) {
      counts.set(item.reason!, (counts.get(item.reason!) ?? 0) + 1);
    }

    const reason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    return reason
      ? FAILURE_REASONS.find((item) => item.id === reason) ?? null
      : null;
  }, [completions]);

  const trend = useMemo(() => {
    if (habits.length === 0) return null;

    const recent = consistency(habits, completions, 7).rate;
    const previousStart = new Date();
    previousStart.setDate(previousStart.getDate() - 7);

    let scheduled = 0;
    let completed = 0;

    for (const habit of habits.filter((item) => item.isActive)) {
      for (let offset = 7; offset < 14; offset += 1) {
        const date = new Date(previousStart);
        date.setDate(previousStart.getDate() - (offset - 7));

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

    if (scheduled === 0) return null;

    const previous = Math.round((completed / scheduled) * 100);

    return {
      recent,
      previous,
      direction:
        recent > previous ? "up" : recent < previous ? "down" : "steady",
    };
  }, [habits, completions]);

  if (loading) {
    return (
      <main>
        <p className="text-sm text-muted">Loading your pattern...</p>
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

  if (completions.length === 0) {
    return (
      <main>
        <h1 className="font-serif text-4xl">Your pattern</h1>
        <p className="mt-2 text-sm text-muted">
          Insights stay empty until there is real behavior to measure.
        </p>

        <div className="mt-8 rounded-3xl border border-line bg-paper p-5">
          <p className="text-sm leading-6 text-muted">
            Complete, skip, or miss a few habits and come back here. Your
            numbers will be calculated from your own local logs.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1 className="font-serif text-4xl">Your pattern</h1>
      <p className="mt-2 text-sm text-muted">
        Only numbers from your own logs.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Stat label="7-day consistency" value={`${days7.rate}%`} />
        <Stat label="30-day consistency" value={`${days30.rate}%`} />
        <Stat
          label="Best time"
          value={bestTime ? `${bestTime}:00` : "Not enough data"}
        />
        <Stat
          label="Common miss"
          value={failure ? failure.label : "Not enough data"}
        />
      </div>

      <div className="mt-3 space-y-3">
        <Stat
          label="Strongest habit"
          value={
            strongest
              ? `${strongest.habit.title} — ${strongest.days30.rate}%`
              : "Not enough data"
          }
        />

        <Stat
          label="Weakest habit"
          value={
            weakest
              ? `${weakest.habit.title} — ${weakest.days30.rate}%`
              : "Not enough data"
          }
        />

        <Stat
          label="Recent trend"
          value={
            trend
              ? trend.direction === "up"
                ? `Up to ${trend.recent}%`
                : trend.direction === "down"
                  ? `Down to ${trend.recent}%`
                  : `Steady at ${trend.recent}%`
              : "Need two weeks"
          }
        />
      </div>
    </main>
  );
}
