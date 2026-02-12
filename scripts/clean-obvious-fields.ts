/**
 * Clean up garbage data in obvious_field entries using consensus strategy
 *
 * Strategy:
 * 1. For each field type (Email, First Name, etc.), find all values
 * 2. Count occurrences of each value across essays
 * 3. Keep the most frequent value (consensus)
 * 4. Delete all other values for that field
 *
 * Run with: npx tsx scripts/clean-obvious-fields.ts <userId>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanObviousFields(userId: string) {
  console.log(`\n🧹 Cleaning obvious fields for user: ${userId}\n`);

  // Get all obvious_field entries
  const allFields = await prisma.globalKnowledge.findMany({
    where: {
      userId,
      type: 'obvious_field',
    },
    select: {
      id: true,
      title: true,
      content: true,
      source: true,
    },
  });

  console.log(`Found ${allFields.length} obvious_field entries\n`);

  // Group by field title
  const fieldGroups = new Map<string, Array<{ id: string; value: string; source: string }>>();

  for (const field of allFields) {
    const valueMatch = field.content.match(/^Value:\s*(.+)$/m);
    if (!valueMatch) continue;

    const value = valueMatch[1].trim();

    if (!fieldGroups.has(field.title)) {
      fieldGroups.set(field.title, []);
    }

    fieldGroups.get(field.title)!.push({
      id: field.id,
      value,
      source: field.source || 'unknown',
    });
  }

  console.log(`Found ${fieldGroups.size} unique field types\n`);

  // For each field type, find consensus value
  const toDelete: string[] = [];
  const toKeep: Array<{ field: string; value: string; count: number }> = [];

  for (const [fieldTitle, entries] of fieldGroups.entries()) {
    // Count occurrences of each value
    const valueCounts = new Map<string, { count: number; ids: string[] }>();

    for (const entry of entries) {
      if (!valueCounts.has(entry.value)) {
        valueCounts.set(entry.value, { count: 0, ids: [] });
      }
      const current = valueCounts.get(entry.value)!;
      current.count++;
      current.ids.push(entry.id);
    }

    // Filter out null values
    valueCounts.delete('null');

    if (valueCounts.size === 0) {
      console.log(`❌ ${fieldTitle}: Only null values found, deleting all`);
      toDelete.push(...entries.map(e => e.id));
      continue;
    }

    // Find the most frequent value (consensus)
    let maxCount = 0;
    let consensusValue = '';
    let consensusIds: string[] = [];

    for (const [value, { count, ids }] of valueCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        consensusValue = value;
        consensusIds = ids;
      }
    }

    // If there's only one occurrence of each value, keep them all (ambiguous)
    if (valueCounts.size > 1 && maxCount === 1) {
      console.log(`⚠️  ${fieldTitle}: No consensus (all values appear once), keeping all for manual review`);
      console.log(`   Values: ${Array.from(valueCounts.keys()).join(', ')}`);
      continue;
    }

    console.log(`✅ ${fieldTitle}: Consensus value is "${consensusValue}" (${maxCount}/${entries.length} occurrences)`);
    toKeep.push({ field: fieldTitle, value: consensusValue, count: maxCount });

    // Mark all other values for deletion
    for (const entry of entries) {
      if (!consensusIds.includes(entry.id)) {
        console.log(`   🗑️  Deleting: "${entry.value}" (${entry.source})`);
        toDelete.push(entry.id);
      }
    }
  }

  // Show summary before deletion
  console.log(`\n📊 Summary:`);
  console.log(`   Fields to keep: ${toKeep.length}`);
  console.log(`   Entries to delete: ${toDelete.length}`);
  console.log(`\n✅ Keeping:`);
  for (const { field, value, count } of toKeep) {
    console.log(`   ${field}: ${value} (${count} occurrences)`);
  }

  if (toDelete.length === 0) {
    console.log(`\n✨ No garbage data found! Database is clean.`);
    return;
  }

  // Confirm deletion
  console.log(`\n⚠️  About to delete ${toDelete.length} entries. Continue? (y/N)`);

  // In non-interactive mode, skip confirmation
  if (process.env.AUTO_CONFIRM !== 'true') {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      readline.question('', (answer: string) => {
        readline.close();
        resolve(answer);
      });
    });

    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      return;
    }
  }

  // Delete garbage entries
  console.log(`\n🗑️  Deleting ${toDelete.length} entries...`);
  const result = await prisma.globalKnowledge.deleteMany({
    where: {
      id: { in: toDelete },
    },
  });

  console.log(`✅ Deleted ${result.count} entries`);
  console.log(`\n✨ Cleanup complete!`);
}

// Main
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: npx tsx scripts/clean-obvious-fields.ts <userId>');
  console.error('Example: npx tsx scripts/clean-obvious-fields.ts cmkt37oky0001l1vmyfrn0rnc');
  console.error('\nOr by email:');
  console.error('npx tsx scripts/clean-obvious-fields.ts test@mobile.test');
  process.exit(1);
}

(async () => {
  try {
    // If input looks like an email, look up the userId
    let resolvedUserId = userId;
    if (userId.includes('@')) {
      console.log(`Looking up user by email: ${userId}`);
      const user = await prisma.user.findUnique({
        where: { email: userId },
        select: { id: true, email: true },
      });

      if (!user) {
        console.error(`❌ User not found: ${userId}`);
        process.exit(1);
      }

      console.log(`Found user: ${user.email} (${user.id})\n`);
      resolvedUserId = user.id;
    }

    await cleanObviousFields(resolvedUserId);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
