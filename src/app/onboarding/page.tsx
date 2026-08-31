"use client";

import { useActionState } from "react";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { DIFFICULTIES } from "@/lib/constants";
import { ErrorText } from "@/components/states";
import { SubmitButton } from "@/components/submit-button";

export default function OnboardingPage() {
  const [state, action] = useActionState(completeOnboarding, {});

  return (
    <main className="mx-auto min-h-full max-w-md px-6 py-12">
      <p className="text-xs uppercase tracking-[0.22em] text-muted">Getting started</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight">Tell North what matters.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Six questions. You can add more habits later.</p>
      <form action={action} className="mt-8 space-y-5">
        <label className="block text-sm text-muted">
          What goal do you want to improve?
          <input name="goal" required className="field" placeholder="Get healthier" />
        </label>
        <label className="block text-sm text-muted">
          What habit do you want to build?
          <input name="habit" required className="field" placeholder="Exercise" />
        </label>
        <label className="block text-sm text-muted">
          How often?
          <select name="frequencyPerWeek" defaultValue="4" className="field">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "day" : "days"} per week
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-muted">
          Preferred time
          <input name="preferredTime" type="time" required defaultValue="07:00" className="field" />
        </label>
        <fieldset>
          <legend className="text-sm text-muted">Difficulty</legend>
          <div className="mt-2 flex gap-2">
            {DIFFICULTIES.map((item, index) => (
              <label
                key={item.id}
                className="flex-1 cursor-pointer rounded-2xl border border-line px-3 py-3 text-center text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
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
        <label className="block text-sm text-muted">
          Why is this habit important to you?
          <textarea name="why" required rows={3} className="field" placeholder="I want more energy." />
        </label>
        <ErrorText message={state.error} />
        <SubmitButton className="btn-primary w-full">Start tracking</SubmitButton>
      </form>
    </main>
  );
}
