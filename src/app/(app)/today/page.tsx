"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, ErrorText } from "@/components/states";
import { CommandInput } from "@/components/command-input";
import {
  ArrowIcon,
  CalendarIcon,
  CheckIcon,
  Chip,
  DateStrip,
  PlusIcon,
  ProgressRing,
  SparkIcon,
  SunIcon,
  MoonIcon,
} from "@/components/ui";
import {
  DIFFICULTIES,
  FAILURE_REASONS,
  parseDaysOfWeek,
} from "@/lib/constants";
import {
  HabitForm,
  habitFormToCreateInput,
  type HabitFormValues,
} from "@/components/habit-form";
import {
  dateKeysInclusive,
  formatTime,
  parseDateKey,
  timeBucket,
  todayKey,
} from "@/lib/dates";
import {
  createHabit,
  deleteHabit,
  ensureGoalForHabit,
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
import { isNativeApp } from "@/lib/local/database";
import { completeHabit, fetchTodayData, saveCheckInWeb } from "@/lib/api/web-today";
import {
  exactAlarmsGranted,
  notificationPermissionGranted,
  openExactAlarmSettings,
  requestNotificationPermission,
  syncAllReminders,
} from "@/lib/local/reminders";
import { useModalBackHandler } from "@/lib/navigation/use-modal-back";

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
  selectedKey,
  today,
  onBackToToday,
}: {
  selectedKey: string;
  today: string;
  onBackToToday: () => void;
}) {
  const isToday = selectedKey === today;
  const date = parseDateKey(selectedKey).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="animate-rise relative flex items-center justify-center">
      <button
        type="button"
        onClick={onBackToToday}
        aria-label={isToday ? undefined : "Back to today"}
        className="flex items-center gap-3 rounded-full border border-line bg-surface px-5 py-2.5 shadow-soft transition-colors hover:border-accent/40"
      >
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent">
          Today
        </span>
        <span aria-hidden="true" className="h-3.5 w-px bg-line" />
        <span className="text-sm font-semibold tracking-tight text-ink">{date}</span>
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
      className="animate-rise rise-delay-1 relative mt-6 overflow-hidden rounded-4xl bg-charcoal p-6 text-white shadow-lift sm:p-7"
      aria-labelledby="today-focus"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-accent/35 blur-3xl"
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

type SaveStatus = "completed" | "skipped" | "failed" | "deleted";

function HabitCard({
  habit,
  log,
  isToday,
  isUpNext,
  readOnly,
  serverComplete,
  onSave,
  onDelete,
}: {
  habit: LocalHabit;
  log: LocalCompletion | null;
  isToday: boolean;
  isUpNext: boolean;
  readOnly?: boolean;
  /** Web server mode: Completed + Skip/Miss with reasons (no delete yet). */
  serverComplete?: boolean;
  onSave: (
    habitId: string,
    status: SaveStatus,
    reason?: string,
    reasonOther?: string,
  ) => Promise<void>;
  onDelete: (habitId: string) => Promise<void>;
}) {
  const [intent, setIntent] = useState<SaveStatus | null>(null);
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

          {habit.consequence ? (
            <p className="mt-1.5 text-xs leading-5 text-muted">
              Skipping means {habit.consequence}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {habit.isImportant ? (
              <Chip className="bg-peach-soft text-peach">Important</Chip>
            ) : null}
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
          ) : isToday && (!readOnly || serverComplete) ? (
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
              {!readOnly || serverComplete ? (
                <>
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
                </>
              ) : null}
              {!readOnly ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn-danger"
                  >
                    Delete
                  </button>
              ) : null}
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

      {showDeleteConfirm && (
        <div className="mt-5 rounded-3xl border border-rose/30 bg-rose-soft/50 p-4">
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
              disabled={saving}
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(habit.id);
              }}
              className="btn-primary flex-1"
            >
              {saving ? "Deleting&hellip;" : "Delete"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowDeleteConfirm(false)}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------- Check-in ---------- */

function CheckInCard({
  existing,
  readOnly,
  serverSave,
  onSave,
}: {
  existing: LocalCheckIn | null;
  readOnly?: boolean;
  /** Web server mode: interactive card wired to the server (not local SQLite). */
  serverSave?: boolean;
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

  if (readOnly && !serverSave) {
    if (!existing) return null;
    return (
      <section className="card animate-rise p-6">
        <p className="eyebrow">Evening check-in</p>
        <p className="mt-3 text-sm leading-6 text-muted">
          You rated the day {existing.mood} of 5
          {existing.blocker ? ` — blocking: ${existing.blocker}` : "."}
        </p>
      </section>
    );
  }

  return (
    <section className="card animate-rise p-6">
      <p className="eyebrow">Evening check-in</p>
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
  readOnly,
  onCreated,
  open,
  onOpenChange,
}: {
  user: LocalUser;
  readOnly?: boolean;
  onCreated: () => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [formKey, setFormKey] = useState(0);

  // Add Habit → Back returns to Today, never to the home screen.
  useModalBackHandler(open, () => onOpenChange(false));

  if (readOnly) {
    return (
      <p className="mt-4 text-center text-xs leading-5 text-muted">
        Habit setup lives in the app for now — this view is read-only.
      </p>
    );
  }

  async function submit(values: HabitFormValues) {
    try {
      const goalId = await ensureGoalForHabit(user.id, values.goalTitle);

      await createHabit(habitFormToCreateInput(user.id, goalId, values));

      setFormKey((key) => key + 1);
      onOpenChange(false);

      await onCreated();
      syncAllReminders().catch(() => {
        // reminders are best-effort
      });
    } catch (err) {
      throw err instanceof Error ? err : new Error("Could not create habit.");
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

      <div className="mt-6">
        <HabitForm
          key={formKey}
          submitLabel="Save habit"
          showGoalField
          onSubmit={submit}
        />
      </div>

      <div className="mt-4">
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- Reminder card ---------- */

function ReminderCard() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [exact, setExact] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [perm, exactAlarm] = await Promise.all([
      notificationPermissionGranted(),
      exactAlarmsGranted(),
    ]);
    setPermission(perm);
    setExact(exactAlarm);
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      setPermission(false);
    });
  }, [refresh]);

  if (permission === null) {
    return (
      <section className="card mt-6 animate-pulse p-6" aria-hidden="true">
        <div className="h-4 w-28 rounded bg-surface-2" />
        <div className="mt-3 h-4 w-56 rounded bg-surface-2" />
        <div className="mt-4 h-11 w-44 rounded-full bg-surface-2" />
      </section>
    );
  }

  async function enable() {
    setBusy(true);
    setError("");

    try {
      const granted = await requestNotificationPermission();

      if (granted) {
        await syncAllReminders();
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function openTiming() {
    setBusy(true);
    setError("");

    try {
      await openExactAlarmSettings();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open settings.");
      setBusy(false);
    }
  }

  return (
    <section
      className="animate-rise rise-delay-2 mt-6 rounded-4xl border border-accent/15 bg-accent-soft p-5 shadow-soft"
      aria-labelledby="reminders-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <p id="reminders-heading" className="text-sm font-semibold text-ink">
          Nudges
        </p>
        {permission && exact ? (
          <span className="chip bg-mint-soft text-mint">On</span>
        ) : (
          <span className="chip bg-amber-soft text-amber">Off</span>
        )}
      </div>

      <p className="mt-2 text-xs leading-5 text-muted">
        {permission && exact
          ? "Habit reminders are scheduled for the days and times you picked. You can mark one done right from the notification."
          : permission
            ? "Reminders are on, but precise timing is off. Exact alarms keep nudges on schedule even between app opens."
            : "Get a quiet nudge at your preferred time. Everything stays on this device — no account, no server."}
      </p>

      {permission && exact ? null : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!permission ? (
            <button
              type="button"
              disabled={busy}
              onClick={enable}
              className="btn-primary"
            >
              {busy ? "Working..." : "Turn on reminders"}
            </button>
          ) : null}

          {permission && !exact ? (
            <button
              type="button"
              disabled={busy}
              onClick={openTiming}
              className="btn-ghost"
            >
              Allow precise timing
            </button>
          ) : null}
        </div>
      )}

      {error ? <ErrorText message={error} /> : null}
    </section>
  );
}

/* ---------- Compact theme toggle (for bottom section) ---------- */

function ThemeSheetCompact() {
  const [preference, setPreference] = useState<"light" | "dark" | "system">(() => {
    if (typeof window === "undefined") return "system";
    const stored = localStorage.getItem("habitcoach.theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  });

  const apply = useCallback((next: "light" | "dark" | "system") => {
    document.documentElement.setAttribute(
      "data-theme",
      next === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next,
    );
  }, []);

  useEffect(() => {
    apply(preference);
  }, [apply, preference]);

  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [apply, preference]);

  function select(next: "light" | "dark" | "system") {
    setPreference(next);
    localStorage.setItem("habitcoach.theme", next);
    apply(next);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="eyebrow mb-3">Appearance</p>
      <div className="flex items-center gap-2">
        {[
          { value: "light" as const, label: "Light", icon: <SunIcon size={18} /> },
          { value: "dark" as const, label: "Dark", icon: <MoonIcon size={18} /> },
          { value: "system" as const, label: "System", icon: <CalendarIcon size={18} /> },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={preference === option.value}
            onClick={() => select(option.value)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
              preference === option.value
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-ink hover:border-accent/40"
            }`}
          >
            <span className="shrink-0 text-muted">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function TodayPage() {
  return (
    <Suspense fallback={null}>
      <TodayContent />
    </Suspense>
  );
}

function TodayContent() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [habits, setHabits] = useState<LocalHabit[]>([]);
  const [completions, setCompletions] = useState<LocalCompletion[]>([]);
  const [goals, setGoals] = useState<LocalGoal[]>([]);
  const [checkIns, setCheckIns] = useState<LocalCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [addOpen, setAddOpen] = useState(false);

  const addSectionRef = useRef<HTMLDivElement>(null);
  const today = todayKey();
  const isToday = selectedDate === today;
  const searchParams = useSearchParams();
  const addRequested = searchParams.get("add") === "1";

  // Native app: local SQLite (unchanged). Web: read-only server data —
  // writes stay native-only for this phase.
  const nativeMode = isNativeApp();

  const refresh = useCallback(async () => {
    if (!isNativeApp()) {
      const result = await fetchTodayData();
      if (!result.ok) {
        if (result.code === "UNAUTHORIZED") {
          setNeedsAuth(true);
          setUser(null);
          return;
        }
        throw new Error(result.error);
      }
      setNeedsAuth(false);
      setUser(result.data.user);
      // Server rows carry no device-only fields; default them for the UI.
      setHabits(
        result.data.habits.map((habit) => ({
          ...habit,
          consequence: null,
          isImportant: false,
        })),
      );
      setCompletions(result.data.completions);
      setGoals(result.data.goals);
      setCheckIns(result.data.checkIns);
      return;
    }

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

  useEffect(() => {
    if (!addRequested || addOpen || loading || !user) return;
    const id = requestAnimationFrame(handleAddHabit);
    return () => cancelAnimationFrame(id);
  }, [addRequested, addOpen, loading, user]);

  async function handleHabitSave(
    habitId: string,
    status: SaveStatus,
    reason?: string,
    reasonOther?: string,
  ) {
    if (!user) return;

    // Web: authenticated server write via /api/web/complete (which delegates
    // to the existing session-scoped logHabit — no userId ever leaves the
    // browser, ownership and reason validity are enforced server-side).
    if (!nativeMode) {
      if (status === "deleted") return;
      const result = await completeHabit(habitId, {
        status,
        ...(reason !== undefined ? { reason } : {}),
        ...(reasonOther !== undefined ? { reasonOther } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      await refresh();
      return;
    }

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

    // Web: authenticated server write via /api/web/checkin (delegates to the
    // existing session-scoped submitCheckIn — one row per user/day).
    if (!nativeMode) {
      const result = await saveCheckInWeb(mood, blocker);
      if (!result.ok) throw new Error(result.error);
      await refresh();
      return;
    }

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

  if (needsAuth) {
    return (
      <main>
        <EmptyState
          title="Sign in to see Today"
          body="Your habits live in your Habitiva account. Sign in to load them here."
          icon={<SparkIcon size={22} />}
        />
        <div className="mt-4 text-center">
          <a href="/login" className="btn-primary inline-block">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="pb-6">
      <PageHeader
        selectedKey={selectedDate}
        today={today}
        onBackToToday={() => setSelectedDate(today)}
      />

      <HeroCard
        goal={goal}
        firstName={firstName}
        done={doneToday}
        scheduled={dayPlans.length}
      />

      <section className="mt-7" aria-labelledby="plan-heading">
        <div className="flex items-center justify-between px-1">
          <h2 id="plan-heading" className="eyebrow">
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
                readOnly={!nativeMode}
                serverComplete={!nativeMode}
                onSave={handleHabitSave}
                onDelete={async (habitId) => {
                  if (!nativeMode || !user) return;
                  await deleteHabit(user.id, habitId);
                  refresh();
                  syncAllReminders().catch(() => {
                    // reminders are best-effort
                  });
                }}
              />
            ))
          )}
        </div>
      </section>

      <section className="animate-rise rise-delay-2 mt-7" aria-labelledby="date-heading">
        <div className="flex items-end justify-between px-1">
          <h2 id="date-heading" className="eyebrow">
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

      <CommandInput onChanged={() => refresh().catch(() => undefined)} />

      <ReminderCard />

      <section className="animate-rise mt-7" aria-labelledby="progress-heading">
        <h2 id="progress-heading" className="eyebrow px-1">
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
          <CheckInCard key={today} existing={todayCheckIn} readOnly={!nativeMode} serverSave={!nativeMode} onSave={handleCheckInSave} />
        </section>
      ) : null}

      <section ref={addSectionRef} className="mt-7 scroll-mt-6">
        <AddHabit
          user={user}
          readOnly={!nativeMode}
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

        {/* Dark mode toggle */}
        <div className="mt-6 animate-rise">
          <ThemeSheetCompact />
        </div>
      </section>

      </main>
  );
}