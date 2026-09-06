"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, ErrorText } from "@/components/states";
import {
  ArrowIcon,
  Avatar,
  CalendarIcon,
  CheckIcon,
  Chip,
  DateStrip,
  PlusIcon,
  ProgressRing,
  SparkIcon,
  SunIcon,
} from "@/components/ui";
import {
  defaultDaysForFrequency,
  DIFFICULTIES,
  FAILURE_REASONS,
  parseDaysOfWeek,
} from "@/lib/constants";
import {
  dateKeysInclusive,
  formatTime,
  greeting,
  parseDateKey,
  timeBucket,
  todayKey,
} from "@/lib/dates";
import {
  createGoal,
  createHabit,
  getCompletions,
  getGoals,
  getHabits,
  logHabit,
  saveCheckIn,
  type LocalCheckIn,
  type LocalCompletion,
  type LocalGoal,
  type LocalHabit,
} from "@/lib/local/habits";
import { getLocalUser, type LocalUser } from "@/lib/local/session";

function isScheduledOn(habit: LocalHabit, key: string): boolean {
  const weekday = parseDateKey(key).getDay();
  return parseDaysOfWeek(habit.daysOfWeek).includes(weekday);
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

      if (!parseDaysOfWeek(habit.daysOfWeek).includes(weekday)) continue;

      scheduled += 1;

      const key = todayKey(date);

      const completion = completions.find(
        (item) => item.habitId === habit.id && item.date === key,
      );

      if (completion?.status === "completed") {
        completed += 1;
      }
    }
  }

  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

function difficultyTone(difficulty: string): string {
  if (difficulty === "easy")
    return "bg-mint-soft text-mint";
  if (difficulty === "hard")
    return "bg-rose-soft text-rose";
  return "bg-amber-soft text-amber";
}

function bucketLabel(time: string): string | null {
  const bucket = timeBucket(time);
  if (bucket === "morning") return "Morning";
  if (bucket === "afternoon") return "Afternoon";
  if (bucket === "evening") return "Evening";
  return null;
}

/* ---------- Header ---------- */

function PageHeader({
  user,
  onAdd,
}: {
  user: LocalUser;
  onAdd: () => void;
}) {
  const firstName = user.name?.split(/\s+/)[0];
  const today = new Date();

  return (
    <header className="animate-rise flex items-center justify-between gap-3">
      <div className="flex items-center gap-3.5">
        <Avatar name={user.name} size={46} className="shadow-soft" />
        <div>
          <p className="overline">{greeting()}</p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
            {firstName || "Your day"}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="icon-btn"
        aria-label="Add a new habit"
      >
        <PlusIcon />
      </button>
    </header>
  );
}

/* ---------- Hero ---------- */

function HeroCard({
  goal,
  firstName,
  done,
  scheduled,
}: {
  goal: LocalGoal | null;
  firstName: string;
  done: number;
  scheduled: number;
}) {
  const hasPlan = scheduled > 0;
  const title = goal?.title ?? (hasPlan ? "Show up for today" : "A gentler day");
  const body = hasPlan
    ? `${done} of ${scheduled} scheduled today. Finish at your own pace — consistency beats intensity.`
    : "Nothing is scheduled today. Rest is part of the rhythm, so enjoy it.";

  const subtitle = goal
    ? `${firstName}, working toward your goal`
    : `${firstName}, building your rhythm`;

  return (
    <section
      className="animate-rise rise-delay-1 relative mt-6 overflow-hidden rounded-4xl bg-ink p-6 text-white shadow-lift sm:p-7"
      aria-labelledby="today-focus"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-accent/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-accent-2/30 blur-3xl"
      />

      <div className="relative p-6 sm:p-7">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
          <SparkIcon size={14} />
          Today&apos;s focus
        </div>

        <h2
          id="today-focus"
          className="mt-4 font-serif text-[2.1rem] leading-[1.08] tracking-tight text-white"
        >
          {title}
        </h2>

        <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">
          {subtitle} — {body}
        </p>

        <div className="mt-6 flex items-end justify-between gap-4">
          <ProgressRing
            value={scheduled === 0 ? 0 : (done / scheduled) * 100}
            size={92}
            stroke={9}
            trackClass="text-white/15"
          >
            <div className="text-center">
              <p className="text-lg font-bold leading-none text-white">
                {scheduled === 0 ? "0" : `${done}/${scheduled}`}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                done
              </p>
            </div>
          </ProgressRing>

          <ul className="space-y-2">
            <li className="flex items-center gap-2.5 text-sm text-white/85">
              <span className="h-2.5 w-2.5 rounded-full bg-mint" />
              Completed today
            </li>
            <li className="flex items-center gap-2.5 text-sm text-white/70">
              <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
              Scheduled
            </li>
            <li className="flex items-center gap-2.5 text-sm text-white/70">
              <span className="h-2.5 w-2.5 rounded-full bg-amber" />
              Still to go
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- Habit card ---------- */

type SaveStatus = "completed" | "skipped" | "failed";

function HabitCard({
  habit,
  log,
  isToday,
  isUpNext,
  onSave,
}: {
  habit: LocalHabit;
  log: LocalCompletion | null;
  isToday: boolean;
  isUpNext: boolean;
  onSave: (
    habitId: string,
    status: SaveStatus,
    reason?: string,
    reasonOther?: string,
  ) => Promise<void>;
}) {
  const [intent, setIntent] = useState<SaveStatus | null>(null);
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(status: SaveStatus) {
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

  const difficultyLabel =
    DIFFICULTIES.find((item) => item.id === habit.difficulty)?.label ?? null;
  const bucket = bucketLabel(habit.preferredTime);
  const done = log?.status === "completed";
  const skipped = log?.status === "skipped";
  const missed = log?.status === "failed";
  const reasonLabel = log?.reason
    ? FAILURE_REASONS.find((item) => item.id === log.reason)?.label
    : null;

  const statusTone = skipped
    ? "border-amber/25 bg-amber-soft/70"
    : missed
      ? "border-rose/25 bg-rose-soft/70"
      : done
        ? "border-mint/25 bg-mint-soft/70"
        : "border-line bg-surface";

  return (
    <article className={`animate-rise rounded-4xl border p-5 shadow-soft ${statusTone}`}>
      <div className="flex items-start gap-3.5">
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors ${
            done
              ? "bg-mint text-white"
              : isUpNext
                ? "bg-accent text-white shadow-soft"
                : "bg-surface-2 text-muted"
          }`}
        >
          {done ? <CheckIcon /> : <SunIcon size={19} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`text-base font-semibold tracking-tight ${
                done ? "text-muted line-through decoration-mint/60" : "text-ink"
              }`}
            >
              {habit.title}
            </h3>
            {isUpNext ? (
              <Chip className="bg-accent-soft text-accent">Up next</Chip>
            ) : null}
          </div>

          {habit.why ? (
            <p className="mt-1 font-serif text-[0.95rem] leading-snug text-muted">
              {habit.why}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Chip className="border border-line bg-surface text-ink">
              {formatTime(habit.preferredTime)}
            </Chip>
            {bucket ? (
              <Chip className="border border-line bg-surface text-muted">
                {bucket}
              </Chip>
            ) : null}
            {difficultyLabel ? (
              <Chip className={difficultyTone(habit.difficulty)}>
                {difficultyLabel}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>

      {intent ? (
        <div className="mt-5 rounded-3xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">
            Why didn&apos;t you do {habit.title}?
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {FAILURE_REASONS.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 text-sm text-ink has-[:checked]:border-transparent has-[:checked]:bg-accent-soft has-[:checked]:text-accent"
              >
                <input
                  type="radio"
                  name={`reason-${habit.id}`}
                  value={item.id}
                  checked={reason === item.id}
                  onChange={() => setReason(item.id)}
                  className="accent-accent"
                />
                {item.label}
              </label>
            ))}
          </div>

          <label className="mt-3 block text-sm text-muted">
            Other detail
            <input
              value={reasonOther}
              onChange={(event) => setReasonOther(event.target.value)}
              maxLength={120}
              className="field"
              placeholder="Optional"
            />
          </label>

          {error ? <ErrorText message={error} /> : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(intent)}
              className="btn-primary flex-1"
            >
              {saving
                ? "Saving..."
                : intent === "skipped"
                  ? "Save as skipped"
                  : "Save as missed"}
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
        </div>
      ) : (
        <div className="mt-5">
          {done || skipped || missed ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Chip
                  className={
                    done
                      ? "bg-mint text-white"
                      : skipped
                        ? "bg-amber text-white"
                        : "bg-rose text-white"
                  }
                >
                  <CheckIcon size={14} />
                  {done ? "Completed" : skipped ? "Skipped" : "Missed"}
                </Chip>
                {reasonLabel ? (
                  <span className="text-xs text-muted">{reasonLabel}</span>
                ) : null}
              </div>
              <span className="text-sm font-medium text-muted">
                {formatTime(habit.preferredTime)}
              </span>
            </div>
          ) : isToday ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => save("completed")}
                className="btn-primary"
              >
                <CheckIcon size={16} />
                Completed
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setIntent("skipped")}
                className="btn-ghost"
              >
                Skipped
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setIntent("failed")}
                className="btn-ghost"
              >
                Missed
              </button>
            </div>
          ) : (
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {done || skipped || missed
                ? "Logged for this day"
                : "Not logged — viewing only"}
            </p>
          )}
        </div>
      )}

      {error && !intent ? <ErrorText message={error} /> : null}
    </article>
  );
}

/* ---------- Check-in ---------- */

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

  const moodLabels = ["Rough", "Okay", "Fine", "Good", "Great"];

  return (
    <section className="card animate-rise p-6">
      <p className="overline">Evening check-in</p>
      <h2 className="mt-3 font-serif text-2xl text-ink">How was your day?</h2>
      <p className="mt-1 text-sm text-muted">Ten seconds. Be honest — it helps the coach.</p>

      <div className="mt-5 flex items-center justify-between gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMood(value)}
            aria-pressed={mood === value}
            aria-label={`${value} — ${moodLabels[value - 1]}`}
            className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-200 ${
              mood === value
                ? "-translate-y-0.5 border-transparent bg-accent text-white shadow-soft"
                : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-sm text-muted">
        What got in your way today?
        <input
          value={blocker}
          onChange={(event) => setBlocker(event.target.value)}
          maxLength={160}
          className="field"
          placeholder="Optional"
        />
      </label>

      {saved ? (
        <p className="mt-3 text-sm font-medium text-mint">Saved. Thanks for the honesty.</p>
      ) : null}
      {error ? <ErrorText message={error} /> : null}

      <button
        type="button"
        disabled={saving}
        onClick={submit}
        className="btn-primary mt-5 w-full"
      >
        {saving
          ? "Saving..."
          : existing
            ? "Update check-in"
            : "Save check-in"}
      </button>
    </section>
  );
}

/* ---------- Add habit ---------- */

function AddHabit({
  user,
  onCreated,
  open,
  onOpenChange,
}: {
  user: LocalUser;
  onCreated: () => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [why, setWhy] = useState("");
  const [frequency, setFrequency] = useState(4);
  const [preferredTime, setPreferredTime] = useState("07:00");
  const [difficulty, setDifficulty] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        difficulty: difficulty as "easy" | "medium" | "hard",
      });

      setTitle("");
      setGoalTitle("");
      setWhy("");
      setFrequency(4);
      setPreferredTime("07:00");
      setDifficulty("medium");
      onOpenChange(false);

      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create habit.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => onOpenChange(true)} className="btn-ghost w-full">
        <PlusIcon size={17} />
        Add another habit
      </button>
    );
  }

  return (
    <div className="card animate-rise p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-ink">New habit</h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="icon-btn h-10 w-10 text-sm"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block text-sm text-muted">
          Habit
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="field"
            placeholder="Read 20 minutes"
          />
        </label>

        <label className="block text-sm text-muted">
          Related goal (optional)
          <input
            value={goalTitle}
            onChange={(event) => setGoalTitle(event.target.value)}
            className="field"
            placeholder="Get healthier"
          />
        </label>

        <label className="block text-sm text-muted">
          Why it matters
          <input
            value={why}
            onChange={(event) => setWhy(event.target.value)}
            className="field"
            placeholder="I want more energy"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm text-muted">
            Days per week
            <select
              value={frequency}
              onChange={(event) => setFrequency(Number(event.target.value))}
              className="field"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-muted">
            Preferred time
            <input
              value={preferredTime}
              onChange={(event) => setPreferredTime(event.target.value)}
              type="time"
              required
              className="field"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm text-muted">Difficulty</legend>
          <div className="mt-2 flex gap-2">
            {DIFFICULTIES.map((item) => (
              <label
                key={item.id}
                className={`flex-1 cursor-pointer rounded-2xl border px-3 py-2.5 text-center text-sm transition-colors ${
                  difficulty === item.id
                    ? "border-transparent bg-accent-soft text-accent"
                    : "border-line bg-surface text-ink"
                }`}
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
      </div>

      {error ? <ErrorText message={error} /> : null}

      <div className="mt-6 flex gap-2">
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
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function TodayPage() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [habits, setHabits] = useState<LocalHabit[]>([]);
  const [completions, setCompletions] = useState<LocalCompletion[]>([]);
  const [goals, setGoals] = useState<LocalGoal[]>([]);
  const [checkIns, setCheckIns] = useState<LocalCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [addOpen, setAddOpen] = useState(false);

  const addSectionRef = useRef<HTMLDivElement>(null);
  const today = todayKey();
  const isToday = selectedDate === today;

  const refresh = useCallback(async () => {
    const localUser = await getLocalUser();
    const [localHabits, localCompletions, localGoals, localCheckIns] =
      await Promise.all([
        getHabits(localUser.id),
        getCompletions(localUser.id),
        getGoals(localUser.id),
        import("@/lib/local/habits").then(({ getCheckIns }) =>
          getCheckIns(localUser.id),
        ),
      ]);

    setUser(localUser);
    setHabits(localHabits);
    setCompletions(localCompletions);
    setGoals(localGoals);
    setCheckIns(localCheckIns);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (alive) {
          setError(
            err instanceof Error ? err.message : "Could not load Today.",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [refresh]);

  const stripDays = useMemo(() => dateKeysInclusive(selectedDate, 7), [selectedDate]);

  const stripStats = useMemo(() => {
    const byDay: Record<
      string,
      { done: number; scheduled: number } | undefined
    > = {};

    for (const day of stripDays) {
      let scheduled = 0;
      let done = 0;

      for (const habit of habits) {
        if (!isScheduledOn(habit, day)) continue;
        scheduled += 1;

        const completion = completions.find(
          (item) => item.habitId === habit.id && item.date === day,
        );

        if (completion?.status === "completed") done += 1;
      }

      byDay[day] = { scheduled, done };
    }

    return byDay;
  }, [habits, completions, stripDays]);

  const dayPlans = useMemo(
    () =>
      habits
        .filter((habit) => isScheduledOn(habit, selectedDate))
        .map((habit) => ({
          habit,
          log:
            completions.find(
              (completion) =>
                completion.habitId === habit.id &&
                completion.date === selectedDate,
            ) ?? null,
        }))
        .sort((a, b) => {
          if (a.habit.preferredTime !== b.habit.preferredTime) {
            return a.habit.preferredTime.localeCompare(b.habit.preferredTime);
          }
          return a.habit.title.localeCompare(b.habit.title);
        }),
    [habits, completions, selectedDate],
  );

  const doneToday = dayPlans.filter((item) => item.log?.status === "completed").length;
  const weekdayLabel = parseDateKey(selectedDate).toLocaleDateString("en-US", {
    weekday: "long",
  });
  const week = weeklyConsistency(habits, completions);
  const goal = goals.at(-1) ?? null;
  const firstName = user?.name?.split(/\s+/)[0] ?? "friend";

  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const upNextKey = useMemo(() => {
    if (!isToday) return null;

    const pending = dayPlans.filter((item) => !item.log);

    for (const item of pending) {
      const [h, m] = item.habit.preferredTime.split(":").map(Number);
      if (h !== undefined && m !== undefined && h * 60 + m >= nowMinutes) {
        return item.habit.id;
      }
    }

    return null;
  }, [dayPlans, isToday, nowMinutes]);

  const todayCheckIn = isToday
    ? checkIns.find((checkIn) => checkIn.date === today) ?? null
    : null;

  function handleAddHabit() {
    setAddOpen(true);
    requestAnimationFrame(() => {
      addSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function handleHabitSave(
    habitId: string,
    status: SaveStatus,
    reason?: string,
    reasonOther?: string,
  ) {
    if (!user) return;

    await logHabit({
      userId: user.id,
      habitId,
      date: today,
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
      date: today,
      mood,
      blocker: blocker || null,
    });

    await refresh();
  }

  if (loading && !user) {
    return (
      <main className="space-y-4" aria-label="Loading today">
        <div className="h-14 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-56 animate-pulse rounded-4xl bg-surface-2" />
        <div className="h-28 animate-pulse rounded-4xl bg-surface-2" />
        <div className="h-28 animate-pulse rounded-4xl bg-surface-2" />
      </main>
    );
  }

  if (error && !user) {
    return (
      <main>
        <EmptyState
          title="Couldn’t load today"
          body={error}
          icon={<SparkIcon size={22} />}
        />
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="pb-6">
      <PageHeader user={user} onAdd={handleAddHabit} />

      <HeroCard
        goal={goal}
        firstName={firstName}
        done={doneToday}
        scheduled={dayPlans.length}
      />

      <section className="animate-rise rise-delay-2 mt-7" aria-labelledby="date-heading">
        <div className="flex items-end justify-between px-1">
          <h2 id="date-heading" className="overline">
            Select a day
          </h2>
          <button
            type="button"
            onClick={() => setSelectedDate(today)}
            className="flex items-center gap-1.5 text-xs font-semibold text-accent"
          >
            <CalendarIcon size={14} />
            Back to today
          </button>
        </div>

        <div className="mt-3">
          <DateStrip
            days={stripDays}
            selectedKey={selectedDate}
            todayKey={today}
            completionsByDay={stripStats}
            onSelect={setSelectedDate}
          />
        </div>
      </section>

      <section className="mt-7" aria-labelledby="plan-heading">
        <div className="flex items-center justify-between px-1">
          <h2 id="plan-heading" className="overline">
            {isToday ? "Today’s plan" : weekdayLabel}
          </h2>

          {dayPlans.length > 0 ? (
            <Chip className="bg-accent-soft text-accent">
              {isToday ? `${doneToday}/${dayPlans.length} done` : "Read only"}
            </Chip>
          ) : null}
        </div>

        {!isToday ? (
          <p className="mt-2 flex items-center gap-2 rounded-2xl bg-sky-soft px-4 py-3 text-xs font-medium text-sky">
            <span className="h-1.5 w-1.5 rounded-full bg-sky" />
            You’re viewing {weekdayLabel}. Check-ins are for today only.
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          {dayPlans.length === 0 ? (
            <EmptyState
              title={isToday ? "Nothing scheduled today" : "Nothing scheduled"}
              body={
                isToday
                  ? "Rest is part of the plan. You can still add a habit if you want one."
                  : "This day was left open. Enjoy it."
              }
              icon={<SunIcon size={22} />}
            />
          ) : (
            dayPlans.map((plan) => (
              <HabitCard
                key={plan.habit.id}
                habit={plan.habit}
                log={plan.log}
                isToday={isToday}
                isUpNext={upNextKey === plan.habit.id}
                onSave={handleHabitSave}
              />
            ))
          )}
        </div>
      </section>

      <section className="animate-rise mt-7" aria-labelledby="progress-heading">
        <h2 id="progress-heading" className="overline px-1">
          Your rhythm
        </h2>

        <div className="card mt-3 flex items-center justify-between gap-5 p-5">
          <div className="flex items-center gap-4">
            <ProgressRing
              value={week}
              size={72}
              stroke={8}
              trackClass="text-line"
            >
              <p className="text-base font-bold text-ink">{week}%</p>
            </ProgressRing>
            <div>
              <p className="text-sm font-semibold text-ink">7-day rhythm</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Consistency across your scheduled habits this week.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Chip className="bg-mint-soft text-mint">Done {doneToday}</Chip>
            <Chip className="border border-line bg-surface text-muted">
              Planned {dayPlans.length}
            </Chip>
          </div>
        </div>
      </section>

      {isToday ? (
        <section className="mt-7">
          <CheckInCard key={today} existing={todayCheckIn} onSave={handleCheckInSave} />
        </section>
      ) : null}

      <section ref={addSectionRef} className="mt-7 scroll-mt-6">
        <AddHabit
          user={user}
          onCreated={refresh}
          open={addOpen}
          onOpenChange={setAddOpen}
        />

        {addOpen ? (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ArrowIcon size={13} />
            Stored locally on this device only
          </p>
        ) : null}
      </section>
    </main>
  );
}