"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { COMPLETION_STATUSES, FAILURE_REASONS } from "@/lib/constants";
import { todayKey } from "@/lib/dates";
import { prisma } from "@/lib/db";

const logSchema = z.object({
  habitId: z.string().min(1),
  status: z.enum(COMPLETION_STATUSES),
  reason: z.string().optional(),
  reasonOther: z.string().max(120).optional(),
});

export type LogState = { error?: string };

export async function logHabit(_prev: LogState, formData: FormData): Promise<LogState> {
  const session = await requireSession();
  const parsed = logSchema.safeParse({
    habitId: String(formData.get("habitId") ?? ""),
    status: String(formData.get("status") ?? ""),
    reason: String(formData.get("reason") ?? "") || undefined,
    reasonOther: String(formData.get("reasonOther") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: "Could not save that check-in." };
  }

  const habit = await prisma.habit.findFirst({
    where: { id: parsed.data.habitId, userId: session.id, isActive: true },
  });
  if (!habit) return { error: "Habit not found." };

  if (parsed.data.status !== "completed") {
    const valid = FAILURE_REASONS.some((item) => item.id === parsed.data.reason);
    if (!valid) return { error: "Choose a reason so the coach can learn." };
  }

  const date = todayKey();
  await prisma.habitCompletion.upsert({
    where: { habitId_date: { habitId: habit.id, date } },
    create: {
      userId: session.id,
      habitId: habit.id,
      date,
      status: parsed.data.status,
      reason: parsed.data.status === "completed" ? null : parsed.data.reason,
      reasonOther: parsed.data.status === "completed" ? null : parsed.data.reasonOther,
      preferredTimeAtLog: habit.preferredTime,
    },
    update: {
      status: parsed.data.status,
      reason: parsed.data.status === "completed" ? null : parsed.data.reason,
      reasonOther: parsed.data.status === "completed" ? null : parsed.data.reasonOther,
      preferredTimeAtLog: habit.preferredTime,
      loggedAt: new Date(),
    },
  });

  revalidatePath("/today");
  revalidatePath("/insights");
  revalidatePath("/coach");
  return {};
}

export async function clearHabitLog(habitId: string) {
  const session = await requireSession();
  await prisma.habitCompletion.deleteMany({
    where: { habitId, userId: session.id, date: todayKey() },
  });
  revalidatePath("/today");
  revalidatePath("/insights");
  revalidatePath("/coach");
}
