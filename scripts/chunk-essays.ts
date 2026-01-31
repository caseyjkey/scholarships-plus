/**
 * Chunk existing essays and generate embeddings for RAG system
 *
 * Usage: npx tsx scripts/chunk-essays.ts
 */

import { PrismaClient } from '@prisma/client';
import { chunkEssay, storeChunksWithEmbeddings } from '../app/lib/embeddings.server';

const prisma = new PrismaClient();

async function chunkExistingEssays() {
  console.log('📚 Fetching essays...');

  const essays = await prisma.essay.findMany({
    select: {
      id: true,
      essayPrompt: true,
      body: true,
    },
  });

  console.log(`Found ${essays.length} essays`);

  for (const essay of essays) {
    try {
      console.log(`\n📄 Processing: ${essay.essayPrompt}`);

      // Check if already chunked
      const existingChunks = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM "EssayChunk" WHERE "essayId" = ${essay.id}
      `;

      if ((existingChunks as any)[0]?.count > 0) {
        console.log(`  ⏭️  Already chunked, skipping...`);
        continue;
      }

      // Skip if body is empty or just a placeholder
      if (!essay.body || essay.body.length < 50) {
        console.log(`  ⚠️  Skipping (empty or placeholder content)`);
        continue;
      }

      // Chunk the essay
      const chunks = chunkEssay(essay.body);
      console.log(`  📦 Created ${chunks.length} chunks`);

      // Store with embeddings
      await storeChunksWithEmbeddings(essay.id, chunks, {
        essayTitle: essay.essayPrompt,
      });

      console.log(`  ✅ Done!`);
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
    }
  }

  console.log('\n✨ All done!');
  process.exit(0);
}

chunkExistingEssays().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
