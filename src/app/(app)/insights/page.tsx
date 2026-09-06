"use client";

import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/states";
import { Chip, ProgressRing } from "@/components/ui";
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

function StatCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  className: string;
}) {
  return (
    <div className={`rounded-4xl border p-5 shadow-soft ${className}`}>
      <p className="overline">{label}</p>
      <p className="mt-2 text-xl font-bold tracking-tight text-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

function habitRowTone(rate: number): string {
  if (rate >= 80) return "bg-mint-soft text-mint";
  if (rate >= 50) return "bg-amber-soft text-amber";
  return "bg-rose-soft text-rose";
}

export default function InsightsPage() {
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
        if (alive) setError("Could not load your insights.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
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

  if (loading && habits.length === 0) {
    return (
      <main className="space-y-4" aria-label="Loading insights">
        <div className="h-12 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-4xl bg-surface-2" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-28 animate-pulse rounded-4xl bg-surface-2" />
          <div className="h-28 animate-pulse rounded-4xl bg-surface-2" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <EmptyState
          title="Couldn’t load your pattern"
          body={error}
        />
      </main>
    );
  }

  if (completions.length === 0) {
    return (
      <main className="pb-6">
        <header className="animate-rise">
          <p className="overline">Insights</p>
          <h1 className="mt-2 font-serif text-[2rem] leading-tight tracking-tight text-ink">
            Your pattern
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Insights stay empty until there is real behavior to measure.
          </p>
        </header>

        <div className="mt-6">
          <EmptyState
            title="No behavior yet"
            body="Complete, skip, or miss a few habits and come back here. Your numbers are calculated from your own local logs."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="pb-6">
      <header className="animate-rise">
        <p className="overline">Insights</p>
        <h1 className="mt-2 font-serif text-[2rem] leading-tight tracking-tight text-ink">
          Your pattern
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Only numbers from your own logs — this never leaves the device.
        </p>
      </header>

      <section className="animate-rise rise-delay-1 mt-6 flex items-center gap-5 rounded-4xl border border-sky/20 bg-sky-soft p-5 shadow-lift sm:p-6">
        <ProgressRing value={days7.rate} size={74} stroke={8} trackClass="text-white">
          <p className="text-sm font-bold text-ink">{days7.rate}%</p>
        </ProgressRing>
        <div className="min-w-0">
          <p className="overline text-sky">7-day consistency</p>
          <p className="mt-2 text-lg font-bold tracking-tight text-ink">
            {days7.scheduled > 0
              ? `${days7.completed} of ${days7.scheduled} scheduled`
              : "Nothing scheduled yet"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            The last 7 days, mapped against your schedule.
          </p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4">
        <StatCard
          label="30-day rhythm"
          value={`${days30.rate}%`}
          detail={`${days30.completed} completed`}
          className="border-mint/20 bg-mint-soft"
        />
        <StatCard
          label="Best time"
          value={bestTime ? `${bestTime}:00` : "Not enough"}
          detail={bestTime ? "when you’re most consistent" : "3 completions needed"}
          className="border-peach/20 bg-peach-soft"
        />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4">
        <StatCard
          label="Common miss"
          value={failure ? failure.label : "Not enough"}
          detail={failure ? "keep an eye on this one" : "2 misses needed"}
          className="border-rose/20 bg-rose-soft"
        />
        <StatCard
          label="Recent trend"
          value={
            trend
              ? trend.direction === "up"
                ? `Up to ${trend.recent}%`
                : trend.direction === "down"
                  ? `Down to ${trend.recent}%`
                  : `Steady ${trend.recent}%`
              : "Need 2 weeks"
          }
          detail={
            trend
              ? `versus ${trend.previous}% the week before`
              : "weekly view builds with time"
          }
          className="border-amber/20 bg-amber-soft"
        />
      </section>

      <section className="mt-7 space-y-3" aria-labelledby="habit-heading">
        <h2 id="habit-heading" className="overline px-1">
          Habit rhythm
        </h2>

        {strongest ? (
          <SingleHabitRow
            label="Strongest habit"
            habit={strongest.habit.title}
            rate={strongest.days30.rate}
          />
        ) : null}

        {weakest ? (
          <SingleHabitRow
            label="Weakest habit"
            habit={weakest.habit.title}
            rate={weakest.days30.rate}
          />
        ) : null}
      </section>
    </main>
  );
}

function SingleHabitRow({
  label,
  habit,
  rate,
}: {
  label: string;
  habit: string;
  rate: number;
}) {
  return (
    <article className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="overline">{label}</p>
          <p className="mt-1.5 truncate text-sm font-semibold text-ink">{habit}</p>
        </div>
        <Chip className={habitRowTone(rate)}>{rate}%</Chip>
      </div>

      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.max(4, rate)}%`,
            background:
              rate >= 80
                ? "var(--mint)"
                : rate >= 50
                  ? "var(--amber)"
                  : "var(--rose)",
          }}
        />
      </div>
    </article>
  );
}