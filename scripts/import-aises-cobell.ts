#!/usr/bin/env npx tsx
/**
 * Import All AISES/Cobell Scholarships into Database
 *
 * Reads all scraped JSON files from data/aises_cobell/ and imports them
 * into the database using Prisma.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Importing all AISES/Cobell scholarships...\n');

  const dataDir = join(process.cwd(), 'data', 'aises_cobell');
  const files = readdirSync(dataDir).filter(f => f.match(/^aises_cobell_\d+.*\.json$/) && !f.includes('summary'));

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

      // Normalize field names
      const title = data.title || data.Title;
      const description = data.description || data['Full description'] || data.full_description;
      const shortDesc = data.short_description || data['Short description'];
      const deadline = data.deadline || data['Application deadline'];
      const eligibility = data.eligibility || data['Eligibility requirements'];
      const appUrl = data.application_url || data['Application link'] || data.application_url;
      const organization = data.organization || 'AISES';
      const amount = data.award_amount || data.amount;
      const requiredDocs = data.required_documents || data['Required documents'];

      // Handle application sections (from detailed scrape)
      const applicationSections = data.application_sections || data.applicationSections || null;

      if (!title) {
        console.log(`Skipping ${file}: missing title`);
        continue;
      }

      // Generate unique source URL
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const sourceUrl = `https://aises.awardspring.com/${slug}`;

      // Parse deadline
      let deadlineDate: Date | null = null;
      if (deadline) {
        try {
          // Handle various date formats
          const cleanedDeadline = deadline.replace(' at ', ' ').replace(',', '');
          deadlineDate = new Date(cleanedDeadline);
          // Check if date is valid
          if (isNaN(deadlineDate.getTime())) {
            deadlineDate = null;
          }
        } catch {
          deadlineDate = null;
        }
      }

      // Build requirements object
      const requirements = {
        eligibility: Array.isArray(eligibility) ? eligibility.join('\n') : (eligibility || ''),
        short_description: shortDesc || '',
        full_description: description || '',
        required_documents: Array.isArray(requiredDocs) ? requiredDocs.join(', ') : (requiredDocs || ''),
        organization,
      };

      // Upsert to database using sourceUrl as unique key
      const result = await prisma.scrapedScholarship.upsert({
        where: { sourceUrl },
        update: {
          title,
          description: description || '',
          deadline: deadlineDate || new Date(),
          requirements,
          applicationUrl: appUrl || sourceUrl,
          amount: amount ? parseFloat(amount.replace(/[^0-9.]/g, '')) || null : null,
          portal: organization.toLowerCase(),
          scrapeStatus: 'success',
          applicationSections,
          updatedAt: new Date()
        },
        create: {
          portal: organization.toLowerCase(),
          title,
          description: description || '',
          deadline: deadlineDate || new Date(),
          requirements,
          applicationUrl: appUrl || sourceUrl,
          sourceUrl,
          amount: amount ? parseFloat(amount.replace(/[^0-9.]/g, '')) || null : null,
          scrapeStatus: 'success',
          applicationSections,
        }
      });

      // Check if it was new or updated
      const createdTime = result.createdAt?.getTime() || 0;
      const updatedTime = result.updatedAt?.getTime() || 0;

      if (createdTime === updatedTime && Math.abs(Date.now() - createdTime) < 5000) {
        imported++;
        console.log(`✅ [${organization}] ${title}`);
      } else {
        updated++;
        console.log(`🔄 [${organization}] ${title}`);
      }

    } catch (error: any) {
      errors++;
      console.error(`❌ ${file}: ${error.message}`);
    }
  }

  const finalCount = await prisma.scrapedScholarship.count({
    where: {
      portal: {
        in: ['aises', 'cobell']
      }
    }
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
