import { redirect } from "next/navigation";
import { EmptyState } from "@/components/states";
import {
  habitPerformance,
  mostCommonFailureReason,
  overallConsistency,
  recentTrend,
  timeBucketPerformance,
  comparableTimeBuckets,
} from "@/lib/behavior";
import { requireSession } from "@/lib/auth";
import { loadUserData } from "@/lib/queries";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-line bg-paper px-4 py-5">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
    </div>
  );
}

export default async function InsightsPage() {
  const session = await requireSession();
  const data = await loadUserData(session.id);
  if (!data.user) redirect("/login");

  const logs = data.habits.flatMap((habit) => habit.completions);
  const days7 = overallConsistency(data.habits, 7);
  const days30 = overallConsistency(data.habits, 30);
  const performance = habitPerformance(data.habits).filter((item) => item.days30.scheduled > 0);
  const strongest = [...performance].sort((a, b) => b.days30.rate - a.days30.rate)[0];
  const weakest = [...performance].sort((a, b) => a.days30.rate - b.days30.rate)[0];
  const failure = mostCommonFailureReason(logs);
  const bestTime = [...comparableTimeBuckets(timeBucketPerformance(logs))].sort(
    (a, b) => b.rate - a.rate,
  )[0];
  const trend = recentTrend(data.habits);
  const latestInsight = data.insights[0];

  if (logs.length === 0) {
    return (
      <main>
        <h1 className="font-serif text-4xl">Your pattern</h1>
        <div className="mt-8">
          <EmptyState
            title="No pattern yet"
            body="Complete, skip, or miss a few habits. Insights stay empty until there is real behavior to measure."
          />
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1 className="font-serif text-4xl">Your pattern</h1>
      <p className="mt-2 text-sm text-muted">Only numbers from your own logs.</p>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <Stat label="7-day consistency" value={`${days7.rate}%`} />
        <Stat label="30-day consistency" value={`${days30.rate}%`} />
        <Stat
          label="Best time"
          value={bestTime ? `${bestTime.bucket}` : "Not enough data"}
        />
        <Stat label="Common miss" value={failure ? failure.label : "Not enough data"} />
      </div>
      <div className="mt-3 space-y-3">
        <Stat
          label="Strongest habit"
          value={
            strongest
              ? `${strongest.habit.title} — ${strongest.days30.rate}%`
              : "Not enough data"
          }
        />
        <Stat
          label="Weakest habit"
          value={
            weakest ? `${weakest.habit.title} — ${weakest.days30.rate}%` : "Not enough data"
          }
        />
        <Stat
          label="Recent trend"
          value={
            trend
              ? trend.direction === "up"
                ? `Up to ${trend.recent}%`
                : trend.direction === "down"
                  ? `Down to ${trend.recent}%`
                  : `Steady at ${trend.recent}%`
              : "Need two weeks"
          }
        />
      </div>
      {latestInsight ? (
        <section className="mt-8 rounded-3xl border border-line bg-paper p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Latest coach note</p>
          <p className="mt-3 text-base leading-7 text-ink">{latestInsight.content}</p>
        </section>
      ) : null}
    </main>
  );
}
