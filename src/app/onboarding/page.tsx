"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createGoal,
  createHabit,
} from "@/lib/local/habits";
import { getLocalUser, markLocalUserOnboarded } from "@/lib/local/session";
import { TimePickerField } from "@/components/time-picker";
import { syncAllReminders } from "@/lib/local/reminders";
import {
  defaultDaysForFrequency,
  DIFFICULTIES,
} from "@/lib/constants";

export default function OnboardingPage() {
  const router = useRouter();

  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [consequence, setConsequence] = useState("");
  const [important, setImportant] = useState(true);
  const [frequency, setFrequency] = useState("3");
  const [preferredTime, setPreferredTime] = useState("08:00");
  const [difficulty, setDifficulty] = useState<string>(
    DIFFICULTIES[1]?.id ?? DIFFICULTIES[0]?.id ?? "medium",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!goal.trim()) {
      setError("Please enter your goal.");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a habit.");
      return;
    }

    if (!why.trim()) {
      setError("Please tell us why this habit matters.");
      return;
    }

    setSaving(true);

    try {
      const user = await getLocalUser();

      const newGoal = await createGoal(user.id, goal.trim());

      await createHabit({
        userId: user.id,
        goalId: newGoal.id,
        title: title.trim(),
        why: why.trim(),
        consequence: consequence.trim() || null,
        isImportant: important,
        frequencyPerWeek: Number(frequency),
        daysOfWeek: JSON.stringify(
          defaultDaysForFrequency(Number(frequency)),
        ),
        preferredTime,
        difficulty: difficulty as "easy" | "medium" | "hard",
      });

      await markLocalUserOnboarded();

      syncAllReminders().catch(() => {
        // reminders are best-effort
      });

      router.replace("/today");
    } catch (err) {
      console.error(err);
      setError("Something went wrong while setting up HabItiva.");
      setSaving(false);
    }
  }

  return (
    <div className="animate-rise">
      <header className="mb-8 px-1">
        <p className="eyebrow">HabItiva</p>
        <h1 className="mt-3 font-serif text-[2.1rem] leading-[1.12] tracking-tight text-ink">
          Build a habit that fits your life.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Start with one habit. We&apos;ll help you make it sustainable — and
          everything stays on this device.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6 sm:p-7">
        <label className="block text-sm text-muted">
          What is your main goal?
          <input
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            className="field"
            placeholder="Get healthier"
            required
          />
        </label>

        <label className="block text-sm text-muted">
          What habit do you want to build?
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="field"
            placeholder="Walk for 20 minutes"
            required
          />
        </label>

        <fieldset>
          <legend className="mb-3 text-sm text-muted">How often?</legend>
          <div className="grid grid-cols-4 gap-2">
            {[
              ["2", "2×"],
              ["3", "3×"],
              ["5", "5×"],
              ["7", "Daily"],
            ].map(([value, label]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-2xl border px-3 py-3 text-center text-sm transition-colors ${
                  frequency === value
                    ? "border-transparent bg-accent-soft text-accent"
                    : "border-line bg-surface text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="frequency"
                  value={value}
                  checked={frequency === value}
                  onChange={() => setFrequency(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <TimePickerField value={preferredTime} onChange={setPreferredTime} />

        <fieldset>
          <legend className="mb-3 text-sm text-muted">
            How difficult should this feel?
          </legend>
          <div className="flex gap-2">
            {DIFFICULTIES.map((item) => (
              <label
                key={item.id}
                className={`flex-1 cursor-pointer rounded-2xl border px-3 py-3 text-center text-sm transition-colors ${
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

        <label className="block text-sm text-muted">
          Why is this habit important to you?
          <textarea
            value={why}
            onChange={(event) => setWhy(event.target.value)}
            required
            rows={3}
            className="field"
            placeholder="I want more energy."
          />
        </label>

        <label className="block text-sm text-muted">
          If you skip it, what suffers?
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
          This habit is important to me
        </label>

        {error && (
          <p className="text-sm font-medium text-rose" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? "Setting up..." : "Start tracking"}
        </button>

        <p className="text-center text-xs text-muted">
          Data stays on this device. Nothing is uploaded.
        </p>
      </form>
    </div>
  );
}