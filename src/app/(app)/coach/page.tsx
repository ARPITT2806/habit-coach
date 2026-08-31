import { redirect } from "next/navigation";
import { AnalyzeButton } from "@/components/analyze-button";
import { RecommendationCard } from "@/components/recommendation-card";
import { EmptyState } from "@/components/states";
import { hasEnoughPatternData } from "@/lib/behavior";
import { requireSession } from "@/lib/auth";
import { loadUserData } from "@/lib/queries";

export default async function CoachPage() {
  const session = await requireSession();
  const data = await loadUserData(session.id);
  if (!data.user) redirect("/login");

  const logs = data.habits.flatMap((habit) => habit.completions);
  const pending = data.recommendations.filter((item) => item.status === "pending");
  const latest = data.insights[0];
  const enough = hasEnoughPatternData(logs);

  return (
    <main>
      <h1 className="font-serif text-4xl">Coach</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Observations are generated from your completions, skips, misses, reasons, times, and check-ins.
        Nothing is invented.
      </p>
      <div className="mt-8">
        <AnalyzeButton />
      </div>
      <section className="mt-6">
        {latest ? (
          <article className="rounded-3xl border border-line bg-paper p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              {latest.kind === "insufficient_data" ? "Not enough data" : "Observation"}
            </p>
            <p className="mt-3 font-serif text-2xl leading-snug text-ink">{latest.content}</p>
          </article>
        ) : (
          <EmptyState
            title={enough ? "Ready when you are" : "Keep tracking"}
            body={
              enough
                ? "Analyze to turn your logs into a specific observation and optional change."
                : "I don't have enough data yet to identify a pattern. Keep tracking for a few more days."
            }
          />
        )}
      </section>
      <section className="mt-8 space-y-3" aria-labelledby="rec-heading">
        <h2 id="rec-heading" className="text-sm uppercase tracking-[0.18em] text-muted">
          Suggested changes
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            No pending changes. North will only suggest a move when your data shows a clear gap — and you
            always confirm it.
          </p>
        ) : (
          pending.map((item) => (
            <RecommendationCard
              key={item.id}
              id={item.id}
              title={item.title}
              rationale={item.rationale}
            />
          ))
        )}
      </section>
    </main>
  );
}
