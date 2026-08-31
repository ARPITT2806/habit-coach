"use client";

import { useTransition } from "react";
import { resolveRecommendation } from "@/lib/actions/coach";

export function RecommendationCard({
  id,
  title,
  rationale,
}: {
  id: string;
  title: string;
  rationale: string;
}) {
  const [pending, start] = useTransition();

  return (
    <article className="rounded-3xl border border-line bg-paper p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Recommendation</p>
      <h2 className="mt-2 font-serif text-2xl text-ink">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{rationale}</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={pending}
          onClick={() => start(() => { void resolveRecommendation(id, true); })}
        >
          Accept change
        </button>
        <button
          type="button"
          className="btn-ghost flex-1"
          disabled={pending}
          onClick={() => start(() => { void resolveRecommendation(id, false); })}
        >
          Keep current
        </button>
      </div>
    </article>
  );
}
