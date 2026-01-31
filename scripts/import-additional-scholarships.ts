#!/usr/bin/env npx tsx
/**
 * Import the 2 newly scraped scholarships into the database
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Importing 2 additional scholarships...\n');

  const scholarships = [
    {
      file: 'native_forward_community_impact_research_funding_2.json',
      id: 'https://www.nativeforward.org/scholarships/native-forward-community-impact-research-funding'
    },
    {
      file: 'native_forward_student_access_funding_2025_2026.json',
      id: 'https://www.nativeforward.org/scholarships/native-forward-student-access-funding'
    }
  ];

  for (const sch of scholarships) {
    try {
      const dataPath = join(__dirname, '..', 'data', 'scholarships', sch.file);
      const fileContent = readFileSync(dataPath, 'utf-8');
      const data = JSON.parse(fileContent);

      // Parse deadline
      const deadline = new Date(data['Application deadline'].replace(' at ', ' ').replace(',', ''));

      // Store requirements
      const requirements = {
        eligibility: Array.isArray(data['Eligibility requirements'])
          ? data['Eligibility requirements'].join('\n')
          : data['Eligibility requirements'],
        short_description: data['Short description'],
        full_description: data['Full description']
      };

      await prisma.scrapedScholarship.upsert({
        where: { id: sch.id },
        update: {
          title: data['Title'],
          description: data['Full description'],
          deadline: deadline,
          requirements: requirements,
          applicationUrl: data['Application link'],
          updatedAt: new Date()
        },
        create: {
          id: sch.id,
          portal: 'nativeforward',
          title: data['Title'],
          description: data['Full description'],
          deadline: deadline,
          requirements: requirements,
          applicationUrl: data['Application link'],
          sourceUrl: sch.id
        }
      });

      console.log(`✅ Imported: ${data['Title']}`);

    } catch (error) {
      console.error(`❌ Error:`, error);
    }
  }

  // Remove the test scholarship
  try {
    const deleted = await prisma.scrapedScholarship.deleteMany({
      where: {
        title: { contains: 'Native Forward Scholars Program 2025' }
      }
    });
    console.log(`\n🗑️  Deleted ${deleted.count} test scholarship(s)`);
  } catch (error) {
    console.error('Error deleting test scholarship:', error);
  }

  console.log('\n✅ Done!');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
