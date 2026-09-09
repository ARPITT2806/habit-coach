export type VoiceIntent =
  | { kind: "show_plan_today" }
  | { kind: "show_progress" }
  | { kind: "show_calories" }
  | { kind: "mark_complete"; habitName: string | null }
  | { kind: "mark_skipped"; habitName: string | null }
  | { kind: "set_reminder"; habitName: string; time: string }
  | { kind: "unknown" };

/**
 * Parses a free-form voice command into a structured intent.
 *
 * This is intentionally a local, offline parser: no network, no secrets.
 * A future OpenAI-backed provider can implement the same `VoiceIntentProvider`
 * shape and be swapped in without touching the rest of the voice UI.
 */
export interface VoiceIntentProvider {
  parse(input: string): VoiceIntent;
}

export class LocalVoiceIntentProvider implements VoiceIntentProvider {
  parse(raw: string): VoiceIntent {
    const input = normalize(raw);
    if (!input) return { kind: "unknown" };

    if (hasAny(input, ["calorie", "calories"])) {
      return { kind: "show_calories" };
    }

    if (hasAny(input, ["progress"])) {
      return { kind: "show_progress" };
    }

    if (
      hasAny(input, [
        "what is my workout",
        "what's my workout",
        "what is today",
        "today's habit",
        "todays habit",
        "what do i have today",
        "what's on today",
        "plan today",
        "today's plan",
      ])
    ) {
      return { kind: "show_plan_today" };
    }

    const reminder = parseReminder(input);
    if (reminder) {
      return { kind: "set_reminder", habitName: reminder.habit, time: reminder.time };
    }

    const completed = parseMark(input, ["complete", "completed", "done"]);
    if (completed) {
      return { kind: "mark_complete", habitName: completed };
    }

    const skipped = parseMark(input, ["skipped", "skip", "missed"]);
    if (skipped) {
      return { kind: "mark_skipped", habitName: skipped };
    }

    if (
      hasAny(input, [
        "what is my",
        "how am i doing",
        "how many",
        "what's next",
        "when is",
        "am i on track",
      ])
    ) {
      return { kind: "show_plan_today" };
    }

    return { kind: "unknown" };
  }
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\bi\b/g, "i ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(input: string, phrases: string[]): boolean {
  return phrases.some((phrase) => input.includes(phrase));
}

function parseReminder(input: string): { habit: string; time: string } | null {
  const match = input.match(/remind me (?:to|about)?\s*(.*?)\s*\bat\b\s*(.+)$/);
  if (!match) return null;

  const habit = cleanTitle(match[1]);
  const time = parseTimePhrase(match[2]);
  if (!habit || !time) return null;
  return { habit, time };
}

function parseMark(input: string, keywords: string[]): string | null {
  const keyword = keywords.find((item) => input.includes(item));
  if (!keyword) return null;

  // "didn't do the workout" / "missed workout" / "skipped workout"
  const before = input.slice(0, input.indexOf(keyword));

  let habit;
  const markMatch = before.match(/mark\s+(.*)$/);
  if (markMatch) {
    habit = markMatch[1].replace(/\s+(as|as done)$/, "");
  } else {
    const leadMatch = before.match(
      /(?:didn'?t\s+do|did not do|forgot|missed|skiped|log)\s+(?:the\s+|my\s+)?(.*)$/,
    );
    habit = leadMatch ? leadMatch[1].trim() : "";
  }

  habit = cleanTitle(habit);
  if (!habit) return null;
  return habit;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\b(complete|completed|done|skipped|skip|missed|workout|habit)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "7 pm", "19:00", "noon", "midnight", "7pm" -> "HH:MM" (24h). Returns null if unparseable. */
export function parseTimePhrase(raw: string): string | null {
  const term = raw.trim().toLowerCase();

  if (term === "noon") return "12:00";
  if (term === "midnight") return "00:00";

  const range = term.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!range) return null;

  let hour = Number(range[1]);
  const minute = range[2] ? Number(range[2]) : 0;
  const meridiem = range[3];

  if (hour < 1 || hour > 12) return null;
  if (Number.isNaN(minute) || minute < 0 || minute > 59) return null;

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 2) hour += 12; // assume PM for casual "7"

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}