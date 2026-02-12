import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "test@mobile.test" },
  });

  if (!user) {
    console.log("User not found");
    return;
  }

  console.log(`\n🔍 Searching for "Alex" in all tables for user ${user.email}\n`);

  // Check GlobalKnowledge
  const knowledgeWithAlex = await prisma.globalKnowledge.findMany({
    where: {
      userId: user.id,
      OR: [
        { title: { contains: "Alex", mode: "insensitive" } },
        { content: { contains: "Alex", mode: "insensitive" } },
        { category: { contains: "Alex", mode: "insensitive" } },
      ],
    },
  });

  console.log(`📚 GlobalKnowledge entries with "Alex": ${knowledgeWithAlex.length}`);
  knowledgeWithAlex.forEach(k => {
    console.log(`  - ${k.title}: ${k.content.substring(0, 100)}`);
    console.log(`    Type: ${k.type}, Verified: ${k.verified}, Confidence: ${k.confidence}\n`);
  });

  // Check FieldMapping
  const fieldMappingsWithAlex = await prisma.fieldMapping.findMany({
    where: {
      userId: user.id,
      OR: [
        { fieldName: { contains: "Alex", mode: "insensitive" } },
        { fieldLabel: { contains: "Alex", mode: "insensitive" } },
        { approvedValue: { contains: "Alex", mode: "insensitive" } },
      ],
    },
  });

  console.log(`\n📝 FieldMapping entries with "Alex": ${fieldMappingsWithAlex.length}`);
  fieldMappingsWithAlex.forEach(m => {
    console.log(`  - ${m.fieldLabel} (${m.fieldName}): ${m.approvedValue}`);
    console.log(`    Approved: ${m.approved}, Generating: ${m.generating}\n`);
  });

  // Check Essays
  const essaysWithAlex = await prisma.essay.findMany({
    where: {
      userId: user.id,
      OR: [
        { body: { contains: "Alex", mode: "insensitive" } },
        { essay: { contains: "Alex", mode: "insensitive" } },
        { essayPrompt: { contains: "Alex", mode: "insensitive" } },
      ],
    },
  });

  console.log(`\n📄 Essays with "Alex": ${essaysWithAlex.length}`);
  if (essaysWithAlex.length > 0) {
    console.log(`  (Found "Alex" in ${essaysWithAlex.length} essays - not showing content for brevity)`);
  }

  // Check specifically for First Name field mappings
  console.log(`\n\n🎯 Checking First Name field mappings:\n`);

  const firstNameMappings = await prisma.fieldMapping.findMany({
    where: {
      userId: user.id,
      OR: [
        { fieldName: { contains: "first", mode: "insensitive" } },
        { fieldLabel: { contains: "first", mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Found ${firstNameMappings.length} First Name field mappings:`);
  firstNameMappings.forEach(m => {
    console.log(`\n  📝 Field: ${m.fieldLabel} (${m.fieldName})`);
    console.log(`     Value: ${m.approvedValue || "(none)"}`);
    console.log(`     Approved: ${m.approved}, Generating: ${m.generating}`);
    console.log(`     Scholarship ID: ${m.scholarshipId}`);
    console.log(`     Updated: ${m.updatedAt}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
