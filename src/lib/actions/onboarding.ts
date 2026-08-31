"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { defaultDaysForFrequency } from "@/lib/constants";
import { prisma } from "@/lib/db";

const onboardingSchema = z.object({
  goal: z.string().min(2).max(80),
  habit: z.string().min(2).max(80),
  why: z.string().min(2).max(200),
  frequencyPerWeek: z.coerce.number().int().min(1).max(7),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type OnboardingState = { error?: string };

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireSession();
  const parsed = onboardingSchema.safeParse({
    goal: String(formData.get("goal") ?? "").trim(),
    habit: String(formData.get("habit") ?? "").trim(),
    why: String(formData.get("why") ?? "").trim(),
    frequencyPerWeek: formData.get("frequencyPerWeek"),
    preferredTime: String(formData.get("preferredTime") ?? ""),
    difficulty: String(formData.get("difficulty") ?? ""),
  });

  if (!parsed.success) {
    return { error: "Please complete each question before continuing." };
  }

  await prisma.$transaction(async (tx) => {
    const goal = await tx.goal.create({
      data: { userId: session.id, title: parsed.data.goal },
    });
    await tx.habit.create({
      data: {
        userId: session.id,
        goalId: goal.id,
        title: parsed.data.habit,
        why: parsed.data.why,
        frequencyPerWeek: parsed.data.frequencyPerWeek,
        daysOfWeek: JSON.stringify(defaultDaysForFrequency(parsed.data.frequencyPerWeek)),
        preferredTime: parsed.data.preferredTime,
        difficulty: parsed.data.difficulty,
      },
    });
    await tx.user.update({
      where: { id: session.id },
      data: { onboardedAt: new Date() },
    });
  });

  redirect("/today");
}

const habitSchema = z.object({
  title: z.string().min(2).max(80),
  why: z.string().max(200).optional(),
  goalTitle: z.string().max(80).optional(),
  frequencyPerWeek: z.coerce.number().int().min(1).max(7),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type HabitFormState = { error?: string; ok?: boolean };

export async function createHabit(
  _prev: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const session = await requireSession();
  const parsed = habitSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    why: String(formData.get("why") ?? "").trim() || undefined,
    goalTitle: String(formData.get("goalTitle") ?? "").trim() || undefined,
    frequencyPerWeek: formData.get("frequencyPerWeek"),
    preferredTime: String(formData.get("preferredTime") ?? ""),
    difficulty: String(formData.get("difficulty") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Check the habit details and try again." };
  }

  let goalId: string | undefined;
  if (parsed.data.goalTitle) {
    const goal = await prisma.goal.create({
      data: { userId: session.id, title: parsed.data.goalTitle },
    });
    goalId = goal.id;
  } else {
    const existing = await prisma.goal.findFirst({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
    });
    goalId = existing?.id;
  }

  await prisma.habit.create({
    data: {
      userId: session.id,
      goalId,
      title: parsed.data.title,
      why: parsed.data.why,
      frequencyPerWeek: parsed.data.frequencyPerWeek,
      daysOfWeek: JSON.stringify(defaultDaysForFrequency(parsed.data.frequencyPerWeek)),
      preferredTime: parsed.data.preferredTime,
      difficulty: parsed.data.difficulty,
    },
  });

  revalidatePath("/today");
  revalidatePath("/insights");
  revalidatePath("/coach");
  return { ok: true };
}
