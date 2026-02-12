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

  // Get all verified obvious_field entries from GlobalKnowledge
  const verifiedKnowledge = await prisma.globalKnowledge.findMany({
    where: {
      userId: user.id,
      type: "obvious_field",
      verified: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(`\n✅ Verified fields in GlobalKnowledge:\n`);
  verifiedKnowledge.forEach(k => {
    const value = k.content.match(/^Value:\s*(.+)$/m)?.[1] || k.content;
    console.log(`  ${k.title}: ${value}`);
  });

  // Get all field mappings
  const fieldMappings = await prisma.fieldMapping.findMany({
    where: {
      userId: user.id,
      approvedValue: { not: null },
    },
    include: {
      scholarship: {
        select: { title: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(`\n\n📝 Field mappings with values:\n`);

  // Check for potential mismatches
  const potentialMismatches: Array<{
    field: string;
    mappingValue: string;
    knowledgeValue?: string;
    scholarship: string;
  }> = [];

  fieldMappings.forEach(m => {
    console.log(`  ${m.fieldLabel}: ${m.approvedValue} (${m.scholarship.title})`);

    // Try to find matching knowledge entry
    const matchingKnowledge = verifiedKnowledge.find(k => {
      const normalizeLabel = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizeLabel(k.title) === normalizeLabel(m.fieldLabel) ||
             normalizeLabel(k.title).includes(normalizeLabel(m.fieldLabel)) ||
             normalizeLabel(m.fieldLabel).includes(normalizeLabel(k.title));
    });

    if (matchingKnowledge) {
      const knowledgeValue = matchingKnowledge.content.match(/^Value:\s*(.+)$/m)?.[1] || matchingKnowledge.content;
      if (m.approvedValue !== knowledgeValue) {
        potentialMismatches.push({
          field: m.fieldLabel,
          mappingValue: m.approvedValue || "",
          knowledgeValue,
          scholarship: m.scholarship.title,
        });
      }
    }
  });

  if (potentialMismatches.length > 0) {
    console.log(`\n\n⚠️  Potential mismatches found:\n`);
    potentialMismatches.forEach(mm => {
      console.log(`  📌 ${mm.field} (${mm.scholarship})`);
      console.log(`     FieldMapping has: "${mm.mappingValue}"`);
      console.log(`     GlobalKnowledge has: "${mm.knowledgeValue}"`);
      console.log();
    });

    console.log(`\nTo fix these, you can either:`);
    console.log(`  1. Delete the FieldMapping entries (they'll regenerate on next visit)`);
    console.log(`  2. Run regenerate-firstname.ts for each field`);
    console.log(`  3. Update GlobalKnowledge if the FieldMapping value is correct`);
  } else {
    console.log(`\n\n✅ All field mappings match verified knowledge!`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
