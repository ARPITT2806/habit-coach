import { readSessionToken } from "@/lib/auth-token";
import { prisma } from "@/lib/db";
import { parseDaysOfWeek } from "@/lib/constants";
import type { CoachStore } from "@/lib/ai/coach-service";

/**
 * Production CoachStore backed by Postgres. Identity always resolves from the
 * verified session token; conversation rows are addressed by authenticated
 * userId only — no conversation id ever crosses the client boundary.
 */
export function prismaCoachStore(): CoachStore {
  return {
    verifyToken: (token) => readSessionToken(token),
    loadUser: (userId) =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, aiConsentAt: true },
      }),
    loadHabits: async (userId) => {
      const habits = await prisma.habit.findMany({
        where: { userId, isActive: true },
        select: {
          id: true,
          title: true,
          frequencyPerWeek: true,
          daysOfWeek: true,
          preferredTime: true,
          difficulty: true,
        },
      });
      return habits.map((habit) => ({
        id: habit.id,
        title: habit.title,
        frequencyPerWeek: habit.frequencyPerWeek,
        daysOfWeek: parseDaysOfWeek(habit.daysOfWeek),
        preferredTime: habit.preferredTime,
        difficulty: habit.difficulty,
      }));
    },
    loadCompletions: (userId) =>
      prisma.habitCompletion.findMany({
        where: { userId },
        select: { habitId: true, date: true, status: true },
      }),
    getUsage: async (userId, windowType, windowStart) => {
      const row = await prisma.coachUsage.findUnique({
        where: { userId_windowType_windowStart: { userId, windowType, windowStart } },
        select: { count: true },
      });
      return row?.count ?? 0;
    },
    addUsage: async (userId, windowType, windowStart) => {
      await prisma.coachUsage.upsert({
        where: { userId_windowType_windowStart: { userId, windowType, windowStart } },
        create: { userId, windowType, windowStart, count: 1 },
        update: { count: { increment: 1 } },
      });
    },
    ensureConversation: async (userId) => {
      const conversation = await prisma.coachConversation.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: { id: true },
      });
      return { id: conversation.id };
    },
    loadRecentMessages: async (conversationId, limit) => {
      const rows = await prisma.coachMessage.findMany({
        where: { conversationId },
        select: { role: true, content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: Math.max(1, Math.min(limit, 200)),
      });
      return rows.reverse().map((row) => ({
        role: row.role as "user" | "coach",
        content: row.content,
        createdAt: row.createdAt,
      }));
    },
    saveMessage: async (conversationId, role, content) => {
      await prisma.coachMessage.create({
        data: { conversationId, role, content },
      });
    },
  };
}
