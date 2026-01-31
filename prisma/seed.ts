import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seed() {
  const email = "rachel@remix.run";

  // cleanup the existing database
  await prisma.user.delete({ where: { email } }).catch(() => {
    // no worries if it doesn't exist yet
  });

  const hashedPassword = await bcrypt.hash("racheliscool", 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: {
        create: {
          hash: hashedPassword,
        },
      },
    },
  });

  // Create mobile test user
  const testEmail = "test@mobile.test";
  await prisma.user.delete({ where: { email: testEmail } }).catch(() => {});

  const testHashedPassword = await bcrypt.hash("testmobile123", 10);

  const testUser = await prisma.user.create({
    data: {
      email: testEmail,
      password: {
        create: {
          hash: testHashedPassword,
        },
      },
    },
  });

  console.log(`Test user created: ${testEmail} / testmobile123`);

  // Skip essay creation due to schema changes - user has been created
  console.log(`Database has been seeded. 🌱`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
