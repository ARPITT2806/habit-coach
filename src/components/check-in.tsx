"use client";

import { useActionState } from "react";
import { submitCheckIn } from "@/lib/actions/checkin";
import { ErrorText } from "./states";
import { SubmitButton } from "./submit-button";

export function CheckInCard({
  existing,
}: {
  existing: { mood: number; blocker: string | null } | null;
}) {
  const [state, action] = useActionState(submitCheckIn, {});

  return (
    <form action={action} className="rounded-3xl border border-line bg-paper p-5">
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
              defaultChecked={existing?.mood === value}
              required
              className="sr-only"
            />
            {value}
          </label>
        ))}
      </fieldset>
      <label className="mt-4 block text-sm text-muted">
        What got in your way today?
        <input
          name="blocker"
          defaultValue={existing?.blocker ?? ""}
          className="mt-2 w-full rounded-2xl border border-line bg-transparent px-3 py-3 text-ink"
          placeholder="Optional"
        />
      </label>
      <div className="mt-4">
        <SubmitButton className="btn-primary w-full">
          {existing ? "Update check-in" : "Save check-in"}
        </SubmitButton>
      </div>
      {state.ok ? <p className="mt-3 text-sm text-muted">Saved.</p> : null}
      <ErrorText message={state.error} />
    </form>
  );
}
