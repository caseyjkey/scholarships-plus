#!/usr/bin/env npx tsx
/**
 * Import All Scraped Scholarships into Database
 *
 * Reads all scraped JSON files from data/scholarships/ and imports them
 * into the database using Prisma.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Importing all Native Forward scholarships...\n');

  const dataDir = join(process.cwd(), 'data', 'scholarships');
  const files = readdirSync(dataDir).filter(f => f.match(/^scholarship_\d+.*\.json$/) || f.includes('nativeforward'));

  let imported = 0;
  let updated = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const filePath = join(dataDir, file);
      const content = readFileSync(filePath, 'utf-8');

      // Handle different JSON formats
      let data: any;
      try {
        data = JSON.parse(content);
      } catch {
        console.log(`Skipping ${file}: invalid JSON`);
        continue;
      }

      // Normalize field names (handle different capitalizations)
      const title = data.title || data.Title;
      const description = data.description || data['Full description'] || data.full_description;
      const shortDesc = data.short_description || data['Short description'];
      const deadline = data.deadline || data['Application deadline'];
      const eligibility = data.eligibility || data['Eligibility requirements'];
      const appUrl = data.application_url || data['Application link'];

      if (!title) {
        console.log(`Skipping ${file}: missing title`);
        continue;
      }

      // Generate unique ID
      const id = `https://www.nativeforward.org/scholarships/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

      // Parse deadline
      let deadlineDate: Date | null = null;
      if (deadline) {
        try {
          deadlineDate = new Date(deadline.replace(' at ', ' ').replace(',', ''));
        } catch {
          deadlineDate = null;
        }
      }

      // Build requirements object
      const requirements = {
        eligibility: Array.isArray(eligibility) ? eligibility.join('\n') : eligibility,
        short_description: shortDesc || '',
        full_description: description || ''
      };

      // Upsert to database
      const result = await prisma.scrapedScholarship.upsert({
        where: { id },
        update: {
          title,
          description: description || '',
          deadline: deadlineDate,
          requirements,
          applicationUrl: appUrl || '',
          updatedAt: new Date()
        },
        create: {
          id,
          portal: 'nativeforward',
          title,
          description: description || '',
          deadline: deadlineDate,
          requirements,
          applicationUrl: appUrl || '',
          sourceUrl: id
        }
      });

      // Check if it was new or updated
      const createdTime = result.createdAt?.getTime() || 0;
      const updatedTime = result.updatedAt?.getTime() || 0;

      if (createdTime === updatedTime && Math.abs(Date.now() - createdTime) < 5000) {
        imported++;
        console.log(`✅ ${title}`);
      } else {
        updated++;
        console.log(`🔄 ${title}`);
      }

    } catch (error: any) {
      errors++;
      console.error(`❌ ${file}: ${error.message}`);
    }
  }

  const finalCount = await prisma.scrapedScholarship.count({
    where: { portal: 'nativeforward' }
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Import Summary:`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Total:    ${finalCount}`);
  console.log(`${'='.repeat(50)}\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
