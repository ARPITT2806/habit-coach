"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { todayKey } from "@/lib/dates";
import { prisma } from "@/lib/db";

const schema = z.object({
  mood: z.coerce.number().int().min(1).max(5),
  blocker: z.string().max(160).optional(),
});

export type CheckInState = { error?: string; ok?: boolean };

export async function submitCheckIn(
  _prev: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const session = await requireSession();
  const parsed = schema.safeParse({
    mood: formData.get("mood"),
    blocker: String(formData.get("blocker") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: "Choose a rating from 1 to 5." };
  }

  const date = todayKey();
  await prisma.checkIn.upsert({
    where: { userId_date: { userId: session.id, date } },
    create: {
      userId: session.id,
      date,
      mood: parsed.data.mood,
      blocker: parsed.data.blocker,
    },
    update: {
      mood: parsed.data.mood,
      blocker: parsed.data.blocker,
    },
  });

  revalidatePath("/today");
  revalidatePath("/insights");
  revalidatePath("/coach");
  return { ok: true };
}
