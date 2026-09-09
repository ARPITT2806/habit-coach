"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorText } from "@/components/states";
import {
  ArrowIcon,
  Chip,
  PlusIcon,
  SparkIcon,
  SunIcon,
} from "@/components/ui";
import {
  HabitForm,
  habitFormToCreateInput,
  type HabitFormValues,
} from "@/components/habit-form";
import {
  defaultDaysForFrequency,
  DIFFICULTIES,
  parseDaysOfWeek,
} from "@/lib/constants";
import {
  addDays,
  formatTime,
  parseDateKey,
  percent,
  todayKey,
} from "@/lib/dates";
import {
  createHabit,
  deleteHabit,
  ensureGoalForHabit,
  getCompletions,
  getHabits,
  updateHabit,
  updateHabitPreferredTime,
  type LocalCompletion,
  type LocalHabit,
} from "@/lib/local/habits";
import { getLocalUser, type LocalUser } from "@/lib/local/session";
import { syncAllReminders } from "@/lib/local/reminders";
import { useModalBackHandler } from "@/lib/navigation/use-modal-back";

const CHART_DAYS = 7;
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function isScheduledOn(habit: LocalHabit, key: string): boolean {
  return parseDaysOfWeek(habit.daysOfWeek).includes(parseDateKey(key).getDay());
}

function difficultyTone(difficulty: string): string {
  if (difficulty === "easy") return "bg-mint-soft text-mint";
  if (difficulty === "hard") return "bg-rose-soft text-rose";
  return "bg-amber-soft text-amber";
}

function barTone(pct: number, scheduled: number): string {
  if (scheduled === 0) return "bg-transparent";
  if (pct >= 100) return "bg-mint";
  if (pct >= 67) return "bg-accent";
  if (pct >= 34) return "bg-amber";
  return "bg-rose";
}

function ProgressChart({
  habits,
  completions,
}: {
  habits: LocalHabit[];
  completions: LocalCompletion[];
}) {
  const today = todayKey();
  const days = useMemo(() => {
    const keys: string[] = [];
    for (let offset = CHART_DAYS - 1; offset >= 0; offset -= 1) {
      keys.push(addDays(today, -offset));
    }
    return keys;
  }, [today]);

  const stats = useMemo(
    () =>
      days.map((day) => {
        let scheduled = 0;
        let done = 0;
        for (const habit of habits) {
          if (!habit.isActive || !isScheduledOn(habit, day)) continue;
          scheduled += 1;
          const log = completions.find(
            (item) => item.habitId === habit.id && item.date === day,
          );
          if (log?.status === "completed") done += 1;
        }
        return { day, scheduled, done, pct: percent(done, scheduled) };
      }),
    [days, habits, completions],
  );

  const totalDone = stats.reduce((sum, s) => sum + s.done, 0);
  const totalScheduled = stats.reduce((sum, s) => sum + s.scheduled, 0);

  return (
    <section className="card animate-rise p-6" aria-labelledby="progress-chart-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Progress</p>
          <h2 id="progress-chart-heading" className="mt-2 font-serif text-2xl text-ink">
            Last {CHART_DAYS} days
          </h2>
        </div>
        <Chip className="bg-accent-soft text-accent">
          {totalDone}/{totalScheduled} done
        </Chip>
      </div>

      <div
        className="mt-5 flex items-end gap-2"
        role="img"
        aria-label={`Completion per day for the last ${CHART_DAYS} days: ${stats
          .map((s) => `${s.day}: ${s.done} of ${s.scheduled}`)
          .join(", ")}`}
      >
        {stats.map((s) => {
          const isToday = s.day === today;
          const height = s.scheduled === 0 ? 0 : Math.max(10, s.pct);
          return (
            <div key={s.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className={`flex h-28 w-full items-end overflow-hidden rounded-full ${
                  isToday ? "bg-accent-soft" : "bg-surface-2"
                }`}
              >
                <div
                  className={`w-full rounded-full ${barTone(s.pct, s.scheduled)}`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span
                className={`text-[11px] font-bold leading-none ${
                  isToday ? "text-accent" : "text-muted"
                }`}
              >
                {DAY_LETTERS[parseDateKey(s.day).getDay()]}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {[
          ["bg-mint", "All done"],
          ["bg-accent", "On track"],
          ["bg-amber", "Getting there"],
          ["bg-rose", "Needs care"],
        ].map(([dot, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

function HabitRow({
  habit,
  onChanged,
}: {
  habit: LocalHabit;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Edit habit → Back returns to the habit list, never to the home screen.
  useModalBackHandler(editing, () => setEditing(false));

  const difficultyLabel =
    DIFFICULTIES.find((item) => item.id === habit.difficulty)?.label ?? null;

  async function handleSave(values: HabitFormValues) {
    setBusy(true);
    setError("");
    try {
      const user = await getLocalUser();
      await updateHabit(user.id, habit.id, {
        title: values.title,
        why: values.why || null,
        consequence: values.consequence || null,
        isImportant: values.important,
        frequencyPerWeek: values.frequency,
        daysOfWeek: JSON.stringify(defaultDaysForFrequency(values.frequency)),
        preferredTime: values.preferredTime,
        difficulty: values.difficulty,
      });
      setEditing(false);
      await onChanged();
      syncAllReminders().catch(() => {
        // reminders are best-effort
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
      throw err instanceof Error ? err : new Error("Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      const user = await getLocalUser();
      await deleteHabit(user.id, habit.id);
      await onChanged();
      syncAllReminders().catch(() => {
        // reminders are best-effort
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete habit.");
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  if (editing) {
    return (
      <article className="card animate-rise p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl text-ink">Edit habit</h3>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="icon-btn h-10 w-10 text-sm"
            aria-label="Close editor"
          >
            ✕
          </button>
        </div>
        <div className="mt-5">
          <HabitForm
            initial={{
              title: habit.title,
              goalTitle: "",
              why: habit.why ?? "",
              consequence: habit.consequence ?? "",
              important: habit.isImportant,
              frequency: habit.frequencyPerWeek,
              preferredTime: habit.preferredTime,
              difficulty: habit.difficulty,
            }}
            submitLabel="Save changes"
            showGoalField={false}
            onSubmit={handleSave}
            onPreferredTimeSave={async (newTime: string) => {
              const user = await getLocalUser();
              await updateHabitPreferredTime(user.id, habit.id, newTime);
              await onChanged();
              syncAllReminders().catch(() => {
                // reminders are best-effort
              });
            }}
          />
        </div>
        <div className="mt-4">
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="card animate-rise p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight text-ink">
            {habit.title}
          </h3>
          {habit.why ? (
            <p className="mt-1 truncate font-serif text-[0.95rem] text-muted">{habit.why}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Chip className="border border-line bg-surface text-ink">
              {formatTime(habit.preferredTime)}
            </Chip>
            <Chip className="border border-line bg-surface text-muted">
              {habit.frequencyPerWeek}×/wk
            </Chip>
            {difficultyLabel ? (
              <Chip className={difficultyTone(habit.difficulty)}>{difficultyLabel}</Chip>
            ) : null}
            {habit.isImportant ? (
              <Chip className="bg-peach-soft text-peach">Important</Chip>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <ErrorText message={error} /> : null}

      {confirmingDelete ? (
        <div className="mt-4 rounded-3xl border border-rose/30 bg-rose-soft/50 p-4">
          <p className="text-sm font-semibold text-ink">
            Delete &ldquo;{habit.title}&rdquo;?
          </p>
          <p className="mt-2 text-sm text-muted">
            Are you sure you want to delete this habit? Its associated history may also be
            removed.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete()}
              className="btn-primary flex-1"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-ghost flex-1"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="btn-danger flex-1"
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}

export default function HabitsPage() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [habits, setHabits] = useState<LocalHabit[]>([]);
  const [completions, setCompletions] = useState<LocalCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Add Habit → Back returns to the Habits screen, never to the home screen.
  useModalBackHandler(addOpen, () => setAddOpen(false));

  const refresh = useCallback(async () => {
    const localUser = await getLocalUser();
    const [localHabits, localCompletions] = await Promise.all([
      getHabits(localUser.id),
      getCompletions(localUser.id),
    ]);
    setUser(localUser);
    setHabits(localHabits);
    setCompletions(localCompletions);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Could not load habits.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  async function handleAdd(values: HabitFormValues) {
    if (!user) throw new Error("Could not create habit.");
    try {
      const goalId = await ensureGoalForHabit(user.id, values.goalTitle);
      await createHabit(habitFormToCreateInput(user.id, goalId, values));
      setFormKey((key) => key + 1);
      setAddOpen(false);
      await refresh();
      syncAllReminders().catch(() => {
        // reminders are best-effort
      });
    } catch (err) {
      throw err instanceof Error ? err : new Error("Could not create habit.");
    }
  }

  if (loading && !user) {
    return (
      <main className="space-y-4" aria-label="Loading habits">
        <div className="h-14 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-56 animate-pulse rounded-4xl bg-surface-2" />
        <div className="h-28 animate-pulse rounded-4xl bg-surface-2" />
      </main>
    );
  }

  if (error && !user) {
    return (
      <main>
        <EmptyState
          title="Couldn’t load habits"
          body={error}
          icon={<SparkIcon size={22} />}
        />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="pb-6">
      <header className="animate-rise">
        <p className="eyebrow">Manage</p>
        <h1 className="mt-2 font-serif text-[2rem] leading-tight tracking-tight text-ink">
          Habits
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Everything in one place — track progress, add new habits, and tune the ones you
          have.
        </p>
      </header>

      <div className="mt-6">
        <ProgressChart habits={habits} completions={completions} />
      </div>

      <section className="mt-7" aria-labelledby="habit-list-heading">
        <div className="flex items-center justify-between px-1">
          <h2 id="habit-list-heading" className="eyebrow">
            Your habits
          </h2>
          {habits.length > 0 ? (
            <Chip className="bg-accent-soft text-accent">
              {habits.length} active
            </Chip>
          ) : null}
        </div>

        <div className="mt-4 space-y-4">
          {habits.length === 0 ? (
            <EmptyState
              title="No habits yet"
              body="Add your first habit below and it will show up here, ready to edit any time."
              icon={<SunIcon size={22} />}
            />
          ) : (
            habits.map((habit) => (
              <HabitRow key={habit.id} habit={habit} onChanged={refresh} />
            ))
          )}
        </div>
      </section>

      <section className="mt-7" aria-labelledby="add-habit-heading">
        {addOpen ? (
          <div className="card animate-rise p-6">
            <div className="flex items-center justify-between">
              <h2 id="add-habit-heading" className="font-serif text-2xl text-ink">
                New habit
              </h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="icon-btn h-10 w-10 text-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-6">
              <HabitForm
                key={formKey}
                submitLabel="Save habit"
                showGoalField
                onSubmit={handleAdd}
              />
            </div>
            <div className="mt-4">
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </button>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
              <ArrowIcon size={13} />
              Stored locally on this device only
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="btn-ghost w-full"
          >
            <PlusIcon size={17} />
            Add habit
          </button>
        )}
      </section>
    </main>
  );
}
