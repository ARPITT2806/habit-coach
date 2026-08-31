"use client";

import { useActionState, useState } from "react";
import { logHabit } from "@/lib/actions/habits";
import { FAILURE_REASONS } from "@/lib/constants";
import { ErrorText } from "./states";
import { SubmitButton } from "./submit-button";

type Log = {
  status: string;
  reason: string | null;
} | null;

export function HabitRow({
  habitId,
  title,
  preferredTime,
  log,
}: {
  habitId: string;
  title: string;
  preferredTime: string;
  log: Log;
}) {
  const [intent, setIntent] = useState<"skipped" | "failed" | null>(null);
  const [state, action] = useActionState(logHabit, {});

  if (log) {
    const label =
      log.status === "completed" ? "Completed" : log.status === "skipped" ? "Skipped" : "Missed";
    return (
      <article className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-paper px-4 py-4">
        <div>
          <p className="text-base text-ink">{title}</p>
          <p className="mt-1 text-sm text-muted">
            {label}
            {log.reason ? ` · ${FAILURE_REASONS.find((r) => r.id === log.reason)?.label}` : ""}
          </p>
        </div>
        <span className="text-sm text-muted">{preferredTime}</span>
      </article>
    );
  }

  if (intent) {
    return (
      <form action={action} className="rounded-3xl border border-line bg-paper p-4">
        <input type="hidden" name="habitId" value={habitId} />
        <input type="hidden" name="status" value={intent} />
        <p className="text-base text-ink">Why didn’t you do {title}?</p>
        <fieldset className="mt-3 grid grid-cols-2 gap-2">
          <legend className="sr-only">Reason</legend>
          {FAILURE_REASONS.map((reason) => (
            <label
              key={reason.id}
              className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-sand"
            >
              <input type="radio" name="reason" value={reason.id} required className="accent-ink" />
              {reason.label}
            </label>
          ))}
        </fieldset>
        <label className="mt-3 block text-sm text-muted">
          Other detail
          <input
            name="reasonOther"
            className="mt-1 w-full rounded-2xl border border-line bg-transparent px-3 py-2 text-ink"
            placeholder="Optional"
          />
        </label>
        <ErrorText message={state.error} />
        <div className="mt-4 flex gap-2">
          <SubmitButton className="btn-primary flex-1">Save</SubmitButton>
          <button type="button" className="btn-ghost" onClick={() => setIntent(null)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="rounded-3xl border border-line bg-paper px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base text-ink">{title}</p>
          <p className="mt-1 text-sm text-muted">Preferred {preferredTime}</p>
        </div>
      </div>
      <form action={action} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="habitId" value={habitId} />
        <input type="hidden" name="status" value="completed" />
        <SubmitButton className="btn-primary">Completed</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setIntent("skipped")}>
          Skipped
        </button>
        <button type="button" className="btn-ghost" onClick={() => setIntent("failed")}>
          Missed
        </button>
      </form>
      <ErrorText message={state.error} />
    </article>
  );
}
