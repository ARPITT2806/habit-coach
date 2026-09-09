import fs from "node:fs";
for (const l of fs.readFileSync("./.env", "utf8").split("\n")) {
  const m = l.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g, "").trim();
}
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
try {
  const users = await p.$queryRaw`SELECT id, email, "emailVerified" IS NOT NULL AS verified FROM "User" ORDER BY email`;
  console.log("USERS:", JSON.stringify(users));
  const counts = await p.$queryRaw`SELECT 
    (SELECT count(*)::int FROM "User") AS users,
    (SELECT count(*)::int FROM "Habit") AS habits,
    (SELECT count(*)::int FROM "HabitCompletion") AS completions`;
  console.log("COUNTS:", JSON.stringify(counts[0]));
  const ram = await p.$queryRaw`SELECT id, email, "emailVerified" IS NOT NULL AS verified FROM "User" WHERE email='ramrakhyaniarpit@gmail.com'`;
  console.log("RAM:", JSON.stringify(ram));
} finally {
  await p.$disconnect();
}
