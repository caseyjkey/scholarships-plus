import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findEmailInEssays() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@mobile.test' },
    select: { id: true }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  // Search for essays containing email addresses
  const essays = await prisma.essay.findMany({
    where: {
      userId: user.id,
      body: {
        contains: 'keycasey'
      }
    },
    select: {
      id: true,
      body: true,
      essayPrompt: true
    },
    take: 5
  });

  console.log(`Found ${essays.length} essays with "keycasey"\n`);

  for (const essay of essays.slice(0, 3)) {
    const shortId = essay.id.substring(0, 20);
    console.log(`=== Essay ${shortId}... ===`);
    console.log(`Prompt: ${essay.essayPrompt?.substring(0, 80) || 'N/A'}...\n`);

    // Find lines with email addresses
    const lines = essay.body?.split('\n') || [];
    const emailLines = lines.filter(line =>
      line.toLowerCase().includes('email') ||
      line.includes('@') ||
      line.toLowerCase().includes('keycasey')
    );

    console.log('Lines with email context:');
    for (const line of emailLines.slice(0, 5)) {
      console.log(`  "${line.trim().substring(0, 120)}"`);
    }
    console.log('');
  }
}

findEmailInEssays().finally(() => prisma.$disconnect());
