import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  // Import Student Relief Funding
  const file = readFileSync(join(process.cwd(), 'data/scholarships/native_forward_student_relief_funding_spring_2025_.json'), 'utf-8');
  const data = JSON.parse(file);
  
  const deadline = new Date(data.deadline?.replace(' at ', ' ').replace(',', '') || '2026-02-27');
  
  await prisma.scrapedScholarship.upsert({
    where: { id: 'https://www.nativeforward.org/scholarships/native-forward-student-relief-funding' },
    create: {
      id: 'https://www.nativeforward.org/scholarships/native-forward-student-relief-funding',
      portal: 'nativeforward',
      title: data.title,
      description: data.full_description,
      deadline: deadline,
      requirements: { 
        eligibility: Array.isArray(data.eligibility) ? data.eligibility.join('\n') : data.eligibility 
      },
      applicationUrl: data.application_url,
      sourceUrl: 'https://www.nativeforward.org/scholarships/native-forward-student-relief-funding'
    },
    update: {
      title: data.title,
      description: data.full_description,
      deadline: deadline,
      requirements: { 
        eligibility: Array.isArray(data.eligibility) ? data.eligibility.join('\n') : data.eligibility 
      },
      applicationUrl: data.application_url
    }
  });
  
  console.log('✅ Imported Student Relief Funding');
  
  const count = await prisma.scrapedScholarship.count({ where: { portal: 'nativeforward' } });
  console.log(`Total Native Forward scholarships: ${count}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
