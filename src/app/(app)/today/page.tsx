import { redirect } from "next/navigation";
import { AddHabit } from "@/components/add-habit";
import { CheckInCard } from "@/components/check-in";
import { HabitRow } from "@/components/habit-row";
import { EmptyState } from "@/components/states";
import { overallConsistency } from "@/lib/behavior";
import { greeting, formatTime } from "@/lib/dates";
import { requireSession } from "@/lib/auth";
import { loadUserData } from "@/lib/queries";

export default async function TodayPage() {
  const session = await requireSession();
  const data = await loadUserData(session.id);
  if (!data.user) redirect("/login");

  const week = overallConsistency(data.habits, 7);
  const todayLogs = new Map(
    data.todayHabits.flatMap((habit) => {
      const log = habit.completions.find((item) => item.date === data.date);
      return log ? [[habit.id, log] as const] : [];
    }),
  );

  return (
    <main>
      <p className="text-sm text-muted">{greeting()}</p>
      <h1 className="mt-1 font-serif text-4xl">Today</h1>
      <section className="mt-8" aria-labelledby="habits-heading">
        <div className="flex items-end justify-between">
          <h2 id="habits-heading" className="text-sm uppercase tracking-[0.18em] text-muted">
            Today’s habits
          </h2>
          <p className="text-sm text-muted">Weekly consistency {week.rate}%</p>
        </div>
        <div className="mt-4 space-y-3">
          {data.todayHabits.length === 0 ? (
            <EmptyState
              title="Nothing scheduled today"
              body="Rest is part of the plan. You can still add a habit if you want one."
            />
          ) : (
            data.todayHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habitId={habit.id}
                title={habit.title}
                preferredTime={formatTime(habit.preferredTime)}
                log={todayLogs.get(habit.id) ?? null}
              />
            ))
          )}
        </div>
      </section>
      <section className="mt-8" aria-labelledby="checkin-heading">
        <h2 id="checkin-heading" className="sr-only">
          Daily check-in
        </h2>
        <CheckInCard existing={data.todayCheckIn} />
      </section>
      <section className="mt-6">
        <AddHabit />
      </section>
    </main>
  );
}
