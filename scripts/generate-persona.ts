/**
 * Trigger persona profile generation for a user
 * Usage: npx tsx scripts/generate-persona.ts <email>
 */

import { prisma } from "../app/db.server";
import { generatePersonaProfileBackground } from "../app/lib/persona-generation.server";

const email = process.argv[2];

if (!email) {
  console.error("Usage: npx tsx scripts/generate-persona.ts <email>");
  process.exit(1);
}

async function main() {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.id} (${user.email})`);

    // Check existing profile
    const existingProfile = await prisma.personaProfile.findUnique({
      where: { userId: user.id },
    });

    if (existingProfile?.status === "generating") {
      console.log("Persona generation already in progress");
      process.exit(0);
    }

    if (existingProfile?.status === "ready") {
      console.log("Persona already ready. Force regeneration? (Ctrl+C to cancel)");
      // Wait 3 seconds before continuing
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log("Starting persona profile generation...");
    console.log("This may take a few minutes...");

    // Trigger generation
    await generatePersonaProfileBackground(user.id);

    console.log("✅ Persona generation complete!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
