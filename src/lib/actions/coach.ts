"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { collectFacts, generateCoachCopy } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { applyPayload, buildRecommendations } from "@/lib/recommendations";

export async function refreshCoach() {
  const session = await requireSession();
  const [goals, habits, logs, checkIns] = await Promise.all([
    prisma.goal.findMany({ where: { userId: session.id } }),
    prisma.habit.findMany({
      where: { userId: session.id, isActive: true },
      include: { completions: true },
    }),
    prisma.habitCompletion.findMany({ where: { userId: session.id } }),
    prisma.checkIn.findMany({ where: { userId: session.id } }),
  ]);

  const facts = collectFacts({ goals, habits, logs, checkIns });
  const observation = await generateCoachCopy(session.id, facts);

  await prisma.aiInsight.create({
    data: {
      userId: session.id,
      kind: observation.kind,
      content: observation.content,
      evidence: JSON.stringify(observation.evidence),
    },
  });

  const drafts = buildRecommendations(habits, logs);
  for (const draft of drafts) {
    const existing = await prisma.aiRecommendation.findFirst({
      where: {
        userId: session.id,
        habitId: draft.habitId,
        type: draft.type,
        status: "pending",
      },
    });
    if (existing) continue;
    await prisma.aiRecommendation.create({
      data: {
        userId: session.id,
        habitId: draft.habitId,
        type: draft.type,
        title: draft.title,
        rationale: draft.rationale,
        evidence: JSON.stringify(draft.evidence),
        payload: JSON.stringify(draft.payload),
      },
    });
  }

  revalidatePath("/coach");
  revalidatePath("/today");
  return { ok: true as const };
}

export async function resolveRecommendation(id: string, accept: boolean) {
  const session = await requireSession();
  const recommendation = await prisma.aiRecommendation.findFirst({
    where: { id, userId: session.id, status: "pending" },
  });
  if (!recommendation) return { error: "Recommendation not found." };

  if (accept && recommendation.habitId) {
    const habit = await prisma.habit.findFirst({
      where: { id: recommendation.habitId, userId: session.id },
    });
    if (habit) {
      let payload: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(recommendation.payload);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return { error: "Recommendation not found." };
        }
        payload = parsed as Record<string, unknown>;
      } catch {
        return { error: "Recommendation not found." };
      }
      await prisma.habit.update({
        where: { id: habit.id },
        data: applyPayload(habit, payload),
      });
    }
  }

  await prisma.aiRecommendation.update({
    where: { id: recommendation.id },
    data: {
      status: accept ? "accepted" : "dismissed",
      resolvedAt: new Date(),
    },
  });

  revalidatePath("/coach");
  revalidatePath("/today");
  revalidatePath("/insights");
  return { ok: true as const };
}
