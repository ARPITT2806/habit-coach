"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createGoal,
  createHabit,
} from "@/lib/local/habits";
import { getLocalUser, markLocalUserOnboarded } from "@/lib/local/session";
import {
  defaultDaysForFrequency,
  DIFFICULTIES,
} from "@/lib/constants";

export default function OnboardingPage() {
  const router = useRouter();

  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [frequency, setFrequency] = useState("3");
  const [preferredTime, setPreferredTime] = useState("08:00");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(    (DIFFICULTIES[1]?.id ?? DIFFICULTIES[0]?.id ?? "medium") as "easy" | "medium" | "hard",  );
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
        frequencyPerWeek: Number(frequency),
        daysOfWeek: JSON.stringify(
          defaultDaysForFrequency(Number(frequency)),
        ),
        preferredTime,
        difficulty,
      });

      await markLocalUserOnboarded();

      router.replace("/today");
    } catch (err) {
      console.error(err);
      setError("Something went wrong while setting up Habit Flow.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg">
      <div className="mb-10">
        <p className="mb-3 text-xs uppercase tracking-[0.22em] text-muted">
          Habit Flow
        </p>

        <h1 className="text-3xl font-medium tracking-tight">
          Build a habit that fits your life.
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted">
          Start with one habit. We&apos;ll help you make it sustainable.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="block text-sm text-muted">
          What is your main goal?
          <input
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            className="field mt-2 w-full"
            placeholder="Get healthier"
            required
          />
        </label>

        <label className="block text-sm text-muted">
          What habit do you want to build?
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="field mt-2 w-full"
            placeholder="Walk for 20 minutes"
            required
          />
        </label>

        <fieldset>
          <legend className="mb-3 text-sm text-muted">
            How often?
          </legend>

          <div className="grid grid-cols-4 gap-2">
            {[
              ["2", "2×"],
              ["3", "3×"],
              ["5", "5×"],
              ["7", "Daily"],
            ].map(([value, label]) => (
              <label
                key={value}
                className="cursor-pointer rounded-2xl border border-line px-3 py-3 text-center text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
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

        <label className="block text-sm text-muted">
          Preferred time
          <input
            type="time"
            value={preferredTime}
            onChange={(event) => setPreferredTime(event.target.value)}
            className="field mt-2 w-full"
            required
          />
        </label>

        <fieldset>
          <legend className="mb-3 text-sm text-muted">
            How difficult should this feel?
          </legend>

          <div className="flex gap-2">
            {DIFFICULTIES.map((item, index) => (
              <label
                key={item.id}
                className="flex-1 cursor-pointer rounded-2xl border border-line px-3 py-3 text-center text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
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
            className="field mt-2 w-full"
            placeholder="I want more energy."
          />
        </label>

        {error && (
          <p className="text-sm text-red-600" role="alert">
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
      </form>
    </main>
  );
}
