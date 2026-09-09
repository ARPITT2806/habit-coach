import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const l of fs.readFileSync(".env.production", "utf8").split("\n")) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}

const p = new PrismaClient();

async function main() {
  try {
    const user = await p.user.findUnique({
      where: { email: "ramrakhyaniarpit@gmail.com" },
      select: { 
        id: true, 
        email: true, 
        provider: true,
        emailVerified: true,
        _count: {
          select: {
            habits: true,
            completions: true,
            checkIns: true,
            goals: true,
            aiInsights: true,
            aiRecommendations: true,
            coachUsage: true
          }
        }
      }
    });

    if (!user) {
      console.log("TARGET USER NOT FOUND IN PRODUCTION DATABASE");
      return;
    }

    console.log("TARGET USER FOUND:");
    console.log(`  Email: ${user.email}`);
    console.log(`  Provider: ${user.provider}`);
    console.log(`  Verified: ${user.emailVerified ? 'yes' : 'no'}`);
    console.log(`  Habits: ${user._count.habits}`);
    console.log(`  Completions: ${user._count.completions}`);
    console.log(`  Check-ins: ${user._count.checkIns}`);
    console.log(`  Goals: ${user._count.goals}`);
    console.log(`  AI Insights: ${user._count.aiInsights}`);
    console.log(`  AI Recommendations: ${user._count.aiRecommendations}`);
    console.log(`  Coach Usage: ${user._count.coachUsage}`);

    console.log("\nProceeding with deletion...");

    await p.$transaction(async (tx) => {
      await tx.coachUsage.deleteMany({ where: { userId: user.id } });
      await tx.aiRecommendation.deleteMany({ where: { userId: user.id } });
      await tx.aiInsight.deleteMany({ where: { userId: user.id } });
      await tx.checkIn.deleteMany({ where: { userId: user.id } });
      await tx.goal.deleteMany({ where: { userId: user.id } });
      await tx.habitCompletion.deleteMany({ where: { userId: user.id } });
      await tx.habit.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });

    console.log("\nDeletion completed. Verifying...");

    const deleted = await p.user.findUnique({ where: { email: "ramrakhyaniarpit@gmail.com" } });
    if (deleted) {
      console.log("ERROR: User still exists after deletion!");
    } else {
      console.log("User successfully deleted.");
    }

    const remainingHabits = await p.habit.count({ where: { userId: user.id } });
    const remainingCompletions = await p.habitCompletion.count({ where: { userId: user.id } });
    const remainingCoachUsage = await p.coachUsage.count({ where: { userId: user.id } });
    
    console.log(`Remaining habits: ${remainingHabits}`);
    console.log(`Remaining completions: ${remainingCompletions}`);
    console.log(`Remaining coach usage: ${remainingCoachUsage}`);

    const demo = await p.user.findUnique({ where: { email: "demo@habitflow.app" } });
    console.log(`Demo user exists: ${!!demo}`);

    const totalUsers = await p.user.count();
    console.log(`Total users remaining: ${totalUsers}`);

  } catch (error) {
    console.error("ERROR:", error.message);
  } finally {
    await p.$disconnect();
  }
}

main();
