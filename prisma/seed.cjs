const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

function keyFromOffset(daysAgo) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return { key: `${y}-${m}-${d}`, weekday: date.getDay() };
}

async function main() {
  const email = "demo@north.app";
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo",
      passwordHash: await bcrypt.hash("demo1234", 10),
      onboardedAt: new Date(),
    },
  });

  const goal = await prisma.goal.create({
    data: { userId: user.id, title: "Get healthier" },
  });

  const exercise = await prisma.habit.create({
    data: {
      userId: user.id,
      goalId: goal.id,
      title: "Exercise",
      why: "I want more energy.",
      frequencyPerWeek: 4,
      daysOfWeek: JSON.stringify([1, 2, 4, 5]),
      preferredTime: "07:00",
      difficulty: "medium",
    },
  });

  const read = await prisma.habit.create({
    data: {
      userId: user.id,
      goalId: goal.id,
      title: "Read 20 minutes",
      why: "I want a calmer mind.",
      frequencyPerWeek: 7,
      daysOfWeek: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
      preferredTime: "21:00",
      difficulty: "easy",
    },
  });

  const water = await prisma.habit.create({
    data: {
      userId: user.id,
      goalId: goal.id,
      title: "Drink 2L water",
      why: "I want to feel less tired.",
      frequencyPerWeek: 7,
      daysOfWeek: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
      preferredTime: "08:00",
      difficulty: "easy",
    },
  });

  for (let ago = 1; ago <= 16; ago += 1) {
    const { key, weekday } = keyFromOffset(ago);

    if ([1, 2, 4, 5].includes(weekday)) {
      const miss = ago === 3 || ago === 10;
      await prisma.habitCompletion.create({
        data: {
          userId: user.id,
          habitId: exercise.id,
          date: key,
          status: miss ? "failed" : "completed",
          reason: miss ? "too_tired" : null,
          preferredTimeAtLog: "07:00",
        },
      });
    }

    const readFail = ago % 3 !== 0;
    await prisma.habitCompletion.create({
      data: {
        userId: user.id,
        habitId: read.id,
        date: key,
        status: readFail ? "failed" : "completed",
        reason: readFail ? (ago % 2 === 0 ? "no_time" : "not_motivated") : null,
        preferredTimeAtLog: "21:00",
      },
    });

    await prisma.habitCompletion.create({
      data: {
        userId: user.id,
        habitId: water.id,
        date: key,
        status: ago === 6 ? "skipped" : "completed",
        reason: ago === 6 ? "forgot" : null,
        preferredTimeAtLog: "08:00",
      },
    });

    await prisma.checkIn.create({
      data: {
        userId: user.id,
        date: key,
        mood: readFail ? 2 : 4,
        blocker: readFail ? "Work ran late" : null,
      },
    });
  }

  console.log("Seeded demo@north.app / demo1234");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
