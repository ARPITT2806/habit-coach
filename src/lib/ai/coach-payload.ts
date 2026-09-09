import { z } from "zod";

/**
 * Shared minimal coaching payload shapes. Kept in a plain (non-action)
 * module so both server actions can use them without importing each other —
 * server-action-to-server-action imports break the static-export build.
 */
const habitSchema = z.object({
  title: z.string().min(1).max(120),
  frequencyPerWeek: z.number().int().min(1).max(7),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  difficulty: z.string().max(20),
});

const completionSchema = z.object({
  habit: z.number().int().min(0).max(49),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().max(20),
});

export const minimalHabitsSchema = z.array(habitSchema).min(0).max(50);
export const minimalCompletionsSchema = z.array(completionSchema).max(2000);
