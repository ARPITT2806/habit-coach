"use client";

import { useId, useState } from "react";

import { ErrorText } from "@/components/states";
import { TimePickerField } from "@/components/time-picker";
import { defaultDaysForFrequency, DIFFICULTIES } from "@/lib/constants";
import { formatTime } from "@/lib/dates";

export type HabitFormValues = {
  title: string;
  goalTitle: string;
  why: string;
  consequence: string;
  important: boolean;
  frequency: number;
  preferredTime: string;
  difficulty: string;
};

export const EMPTY_HABIT_FORM: HabitFormValues = {
  title: "",
  goalTitle: "",
  why: "",
  consequence: "",
  important: false,
  frequency: 4,
  preferredTime: "07:00",
  difficulty: "medium",
};

export function HabitForm({
  initial = EMPTY_HABIT_FORM,
  submitLabel,
  showGoalField = true,
  onSubmit,
  onPreferredTimeSave,
}: {
  initial?: HabitFormValues;
  submitLabel: string;
  showGoalField?: boolean;
  onSubmit: (values: HabitFormValues) => Promise<void>;
  onPreferredTimeSave?: (newTime: string) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [goalTitle, setGoalTitle] = useState(initial.goalTitle);
  const [why, setWhy] = useState(initial.why);
  const [consequence, setConsequence] = useState(initial.consequence);
  const [important, setImportant] = useState(initial.important);
  const [frequency, setFrequency] = useState(initial.frequency);
  const [preferredTime, setPreferredTime] = useState(initial.preferredTime);
  const [difficulty, setDifficulty] = useState(initial.difficulty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [timeSavedNote, setTimeSavedNote] = useState<string | null>(null);
  const formId = useId();

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
      await onSubmit({
        title: title.trim(),
        goalTitle: goalTitle.trim(),
        why: why.trim(),
        consequence: consequence.trim(),
        important,
        frequency,
        preferredTime,
        difficulty,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save habit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
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

      {showGoalField ? (
        <label className="block text-sm text-muted">
          Related goal (optional)
          <input
            value={goalTitle}
            onChange={(event) => setGoalTitle(event.target.value)}
            className="field"
            placeholder="Get healthier"
          />
        </label>
      ) : null}

      <label className="block text-sm text-muted">
        Why it matters
        <input
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          className="field"
          placeholder="I want more energy"
        />
      </label>

      <label className="block text-sm text-muted">
        If you skip this habit, what suffers?
        <textarea
          value={consequence}
          onChange={(event) => setConsequence(event.target.value)}
          rows={2}
          className="field"
          placeholder="I feel sluggish all day (optional)"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={important}
          onChange={(event) => setImportant(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-accent"
        />
        <span>
          This habit is important to me
          {important && !why.trim() && !consequence.trim() ? (
            <span className="mt-0.5 block text-xs text-muted">
              Adding a reason helps reminders remind you why.
            </span>
          ) : null}
        </span>
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

        <TimePickerField
          value={preferredTime}
          onChange={setPreferredTime}
          onSave={(newTime) => {
            setTimeSavedNote(null);
            try {
              void Promise.resolve(onPreferredTimeSave?.(newTime)).then(() => {
                if (onPreferredTimeSave) setTimeSavedNote(newTime);
              });
            } catch {
              // immediate persistence is best-effort; the form submit still saves the time
            }
          }}
        />
      </div>

      {timeSavedNote ? (
        <p className="text-xs font-semibold text-mint" role="status">
          Time saved ✓ {formatTime(timeSavedNote)} — reminders will use this time.
        </p>
      ) : null}

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
                  name={`difficulty-${formId}`}
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

      {error ? <ErrorText message={error} /> : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          className="btn-primary flex-1"
          onClick={submit}
        >
          {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

export function habitFormToCreateInput(
  userId: string,
  goalId: string | null,
  values: HabitFormValues,
) {
  return {
    userId,
    goalId,
    title: values.title,
    why: values.why || null,
    consequence: values.consequence || null,
    isImportant: values.important,
    frequencyPerWeek: values.frequency,
    daysOfWeek: JSON.stringify(defaultDaysForFrequency(values.frequency)),
    preferredTime: values.preferredTime,
    difficulty: values.difficulty as "easy" | "medium" | "hard",
  };
}
