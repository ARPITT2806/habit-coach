export const FAILURE_REASONS = [
  { id: "forgot", label: "Forgot" },
  { id: "too_tired", label: "Too tired" },
  { id: "no_time", label: "No time" },
  { id: "not_motivated", label: "Not motivated" },
  { id: "schedule_changed", label: "Schedule changed" },
  { id: "too_difficult", label: "Too difficult" },
  { id: "other", label: "Other" },
] as const;

export type FailureReasonId = (typeof FAILURE_REASONS)[number]["id"];

export const DIFFICULTIES = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
] as const;

export const COMPLETION_STATUSES = ["completed", "skipped", "failed"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MIN_EVENTS_FOR_PATTERN = 8;
export const MIN_BUCKET_FOR_COMPARE = 3;

export function defaultDaysForFrequency(frequencyPerWeek: number): number[] {
  const map: Record<number, number[]> = {
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return map[frequencyPerWeek] ?? [1, 2, 4, 5];
}

export function parseDaysOfWeek(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

export function reasonLabel(id: string | null | undefined): string {
  if (!id) return "Unknown";
  return FAILURE_REASONS.find((r) => r.id === id)?.label ?? id;
}
