import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userEmail = process.argv[2] || "test@mobile.test";

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
  });

  if (!user) {
    console.log(`❌ User not found: ${userEmail}`);
    return;
  }

  console.log(`\n🔍 Debugging knowledge for: ${userEmail} (ID: ${user.id})\n`);

  // Check all knowledge entries
  const allKnowledge = await prisma.globalKnowledge.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  console.log(`📊 Total knowledge entries: ${allKnowledge.length}\n`);

  // Group by type
  const byType: Record<string, number> = {};
  allKnowledge.forEach(k => {
    byType[k.type] = (byType[k.type] || 0) + 1;
  });

  console.log("Types breakdown:");
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  // Look for first name entries
  console.log("\n\n🔎 Searching for 'First Name' entries:\n");

  const firstNameEntries = allKnowledge.filter(k =>
    k.title.toLowerCase().includes("first") ||
    k.category?.toLowerCase().includes("first") ||
    k.content.toLowerCase().includes("first name")
  );

  if (firstNameEntries.length === 0) {
    console.log("  ❌ No 'First Name' entries found");
  } else {
    firstNameEntries.forEach(entry => {
      console.log(`  📝 Entry:
    ID: ${entry.id}
    Type: ${entry.type}
    Category: ${entry.category || "null"}
    Title: ${entry.title}
    Content: ${entry.content.substring(0, 100)}
    Verified: ${entry.verified}
    Confidence: ${entry.confidence}
    Source: ${entry.source}
    Has embedding: ${entry.embedding ? "✅" : "❌"}
  `);
    });
  }

  // Look for verified entries
  console.log("\n\n✅ Verified entries (verified: true):\n");

  const verifiedEntries = allKnowledge.filter(k => k.verified);

  if (verifiedEntries.length === 0) {
    console.log("  ❌ No verified entries found");
  } else {
    console.log(`  Found ${verifiedEntries.length} verified entries:\n`);
    verifiedEntries.forEach(entry => {
      console.log(`  📝 ${entry.title}
    Type: ${entry.type}
    Category: ${entry.category || "null"}
    Content: ${entry.content.substring(0, 100)}
    Source: ${entry.source}
  `);
    });
  }

  // Look for "obvious_field" type specifically
  console.log("\n\n🎯 Entries with type='obvious_field':\n");

  const obviousFieldEntries = allKnowledge.filter(k => k.type === "obvious_field");

  if (obviousFieldEntries.length === 0) {
    console.log("  ❌ No 'obvious_field' type entries found");
    console.log("  ⚠️  This is the problem! preprocessObviousField() looks for type='obvious_field'");
    console.log("  ⚠️  but saveConfirmedObviousField() saves with type='value'/'experience'/'achievement'");
  } else {
    obviousFieldEntries.forEach(entry => {
      console.log(`  📝 ${entry.title}: ${entry.content}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
