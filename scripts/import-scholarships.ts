#!/usr/bin/env npx tsx
/**
 * Import scraped scholarship data into the database
 *
 * Usage:
 *   npx tsx scripts/import-scholarships.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

interface ScrapedScholarshipData {
  title: string;
  short_description: string;
  full_description: string;
  amount: string;
  deadline: string;
  eligibility: string;
  application_url: string;
  status: string;
}

interface ScholarshipImportData {
  scraped_at: string;
  portal: string;
  total_count: number;
  scholarships: ScrapedScholarshipData[];
}

async function main() {
  console.log('Starting scholarship import...');

  // Read the scraped data
  const dataPath = join(__dirname, '..', 'data', 'scholarships', 'nativeforward_scholarships_FINAL.json');
  const fileContent = readFileSync(dataPath, 'utf-8');
  const data: ScholarshipImportData = JSON.parse(fileContent);

  console.log(`Found ${data.total_count} scholarships to import`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const scholarship of data.scholarships) {
    try {
      // Generate a unique ID based on the title
      const sourceUrl = `https://www.nativeforward.org/scholarships/${scholarship.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

      // Parse deadline - more robust parsing
      let deadline: Date | null = null;
      try {
        // Clean up the deadline string
        const deadlineStr = scholarship.deadline
          .replace(' at ', ' ')
          .replace(',', '')
          .trim();

        // Parse the date
        deadline = new Date(deadlineStr);

        // Check if date is valid
        if (isNaN(deadline.getTime())) {
          // Try parsing different formats
          const parts = deadlineStr.split(' ');
          if (parts.length >= 3) {
            // Format: "February 27, 2026 11:59 PM MST"
            const month = parts[0];
            const day = parts[1].replace(',', '');
            const year = parts[2];
            deadline = new Date(`${month} ${day}, ${year}`);
          }
        }

        if (isNaN(deadline.getTime())) {
          console.warn(`Invalid deadline for "${scholarship.title}": ${scholarship.deadline}`);
          deadline = null;
        }
      } catch (error) {
        console.warn(`Error parsing deadline for "${scholarship.title}": ${scholarship.deadline}`);
        deadline = null;
      }

      // Store requirements as JSON
      const requirements = {
        eligibility: scholarship.eligibility,
        short_description: scholarship.short_description,
        full_description: scholarship.full_description
      };

      // Upsert the scholarship
      const result = await prisma.scrapedScholarship.upsert({
        where: { id: sourceUrl },
        update: {
          title: scholarship.title,
          description: scholarship.full_description,
          amount: scholarship.amount !== 'Not specified' && scholarship.amount !== 'Not specified.' ? parseFloat(scholarship.amount.replace(/[^0-9.]/g, '')) || null : null,
          deadline: deadline,
          requirements: requirements,
          applicationUrl: scholarship.application_url,
          updatedAt: new Date()
        },
        create: {
          id: sourceUrl,
          portal: 'nativeforward',
          title: scholarship.title,
          description: scholarship.full_description,
          amount: scholarship.amount !== 'Not specified' && scholarship.amount !== 'Not specified.' ? parseFloat(scholarship.amount.replace(/[^0-9.]/g, '')) || null : null,
          deadline: deadline,
          requirements: requirements,
          applicationUrl: scholarship.application_url,
          sourceUrl: sourceUrl
        }
      });

      // Check if it was a new import or update
      const createdTime = result.createdAt?.getTime() || 0;
      const updatedTime = result.updatedAt?.getTime() || 0;

      if (createdTime === updatedTime) {
        imported++;
        console.log(`✅ Imported: "${scholarship.title}"`);
      } else {
        updated++;
        console.log(`🔄 Updated: "${scholarship.title}"`);
      }

    } catch (error) {
      console.error(`❌ Error importing "${scholarship.title}":`, error);
      skipped++;
    }
  }

  console.log('\n========================================');
  console.log('Import Summary:');
  console.log(`  Imported: ${imported}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Total:    ${data.total_count}`);
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
