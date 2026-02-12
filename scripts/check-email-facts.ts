import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function searchEmails() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@mobile.test' },
    select: { id: true }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  // Search for all email-related entries
  const emailFields = await prisma.globalKnowledge.findMany({
    where: {
      userId: user.id,
      OR: [
        { title: { contains: 'email', mode: 'insensitive' } },
        { title: { contains: 'mail', mode: 'insensitive' } },
        { content: { contains: 'casey', mode: 'insensitive' } },
        { content: { contains: 'NScholarsh', mode: 'insensitive' } },
        { content: { contains: 'jane.doe', mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      verified: true,
      confidence: true,
      source: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 30
  });

  console.log('=== All Email-Related Entries ===');
  console.log(`Found ${emailFields.length} entries\n`);
  
  for (const field of emailFields) {
    console.log('Type:', field.type);
    console.log('Title:', field.title);
    console.log('Content:', field.content.substring(0, 200));
    console.log('Verified:', field.verified, '| Confidence:', field.confidence);
    console.log('Source:', field.source);
    console.log('Created:', field.createdAt.toISOString().substring(0, 10));
    console.log('---');
  }
}

searchEmails().finally(() => prisma.$disconnect());
