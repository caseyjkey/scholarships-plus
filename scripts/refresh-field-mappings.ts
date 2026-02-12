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

  console.log(`\n🔍 User: ${userEmail} (ID: ${user.id})\n`);

  // Get all field mappings for this user
  const fieldMappings = await prisma.fieldMapping.findMany({
    where: {
      userId: user.id,
    },
    include: {
      scholarship: {
        select: { title: true },
      },
    },
  });

  console.log(`📝 Found ${fieldMappings.length} field mappings\n`);

  if (fieldMappings.length === 0) {
    console.log("✅ No field mappings to delete");
    return;
  }

  // Show what will be deleted
  console.log("Fields to be deleted:");
  fieldMappings.forEach(m => {
    console.log(`  - ${m.fieldLabel} (${m.scholarship.title}): ${m.approvedValue?.substring(0, 50) || "(no value)"}...`);
  });

  console.log(`\n⚠️  This will delete ${fieldMappings.length} field mappings.`);
  console.log(`They will regenerate from GlobalKnowledge when you next visit the forms.\n`);

  // Delete all field mappings
  const result = await prisma.fieldMapping.deleteMany({
    where: {
      userId: user.id,
    },
  });

  console.log(`\n✅ Deleted ${result.count} field mappings successfully!`);
  console.log(`\nNext steps:`);
  console.log(`  1. Visit the scholarship application form with your extension`);
  console.log(`  2. The extension will recreate field mappings from your GlobalKnowledge`);
  console.log(`  3. All fields should now autofill with correct values from your knowledge base\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
