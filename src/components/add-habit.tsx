"use client";

import { useActionState, useState } from "react";
import { createHabit } from "@/lib/actions/onboarding";
import { DIFFICULTIES } from "@/lib/constants";
import { ErrorText } from "./states";
import { SubmitButton } from "./submit-button";

export function AddHabit() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createHabit, {});

  if (!open) {
    return (
      <button type="button" className="btn-ghost w-full" onClick={() => setOpen(true)}>
        Add another habit
      </button>
    );
  }

  return (
    <form action={action} className="rounded-3xl border border-line bg-paper p-5">
      <p className="font-serif text-xl text-ink">New habit</p>
      <label className="mt-4 block text-sm text-muted">
        Habit
        <input name="title" required className="field" placeholder="Read 20 minutes" />
      </label>
      <label className="mt-3 block text-sm text-muted">
        Related goal (optional)
        <input name="goalTitle" className="field" placeholder="Get healthier" />
      </label>
      <label className="mt-3 block text-sm text-muted">
        Why it matters
        <input name="why" className="field" placeholder="I want more energy" />
      </label>
      <label className="mt-3 block text-sm text-muted">
        Days per week
        <select name="frequencyPerWeek" defaultValue="4" className="field">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm text-muted">
        Preferred time
        <input name="preferredTime" type="time" required defaultValue="07:00" className="field" />
      </label>
      <fieldset className="mt-3">
        <legend className="text-sm text-muted">Difficulty</legend>
        <div className="mt-2 flex gap-2">
          {DIFFICULTIES.map((item, index) => (
            <label
              key={item.id}
              className="flex-1 cursor-pointer rounded-2xl border border-line px-3 py-2 text-center text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
            >
              <input
                type="radio"
                name="difficulty"
                value={item.id}
                defaultChecked={index === 1}
                className="sr-only"
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <ErrorText message={state.error} />
      <div className="mt-4 flex gap-2">
        <SubmitButton className="btn-primary flex-1">Save habit</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
