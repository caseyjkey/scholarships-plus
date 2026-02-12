import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyEmail() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@mobile.test' },
    select: { id: true }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  const emailFacts = await prisma.globalKnowledge.findMany({
    where: {
      userId: user.id,
      type: 'obvious_field',
      title: 'Email Address'
    },
    select: { content: true, source: true }
  });

  console.log('\n=== Email Facts After Re-extraction ===');
  console.log(`Total email entries: ${emailFacts.length}\n`);
  
  for (const fact of emailFacts) {
    console.log(`  ${fact.content}`);
    console.log(`  Source: ${fact.source}`);
    console.log('');
  }
  
  if (emailFacts.length === 0) {
    console.log('⚠️  NO EMAIL FOUND! Re-extraction may not have processed essays with email yet.');
  } else if (emailFacts.some(f => f.content.includes('NScholarsh'))) {
    console.log('❌ GARBAGE DATA STILL PRESENT!');
  } else if (emailFacts.some(f => f.content.includes('hey@keycasey.com'))) {
    console.log('✅ CORRECT EMAIL FOUND!');
  }
}

verifyEmail().finally(() => prisma.$disconnect());
