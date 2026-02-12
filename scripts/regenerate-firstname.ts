import { PrismaClient } from "@prisma/client";
import { generateFieldResponse } from "~/lib/field-generation.server";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "test@mobile.test" },
    include: {
      globalKnowledge: {
        where: {
          title: "First Name",
          verified: true,
        },
      },
    },
  });

  if (!user) {
    console.log("User not found");
    return;
  }

  console.log(`\n🔍 User: ${user.email}`);
  console.log(`\n✅ Verified First Name in GlobalKnowledge:`);
  user.globalKnowledge.forEach(k => {
    console.log(`  - ${k.title}: ${k.content}`);
    console.log(`    Type: ${k.type}, Category: ${k.category}, Has embedding: ${k.embedding ? "Yes" : "No"}`);
  });

  // Find the FieldMapping with "Alex"
  const fieldMapping = await prisma.fieldMapping.findFirst({
    where: {
      userId: user.id,
      fieldLabel: { contains: "First", mode: "insensitive" },
    },
    include: {
      scholarship: true,
    },
  });

  if (!fieldMapping) {
    console.log("\n❌ No First Name field mapping found");
    return;
  }

  console.log(`\n\n📝 Current FieldMapping:`);
  console.log(`  Field: ${fieldMapping.fieldLabel} (${fieldMapping.fieldName})`);
  console.log(`  Current Value: ${fieldMapping.approvedValue}`);
  console.log(`  Scholarship: ${fieldMapping.scholarship.title}`);
  console.log(`  Last Updated: ${fieldMapping.updatedAt}`);

  // Try regenerating
  console.log(`\n\n🔄 Regenerating field value using generateFieldResponse()...\n`);

  try {
    const newValue = await generateFieldResponse({
      userId: user.id,
      applicationId: "test-app", // Dummy value for test
      field: {
        fieldName: fieldMapping.fieldName,
        fieldLabel: fieldMapping.fieldLabel,
        fieldType: fieldMapping.fieldType,
      },
      scholarship: fieldMapping.scholarship,
    });

    console.log(`\n✅ New generated value: "${newValue}"`);

    // Update the field mapping
    console.log(`\n💾 Updating FieldMapping...`);
    await prisma.fieldMapping.update({
      where: { id: fieldMapping.id },
      data: {
        approvedValue: newValue,
        updatedAt: new Date(),
      },
    });

    console.log(`\n✅ FieldMapping updated successfully!`);
    console.log(`\nOld value: "${fieldMapping.approvedValue}"`);
    console.log(`New value: "${newValue}"`);

    if (newValue !== "Casey") {
      console.log(`\n⚠️  WARNING: Expected "Casey" but got "${newValue}"`);
      console.log(`\nThis suggests preprocessObviousField() is not finding the verified entry.`);
      console.log(`Possible reasons:`);
      console.log(`  1. The verified entry has no embedding`);
      console.log(`  2. The field label doesn't match exactly`);
      console.log(`  3. The type check is failing (looking for "obvious_field" vs actual type)`);
    }
  } catch (error) {
    console.error(`\n❌ Error regenerating field:`, error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
