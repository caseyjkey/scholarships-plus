import { PrismaClient } from "@prisma/client";
import { extractAndStoreFacts } from "~/lib/fact-extraction.server";

const prisma = new PrismaClient();

async function main() {
  const userEmail = process.argv[2] || "test@mobile.test";

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: {
      essays: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    console.log(`❌ User not found: ${userEmail}`);
    return;
  }

  console.log(`\n🔍 User: ${userEmail} (ID: ${user.id})`);
  console.log(`📚 Essays: ${user.essays.length}\n`);

  // Step 1: Delete existing obvious_field facts from essays
  console.log("🗑️  Step 1: Deleting existing essay-extracted obvious_field facts...\n");

  const deleteResult = await prisma.globalKnowledge.deleteMany({
    where: {
      userId: user.id,
      type: "obvious_field",
      source: {
        startsWith: "essay:",
      },
    },
  });

  console.log(`✅ Deleted ${deleteResult.count} old essay-extracted facts\n`);

  // Step 2: Re-extract facts from all essays with verified: false
  console.log("🔄 Step 2: Re-extracting facts from essays (verified: false)...\n");

  let totalExtracted = 0;
  let totalStored = 0;
  const errors: string[] = [];

  for (const essay of user.essays) {
    const essayText = essay.body || essay.essay;

    if (!essayText || essayText.length < 50) {
      console.log(`⏭️  Skipping essay ${essay.id} - too short or empty`);
      continue;
    }

    console.log(`\n📝 Processing essay ${essay.id}...`);
    console.log(`   Prompt: ${essay.essayPrompt?.substring(0, 80)}...`);
    console.log(`   Length: ${essayText.length} chars`);

    try {
      const result = await extractAndStoreFacts(user.id, essay.id, essayText);

      totalExtracted += result.extracted;
      totalStored += result.stored;

      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }

      console.log(`   ✅ Extracted: ${result.extracted}, Stored: ${result.stored}`);
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      errors.push(`Essay ${essay.id}: ${error.message}`);
    }
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total essays processed: ${user.essays.length}`);
  console.log(`Total facts extracted: ${totalExtracted}`);
  console.log(`Total facts stored: ${totalStored}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    errors.forEach(e => console.log(`   - ${e}`));
  }

  // Step 3: Show what was extracted
  console.log(`\n\n🔍 Checking extracted facts...\n`);

  const extractedFacts = await prisma.globalKnowledge.findMany({
    where: {
      userId: user.id,
      type: "obvious_field",
      source: {
        startsWith: "essay:",
      },
    },
    orderBy: { title: "asc" },
  });

  console.log(`📝 Extracted ${extractedFacts.length} obvious_field facts:\n`);

  // Group by field
  const byField: Record<string, Array<{ value: string; confidence: number; verified: boolean }>> = {};

  extractedFacts.forEach(fact => {
    const value = fact.content.match(/^Value:\s*(.+)$/m)?.[1] || fact.content;

    if (!byField[fact.title]) {
      byField[fact.title] = [];
    }

    byField[fact.title].push({
      value,
      confidence: fact.confidence,
      verified: fact.verified,
    });
  });

  Object.entries(byField).forEach(([field, values]) => {
    console.log(`  ${field}:`);
    values.forEach(v => {
      const verifiedBadge = v.verified ? "✅" : "❓";
      console.log(`    ${verifiedBadge} ${v.value} (confidence: ${v.confidence.toFixed(2)})`);
    });
    console.log();
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ COMPLETE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\nNext steps:`);
  console.log(`  1. All facts are now marked as verified: FALSE ❓`);
  console.log(`  2. Visit scholarship forms with your extension`);
  console.log(`  3. Extension will suggest these values for autofill`);
  console.log(`  4. Use sparkle chat to confirm/correct values`);
  console.log(`  5. Confirmed values get marked as verified: TRUE ✅\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
