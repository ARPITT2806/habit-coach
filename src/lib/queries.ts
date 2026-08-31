import { parseDaysOfWeek } from "@/lib/constants";
import { todayKey, weekdayFromKey } from "@/lib/dates";
import { prisma } from "@/lib/db";

export async function loadUserData(userId: string) {
  const [user, goals, habits, checkIns, insights, recommendations] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.habit.findMany({
      where: { userId, isActive: true },
      include: { completions: true, goal: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.checkIn.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.aiInsight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.aiRecommendation.findMany({
      where: { userId },
      include: { habit: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const date = todayKey();
  const weekday = weekdayFromKey(date);
  const todayHabits = habits.filter((habit) => parseDaysOfWeek(habit.daysOfWeek).includes(weekday));
  const todayCheckIn = checkIns.find((item) => item.date === date) ?? null;

  return {
    user,
    goals,
    habits,
    checkIns,
    insights,
    recommendations,
    todayHabits,
    todayCheckIn,
    date,
  };
}
