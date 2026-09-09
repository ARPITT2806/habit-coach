import { getLocalDatabase } from "./database";

export type LocalHabit = {
  id: string;
  userId: string;
  goalId: string | null;
  title: string;
  why: string | null;
  consequence: string | null;
  isImportant: boolean;
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

export type LocalGoal = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalCompletion = {
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

export type LocalCheckIn = {
  id: string;
  userId: string;
  date: string;
  mood: number;
  blocker: string | null;
  createdAt: string;
  updatedAt: string;
};

function now(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

export async function getHabits(userId: string): Promise<LocalHabit[]> {
  const db = await getLocalDatabase();

  const result = await db.query(
    `
      SELECT
        id,
        user_id AS userId,
        goal_id AS goalId,
        title,
        why,
        consequence,
        is_important AS isImportant,
        frequency_per_week AS frequencyPerWeek,
        days_of_week AS daysOfWeek,
        preferred_time AS preferredTime,
        difficulty,
        target_duration_min AS targetDurationMin,
        target_quantity AS targetQuantity,
        unit,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM habits
      WHERE user_id = ? AND is_active = 1
      ORDER BY created_at ASC
    `,
    [userId],
  );

  return (result.values ?? []).map((row) => ({
    ...(row as Omit<LocalHabit, "isActive" | "isImportant"> & {
      isActive: number;
      isImportant: number;
    }),
    isActive: Boolean((row as { isActive: number }).isActive),
    isImportant: Boolean((row as { isImportant: number }).isImportant),
  }));
}

export async function getGoals(userId: string): Promise<LocalGoal[]> {
  const db = await getLocalDatabase();

  const result = await db.query(
    `
      SELECT
        id,
        user_id AS userId,
        title,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM goals
      WHERE user_id = ?
      ORDER BY created_at ASC
    `,
    [userId],
  );

  return (result.values ?? []) as LocalGoal[];
}

export async function createGoal(
  userId: string,
  title: string,
): Promise<LocalGoal> {
  const db = await getLocalDatabase();
  const timestamp = now();

  const goal: LocalGoal = {
    id: id(),
    userId,
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.run(
    `
      INSERT INTO goals (
        id,
        user_id,
        title,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      goal.id,
      goal.userId,
      goal.title,
      goal.createdAt,
      goal.updatedAt,
    ],
  );

  return goal;
}

export async function createHabit(input: {
  userId: string;
  goalId?: string | null;
  title: string;
  why?: string | null;
  consequence?: string | null;
  isImportant?: boolean;
  frequencyPerWeek: number;
  daysOfWeek: string;
  preferredTime: string;
  difficulty: string;
  targetDurationMin?: number | null;
  targetQuantity?: number | null;
  unit?: string | null;
}): Promise<LocalHabit> {
  const db = await getLocalDatabase();
  const timestamp = now();

  const habit: LocalHabit = {
    id: id(),
    userId: input.userId,
    goalId: input.goalId ?? null,
    title: input.title,
    why: input.why ?? null,
    consequence: input.consequence ?? null,
    isImportant: input.isImportant ?? false,
    frequencyPerWeek: input.frequencyPerWeek,
    daysOfWeek: input.daysOfWeek,
    preferredTime: input.preferredTime,
    difficulty: input.difficulty,
    targetDurationMin: input.targetDurationMin ?? null,
    targetQuantity: input.targetQuantity ?? null,
    unit: input.unit ?? null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.run(
    `
      INSERT INTO habits (
        id,
        user_id,
        goal_id,
        title,
        why,
        consequence,
        is_important,
        frequency_per_week,
        days_of_week,
        preferred_time,
        difficulty,
        target_duration_min,
        target_quantity,
        unit,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      habit.id,
      habit.userId,
      habit.goalId,
      habit.title,
      habit.why,
      habit.consequence,
      habit.isImportant ? 1 : 0,
      habit.frequencyPerWeek,
      habit.daysOfWeek,
      habit.preferredTime,
      habit.difficulty,
      habit.targetDurationMin,
      habit.targetQuantity,
      habit.unit,
      1,
      habit.createdAt,
      habit.updatedAt,
    ],
  );

  return habit;
}

export async function ensureGoalForHabit(
  userId: string,
  goalTitle: string,
): Promise<string | null> {
  const trimmed = goalTitle.trim();
  if (trimmed) {
    const goal = await createGoal(userId, trimmed);
    return goal.id;
  }
  const goals = await getGoals(userId);
  return goals.at(-1)?.id ?? null;
}

export async function updateHabit(
  userId: string,
  habitId: string,
  patch: {
    title: string;
    why?: string | null;
    consequence?: string | null;
    isImportant?: boolean;
    frequencyPerWeek: number;
    daysOfWeek: string;
    preferredTime: string;
    difficulty: string;
  },
): Promise<void> {
  const db = await getLocalDatabase();
  const timestamp = now();

  await db.run(
    `
      UPDATE habits
      SET
        title = ?,
        why = ?,
        consequence = ?,
        is_important = ?,
        frequency_per_week = ?,
        days_of_week = ?,
        preferred_time = ?,
        difficulty = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ? AND is_active = 1
    `,
    [
      patch.title,
      patch.why ?? null,
      patch.consequence ?? null,
      patch.isImportant ? 1 : 0,
      patch.frequencyPerWeek,
      patch.daysOfWeek,
      patch.preferredTime,
      patch.difficulty,
      timestamp,
      habitId,
      userId,
    ],
  );
}

export async function updateHabitPreferredTime(
  userId: string,
  habitId: string,
  preferredTime: string,
): Promise<void> {
  const db = await getLocalDatabase();
  const timestamp = now();

  await db.run(
    `
      UPDATE habits
      SET preferred_time = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND is_active = 1
    `,
    [preferredTime, timestamp, habitId, userId],
  );
}

export async function deleteHabit(userId: string, habitId: string): Promise<void> {
  const db = await getLocalDatabase();

  // First, delete any AI recommendations associated with this habit
  await db.run(
    `DELETE FROM ai_recommendations WHERE user_id = ? AND habit_id = ?`,
    [userId, habitId],
  );

  // Delete completions explicitly: foreign-key enforcement is not
  // guaranteed on every WebView SQLite build, so never rely on cascade.
  await db.run(
    `DELETE FROM habit_completions WHERE user_id = ? AND habit_id = ?`,
    [userId, habitId],
  );

  // Delete the habit itself (scoped to the owner: never another user's row).
  await db.run(
    `DELETE FROM habits WHERE id = ? AND user_id = ?`,
    [habitId, userId],
  );
}

export async function logHabit(input: {
  userId: string;
  habitId: string;
  date: string;
  status: string;
  reason?: string | null;
  reasonOther?: string | null;
}): Promise<void> {
  const db = await getLocalDatabase();

  const habitResult = await db.query(
    `
      SELECT
        id,
        preferred_time AS preferredTime
      FROM habits
      WHERE id = ? AND user_id = ? AND is_active = 1
      LIMIT 1
    `,
    [input.habitId, input.userId],
  );

  const habit = habitResult.values?.[0] as
    | { id: string; preferredTime: string }
    | undefined;

  if (!habit) {
    throw new Error("Habit not found.");
  }

  const timestamp = now();

  await db.run(
    `
      INSERT INTO habit_completions (
        id,
        user_id,
        habit_id,
        date,
        status,
        reason,
        reason_other,
        preferred_time_at_log,
        logged_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(habit_id, date)
      DO UPDATE SET
        status = excluded.status,
        reason = excluded.reason,
        reason_other = excluded.reason_other,
        preferred_time_at_log = excluded.preferred_time_at_log,
        logged_at = excluded.logged_at
    `,
    [
      id(),
      input.userId,
      input.habitId,
      input.date,
      input.status,
      input.status === "completed" ? null : input.reason ?? null,
      input.status === "completed" ? null : input.reasonOther ?? null,
      habit.preferredTime,
      timestamp,
      timestamp,
    ],
  );
}

export async function clearHabitLog(
  userId: string,
  habitId: string,
  date: string,
): Promise<void> {
  const db = await getLocalDatabase();

  await db.run(
    `
      DELETE FROM habit_completions
      WHERE habit_id = ? AND user_id = ? AND date = ?
    `,
    [habitId, userId, date],
  );
}

export async function getCompletions(
  userId: string,
): Promise<LocalCompletion[]> {
  const db = await getLocalDatabase();

  const result = await db.query(
    `
      SELECT
        id,
        user_id AS userId,
        habit_id AS habitId,
        date,
        status,
        reason,
        reason_other AS reasonOther,
        preferred_time_at_log AS preferredTimeAtLog,
        logged_at AS loggedAt,
        created_at AS createdAt
      FROM habit_completions
      WHERE user_id = ?
      ORDER BY date DESC
    `,
    [userId],
  );

  return (result.values ?? []) as LocalCompletion[];
}

export async function saveCheckIn(input: {
  userId: string;
  date: string;
  mood: number;
  blocker?: string | null;
}): Promise<void> {
  const db = await getLocalDatabase();
  const timestamp = now();

  await db.run(
    `
      INSERT INTO check_ins (
        id,
        user_id,
        date,
        mood,
        blocker,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date)
      DO UPDATE SET
        mood = excluded.mood,
        blocker = excluded.blocker,
        updated_at = excluded.updated_at
    `,
    [
      id(),
      input.userId,
      input.date,
      input.mood,
      input.blocker ?? null,
      timestamp,
      timestamp,
    ],
  );
}

export async function getCheckIns(
  userId: string,
): Promise<LocalCheckIn[]> {
  const db = await getLocalDatabase();

  const result = await db.query(
    `
      SELECT
        id,
        user_id AS userId,
        date,
        mood,
        blocker,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM check_ins
      WHERE user_id = ?
      ORDER BY date DESC
    `,
    [userId],
  );

  return (result.values ?? []) as LocalCheckIn[];
}
