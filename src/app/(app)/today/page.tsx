"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { defaultDaysForFrequency, FAILURE_REASONS, DIFFICULTIES } from "@/lib/constants";
import { greeting, formatTime } from "@/lib/dates";
import {
  createGoal,
  createHabit,
  getCompletions,
  getHabits,
  getGoals,
  logHabit,
  saveCheckIn,
  type LocalCheckIn,
  type LocalCompletion,
  type LocalHabit,
} from "@/lib/local/habits";
import { getLocalUser, type LocalUser } from "@/lib/local/session";

type HabitWithLog = LocalHabit & {
  log: LocalCompletion | null;
};

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isScheduledToday(habit: LocalHabit): boolean {
  try {
    const days = JSON.parse(habit.daysOfWeek) as number[];
    const weekday = new Date().getDay();
    return days.includes(weekday);
  } catch {
    return true;
  }
}

function weeklyConsistency(
  habits: LocalHabit[],
  completions: LocalCompletion[],
): number {
  const activeHabits = habits.filter((habit) => habit.isActive);

  if (activeHabits.length === 0) {
    return 0;
  }

  const today = new Date();
  let scheduled = 0;
  let completed = 0;

  for (const habit of activeHabits) {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);

      const weekday = date.getDay();

      let days: number[] = [];
      try {
        days = JSON.parse(habit.daysOfWeek) as number[];
      } catch {
        days = [];
      }

      if (!days.includes(weekday)) continue;

      scheduled += 1;

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      const completion = completions.find(
        (item) => item.habitId === habit.id && item.date === dateKey,
      );

      if (completion?.status === "completed") {
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
    <article className="rounded-3xl border border-line bg-paper p-5">
      <p className="text-base text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </article>
  );
}

function HabitCard({
  habit,
  onSave,
}: {
  habit: HabitWithLog;
  onSave: (
    habitId: string,
    status: "completed" | "skipped" | "failed",
    reason?: string,
    reasonOther?: string,
  ) => Promise<void>;
}) {
  const [intent, setIntent] = useState<"skipped" | "failed" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(status: "completed" | "skipped" | "failed") {
    setError("");

    if (status !== "completed" && !reason) {
      setError("Choose a reason so the coach can learn.");
      return;
    }

    setSaving(true);

    try {
      await onSave(
        habit.id,
        status,
        status === "completed" ? undefined : reason,
        status === "completed" ? undefined : reasonOther.trim() || undefined,
      );
      setIntent(null);
      setReason("");
      setReasonOther("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that check-in.");
    } finally {
      setSaving(false);
    }
  }

  if (habit.log) {
    const label =
      habit.log.status === "completed"
        ? "Completed"
        : habit.log.status === "skipped"
          ? "Skipped"
          : "Missed";

    const reasonLabel = habit.log?.reason
      ? FAILURE_REASONS.find((item) => item.id === habit.log?.reason)?.label
      : null;

    return (
      <article className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-paper px-4 py-4">
        <div>
          <p className="text-base text-ink">{habit.title}</p>
          <p className="mt-1 text-sm text-muted">
            {label}
            {reasonLabel ? ` · ${reasonLabel}` : ""}
          </p>
        </div>
        <span className="text-sm text-muted">
          {formatTime(habit.preferredTime)}
        </span>
      </article>
    );
  }

  if (intent) {
    return (
      <article className="rounded-3xl border border-line bg-paper p-4">
        <p className="text-base text-ink">
          Why didn’t you do {habit.title}?
        </p>

        <fieldset className="mt-3 grid grid-cols-2 gap-2">
          <legend className="sr-only">Reason</legend>

          {FAILURE_REASONS.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
            >
              <input
                type="radio"
                name={`reason-${habit.id}`}
                value={item.id}
                checked={reason === item.id}
                onChange={() => setReason(item.id)}
                className="accent-ink"
              />
              {item.label}
            </label>
          ))}
        </fieldset>

        <label className="mt-3 block text-sm text-muted">
          Other detail
          <input
            value={reasonOther}
            onChange={(event) => setReasonOther(event.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-2xl border border-line bg-transparent px-3 py-2 text-ink"
            placeholder="Optional"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => save(intent)}
            className="btn-primary flex-1"
          >
            {saving ? "Saving..." : "Save"}
          </button>

          <button
            type="button"
            disabled={saving}
            className="btn-ghost"
            onClick={() => {
              setIntent(null);
              setReason("");
              setReasonOther("");
              setError("");
            }}
          >
            Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-3xl border border-line bg-paper px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base text-ink">{habit.title}</p>
          <p className="mt-1 text-sm text-muted">
            Preferred {formatTime(habit.preferredTime)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          className="btn-primary"
          onClick={() => save("completed")}
        >
          Completed
        </button>

        <button
          type="button"
          disabled={saving}
          className="btn-ghost"
          onClick={() => setIntent("skipped")}
        >
          Skipped
        </button>

        <button
          type="button"
          disabled={saving}
          className="btn-ghost"
          onClick={() => setIntent("failed")}
        >
          Missed
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}
    </article>
  );
}

function CheckInCard({
  existing,
  onSave,
}: {
  existing: LocalCheckIn | null;
  onSave: (mood: number, blocker: string) => Promise<void>;
}) {
  const [mood, setMood] = useState(existing?.mood ?? 0);
  const [blocker, setBlocker] = useState(existing?.blocker ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMood(existing?.mood ?? 0);
    setBlocker(existing?.blocker ?? "");
  }, [existing]);

  async function submit() {
    if (mood < 1 || mood > 5) {
      setError("Choose a rating from 1 to 5.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");

    try {
      await onSave(mood, blocker.trim());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-paper p-5">
      <p className="font-serif text-2xl text-ink">How was your day?</p>
      <p className="mt-1 text-sm text-muted">Ten seconds. Be honest.</p>

      <fieldset className="mt-4 flex justify-between gap-2">
        <legend className="sr-only">Day rating from 1 to 5</legend>

        {[1, 2, 3, 4, 5].map((value) => (
          <label
            key={value}
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-line text-sm has-[:checked]:bg-ink has-[:checked]:text-paper"
          >
            <input
              type="radio"
              name="mood"
              value={value}
              checked={mood === value}
              onChange={() => setMood(value)}
              className="sr-only"
            />
            {value}
          </label>
        ))}
      </fieldset>

      <label className="mt-4 block text-sm text-muted">
        What got in your way today?
        <input
          value={blocker}
          onChange={(event) => setBlocker(event.target.value)}
          maxLength={160}
          className="mt-2 w-full rounded-2xl border border-line bg-transparent px-3 py-3 text-ink"
          placeholder="Optional"
        />
      </label>

      <div className="mt-4">
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="btn-primary w-full"
        >
          {saving
            ? "Saving..."
            : existing
              ? "Update check-in"
              : "Save check-in"}
        </button>
      </div>

      {saved ? <p className="mt-3 text-sm text-muted">Saved.</p> : null}
      {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}
    </div>
  );
}

function AddHabit({
  user,
  onCreated,
}: {
  user: LocalUser;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [why, setWhy] = useState("");
  const [frequency, setFrequency] = useState(4);
  const [preferredTime, setPreferredTime] = useState("07:00");
  const [difficulty, setDifficulty] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => setOpen(true)}
      >
        Add another habit
      </button>
    );
  }

  async function submit() {
    if (title.trim().length < 2) {
      setError("Check the habit details and try again.");
      return;
    }

    if (preferredTime.length !== 5) {
      setError("Choose a valid preferred time.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let goalId: string | null = null;

      if (goalTitle.trim()) {
        const goal = await createGoal(user.id, goalTitle.trim());
        goalId = goal.id;
      } else {
        const goals = await getGoals(user.id);
        goalId = goals.at(-1)?.id ?? null;
      }

      await createHabit({
        userId: user.id,
        goalId,
        title: title.trim(),
        why: why.trim() || null,
        frequencyPerWeek: frequency,
        daysOfWeek: JSON.stringify(defaultDaysForFrequency(frequency)),
        preferredTime,
        difficulty,
      });

      setTitle("");
      setGoalTitle("");
      setWhy("");
      setFrequency(4);
      setPreferredTime("07:00");
      setDifficulty("medium");
      setOpen(false);

      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create habit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-paper p-5">
      <p className="font-serif text-xl text-ink">New habit</p>

      <label className="mt-4 block text-sm text-muted">
        Habit
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          className="field"
          placeholder="Read 20 minutes"
        />
      </label>

      <label className="mt-3 block text-sm text-muted">
        Related goal (optional)
        <input
          value={goalTitle}
          onChange={(event) => setGoalTitle(event.target.value)}
          className="field"
          placeholder="Get healthier"
        />
      </label>

      <label className="mt-3 block text-sm text-muted">
        Why it matters
        <input
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          className="field"
          placeholder="I want more energy"
        />
      </label>

      <label className="mt-3 block text-sm text-muted">
        Days per week
        <select
          value={frequency}
          onChange={(event) => setFrequency(Number(event.target.value))}
          className="field"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-sm text-muted">
        Preferred time
        <input
          value={preferredTime}
          onChange={(event) => setPreferredTime(event.target.value)}
          type="time"
          required
          className="field"
        />
      </label>

      <fieldset className="mt-3">
        <legend className="text-sm text-muted">Difficulty</legend>

        <div className="mt-2 flex gap-2">
          {DIFFICULTIES.map((item) => (
            <label
              key={item.id}
              className="flex-1 cursor-pointer rounded-2xl border border-line px-3 py-2 text-center text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
            >
              <input
                type="radio"
                name="difficulty"
                value={item.id}
                checked={difficulty === item.id}
                onChange={() => setDifficulty(item.id)}
                className="sr-only"
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={saving}
          className="btn-primary flex-1"
          onClick={submit}
        >
          {saving ? "Saving..." : "Save habit"}
        </button>

        <button
          type="button"
          disabled={saving}
          className="btn-ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [habits, setHabits] = useState<LocalHabit[]>([]);
  const [completions, setCompletions] = useState<LocalCompletion[]>([]);
  const [checkIns, setCheckIns] = useState<LocalCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const date = todayKey();

  const refresh = useCallback(async () => {
    const localUser = await getLocalUser();
    const [localHabits, localCompletions, localCheckIns] = await Promise.all([
      getHabits(localUser.id),
      getCompletions(localUser.id),
      import("@/lib/local/habits").then(({ getCheckIns }) =>
        getCheckIns(localUser.id),
      ),
    ]);

    setUser(localUser);
    setHabits(localHabits);
    setCompletions(localCompletions);
    setCheckIns(localCheckIns);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load Today.");
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const todayHabits = useMemo(
    () =>
      habits
        .filter(isScheduledToday)
        .map((habit) => ({
          ...habit,
          log:
            completions.find(
              (completion) =>
                completion.habitId === habit.id &&
                completion.date === date,
            ) ?? null,
        })),
    [habits, completions, date],
  );

  const todayCheckIn =
    checkIns.find((checkIn) => checkIn.date === date) ?? null;

  const week = weeklyConsistency(habits, completions);

  async function handleHabitSave(
    habitId: string,
    status: "completed" | "skipped" | "failed",
    reason?: string,
    reasonOther?: string,
  ) {
    if (!user) return;

    await logHabit({
      userId: user.id,
      habitId,
      date,
      status,
      reason,
      reasonOther,
    });

    await refresh();
  }

  async function handleCheckInSave(mood: number, blocker: string) {
    if (!user) return;

    await saveCheckIn({
      userId: user.id,
      date,
      mood,
      blocker: blocker || null,
    });

    await refresh();
  }

  if (loading) {
    return (
      <main>
        <p className="text-sm text-muted">Loading your habits...</p>
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

  if (!user) {
    return null;
  }

  return (
    <main>
      <p className="text-sm text-muted">{greeting()}</p>
      <h1 className="mt-1 font-serif text-4xl">Today</h1>

      <section className="mt-8" aria-labelledby="habits-heading">
        <div className="flex items-end justify-between">
          <h2
            id="habits-heading"
            className="text-sm uppercase tracking-[0.18em] text-muted"
          >
            Today’s habits
          </h2>

          <p className="text-sm text-muted">
            Weekly consistency {week}%
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {todayHabits.length === 0 ? (
            <EmptyState
              title="Nothing scheduled today"
              body="Rest is part of the plan. You can still add a habit if you want one."
            />
          ) : (
            todayHabits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                onSave={handleHabitSave}
              />
            ))
          )}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="checkin-heading">
        <h2 id="checkin-heading" className="sr-only">
          Daily check-in
        </h2>

        <CheckInCard
          existing={todayCheckIn}
          onSave={handleCheckInSave}
        />
      </section>

      <section className="mt-6">
        <AddHabit user={user} onCreated={refresh} />
      </section>
    </main>
  );
}
