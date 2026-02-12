/**
 * Script to re-extract facts from a user's essays
 * Run with: npx tsx scripts/reextract-facts.ts <userId>
 */

import { reextractFactsForUser } from "../app/lib/fact-extraction.server";

const userId = process.argv[2];

if (!userId) {
  console.error("Usage: npx tsx scripts/reextract-facts.ts <userId>");
  console.error("Example: npx tsx scripts/reextract-facts.ts cmkt37oky0001l1vmyfrn0rnc");
  process.exit(1);
}

console.log(`Starting fact re-extraction for user: ${userId}`);

reextractFactsForUser(userId)
  .then(() => {
    console.log("✅ Fact re-extraction completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fact re-extraction failed:", error);
    process.exit(1);
  });
