import { getLocalDatabase } from "./database";

const LOCAL_USER_ID = "local-user";

export type LocalUser = {
  id: string;
  email: string;
  name: string | null;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getLocalUser(): Promise<LocalUser> {
  const db = await getLocalDatabase();

  const result = await db.query(
    `
      SELECT
        id,
        email,
        name,
        onboarded_at AS onboardedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [LOCAL_USER_ID],
  );

  const existing = result.values?.[0] as LocalUser | undefined;

  if (existing) {
    return existing;
  }

  const timestamp = new Date().toISOString();

  const user: LocalUser = {
    id: LOCAL_USER_ID,
    email: "local@habitflow.app",
    name: null,
    onboardedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.run(
    `
      INSERT INTO users (
        id,
        email,
        name,
        onboarded_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      user.id,
      user.email,
      user.name,
      user.onboardedAt,
      user.createdAt,
      user.updatedAt,
    ],
  );

  return user;
}

export async function markLocalUserOnboarded(): Promise<void> {
  const db = await getLocalDatabase();

  const timestamp = new Date().toISOString();

  await db.run(
    `
      UPDATE users
      SET onboarded_at = ?, updated_at = ?
      WHERE id = ?
    `,
    [timestamp, timestamp, LOCAL_USER_ID],
  );
}
