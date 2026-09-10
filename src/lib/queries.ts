import { parseDaysOfWeek } from "./constants";
import { todayKey, weekdayFromKey } from "./dates";
import { prisma } from "./db";
import { readSessionToken, SESSION_COOKIE_NAME } from "./auth-token";

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

/* ---------- Read-only web data layer ---------- */

/**
 * Minimal web payload. Shapes intentionally mirror the LocalHabit /
 * LocalCompletion / LocalGoal / LocalCheckIn / LocalUser field sets so web
 * pages can reuse the existing UI logic unchanged. Never includes secrets
 * (password hashes, tokens) or AI internals.
 */
export type WebTodayHabit = {
  id: string;
  userId: string;
  goalId: string | null;
  title: string;
  why: string | null;
  frequencyPerWeek: number;
  daysOfWeek: string;
  preferredTime: string;
  difficulty: string;
  targetDurationMin: number | null;
  targetQuantity: number | null;
  unit: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebTodayCompletion = {
  id: string;
  userId: string;
  habitId: string;
  date: string;
  status: string;
  reason: string | null;
  reasonOther: string | null;
  preferredTimeAtLog: string | null;
  loggedAt: string;
  createdAt: string;
};

export type WebTodayGoal = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type WebTodayCheckIn = {
  id: string;
  userId: string;
  date: string;
  mood: number;
  blocker: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebTodayUser = {
  id: string;
  email: string;
  name: string | null;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebTodayPayload = {
  user: WebTodayUser;
  goals: WebTodayGoal[];
  habits: WebTodayHabit[];
  completions: WebTodayCompletion[];
  checkIns: WebTodayCheckIn[];
  date: string;
};

/** History window served to web clients (covers coach + UI ranges with margin). */
export const WEB_HISTORY_DAYS = 120;
export const WEB_CHECKIN_LIMIT = 60;

function iso(value: Date): string {
  return value.toISOString();
}

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function loadTodayPayload(userId: string): Promise<WebTodayPayload | null> {
  const [user, goals, habits, checkIns] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        onboardedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.habit.findMany({
      where: { userId, isActive: true },
      include: {
        completions: {
          where: { date: { gte: dateDaysAgo(WEB_HISTORY_DAYS) } },
          orderBy: { date: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.checkIn.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: WEB_CHECKIN_LIMIT,
    }),
  ]);

  if (!user) return null;

  const completions: WebTodayCompletion[] = [];
  const shapedHabits: WebTodayHabit[] = habits.map((habit) => {
    for (const log of habit.completions) {
      completions.push({
        id: log.id,
        userId: log.userId,
        habitId: log.habitId,
        date: log.date,
        status: log.status,
        reason: log.reason,
        reasonOther: log.reasonOther,
        preferredTimeAtLog: log.preferredTimeAtLog,
        loggedAt: iso(log.loggedAt),
        createdAt: iso(log.createdAt),
      });
    }
    return {
      id: habit.id,
      userId: habit.userId,
      goalId: habit.goalId,
      title: habit.title,
      why: habit.why,
      frequencyPerWeek: habit.frequencyPerWeek,
      daysOfWeek: habit.daysOfWeek,
      preferredTime: habit.preferredTime,
      difficulty: habit.difficulty,
      targetDurationMin: habit.targetDurationMin,
      targetQuantity: habit.targetQuantity,
      unit: habit.unit,
      isActive: habit.isActive,
      createdAt: iso(habit.createdAt),
      updatedAt: iso(habit.updatedAt),
    };
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      onboardedAt: user.onboardedAt ? iso(user.onboardedAt) : null,
      createdAt: iso(user.createdAt),
      updatedAt: iso(user.updatedAt),
    },
    goals: goals.map((goal) => ({
      id: goal.id,
      userId: goal.userId,
      title: goal.title,
      createdAt: iso(goal.createdAt),
      updatedAt: iso(goal.updatedAt),
    })),
    habits: shapedHabits,
    completions,
    checkIns: checkIns.map((checkIn) => ({
      id: checkIn.id,
      userId: checkIn.userId,
      date: checkIn.date,
      mood: checkIn.mood,
      blocker: checkIn.blocker,
      createdAt: iso(checkIn.createdAt),
      updatedAt: iso(checkIn.updatedAt),
    })),
    date: todayKey(),
  };
}

/** Extract the session JWT from a raw Cookie header (no next/* dependency). */
export function parseSessionCookie(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== SESSION_COOKIE_NAME) continue;
    const raw = part.slice(index + 1).trim();
    const unquoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
      ? raw.slice(1, -1)
      : raw;
    if (!unquoted) return null;
    try {
      return decodeURIComponent(unquoted);
    } catch {
      return unquoted;
    }
  }
  return null;
}

export type TodayDeps = {
  verifyToken: (token: string) => Promise<{ id: string; email: string } | null>;
  load: (userId: string) => Promise<WebTodayPayload | null>;
};

export type TodayResult =
  | { ok: true; data: WebTodayPayload }
  | { ok: false; code: "UNAUTHORIZED" }
  | { ok: false; code: "UPSTREAM_ERROR" };

/**
 * Authenticated read entry point for web clients. Identity comes ONLY from
 * the session cookie — there is no userId parameter to forge, so User A can
 * never request User B's data through this path.
 */
export async function getTodayForSession(
  cookieHeader: string | null,
  deps: TodayDeps = { verifyToken: readSessionToken, load: loadTodayPayload },
): Promise<TodayResult> {
  const token = parseSessionCookie(cookieHeader);
  if (!token) return { ok: false, code: "UNAUTHORIZED" };
  const session = await deps.verifyToken(token).catch(() => null);
  if (!session) return { ok: false, code: "UNAUTHORIZED" };
  try {
    const data = await deps.load(session.id);
    if (!data) return { ok: false, code: "UNAUTHORIZED" };
    return { ok: true, data };
  } catch {
    return { ok: false, code: "UPSTREAM_ERROR" };
  }
}
