/**
 * OpenAI Embeddings with pgvector Integration
 * Handles text embedding generation and chunking for pgvector storage
 *
 * Embedding Model: OpenAI `text-embedding-3-small`
 * Dimensions: 1536
 */

import { prisma } from '~/db.server';

/**
 * Chunk size configuration for essay splitting
 */
export const CHUNK_SIZE_WORDS = 200;
export const CHUNK_OVERLAP_WORDS = 50;

/**
 * Generate embedding for text using OpenAI
 *
 * @param text - Text to embed
 * @returns 1536-dimensional vector (number array)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid response from OpenAI API');
    }

    return data.data[0].embedding;
  } catch (error) {
    console.error(`❌ Error generating embedding: ${error}`);
    throw error;
  }
}

/**
 * Split essay text into chunks for precise citation
 *
 * @param content - Full essay text
 * @returns Array of chunks with metadata
 */
export function chunkEssay(content: string): Array<{
  index: number;
  content: string;
}> {
  const words = content.split(/\s+/);
  const chunks: Array<{ index: number; content: string }> = [];

  let start = 0;
  let chunkIndex = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE_WORDS, words.length);
    const chunkText = words.slice(start, end).join(' ');

    chunks.push({
      index: chunkIndex,
      content: chunkText,
    });

    chunkIndex++;
    start = end - CHUNK_OVERLAP_WORDS;

    // Avoid infinite loop
    if (start >= words.length - CHUNK_OVERLAP_WORDS) {
      break;
    }
  }

  return chunks;
}

/**
 * Store essay chunks with embeddings in pgvector
 *
 * @param essayId - Essay ID
 * @param chunks - Array of chunk data
 */
export async function storeChunksWithEmbeddings(
  essayId: string,
  chunks: Array<{
    index: number;
    content: string;
  }>,
  metadata: {
    filename?: string;
    title?: string;
    awarded?: boolean;
    date?: string;
    [key: string]: any;
  }
): Promise<void> {
  // Delete existing chunks for this essay
  await prisma.$executeRaw`
    DELETE FROM "EssayChunk" WHERE "essayId" = ${essayId}
  `;

  // Generate embeddings and store each chunk
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content);
    const embeddingString = `[${embedding.join(',')}]`;

    await prisma.$executeRaw`
      INSERT INTO "EssayChunk" (
        "id",
        "essayId",
        "chunkIndex",
        "content",
        "embedding",
        "displayId",
        "metadata",
        "createdAt",
        "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${essayId},
        ${chunk.index},
        ${chunk.content},
        ${embeddingString}::vector(1536),
        ${chunk.index + 1},
        ${JSON.stringify({ ...metadata, chunkIndex: chunk.index })}::jsonb,
        NOW(),
        NOW()
      )
    `;
  }

  console.log(`✅ Stored ${chunks.length} chunks for essay ${essayId}`);
}

/**
 * Search for relevant chunks using pgvector cosine similarity
 *
 * @param userId - User ID
 * @param query - Search query text
 * @param topK - Number of results to return
 * @returns Array of relevant chunks with similarity scores
 */
export async function searchRelevantChunks(
  userId: string,
  query: string,
  topK: number = 5
): Promise<Array<{
  id: string;
  chunkId: number;
  displayId: number;
  content: string;
  similarity: number;
  metadata: any;
}>> {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(',')}]`;

  try {
    const results = await prisma.$queryRaw`
      SELECT
        ec.id,
        ec."essayId",
        ec."chunkIndex",
        ec.content,
        ec."displayId",
        ec.metadata,
        e."essayPrompt" as essay_title,
        e."wasAwarded",
        1 - (ec.embedding <=> ${embeddingString}::vector(1536)) as similarity
      FROM "EssayChunk" ec
      JOIN "Essay" e ON ec."essayId" = e.id
      WHERE e."userId" = ${userId}
      ORDER BY ec.embedding <=> ${embeddingString}::vector(1536)
      LIMIT ${topK}
    `;

    return results.map((row: any, index: number) => ({
      id: (row as any).id,
      chunkId: (row as any).chunkIndex,
      displayId: (row as any).displayId,
      content: (row as any).content,
      similarity: parseFloat((row as any).similarity),
      metadata: {
        ...(row as any).metadata,
        essayTitle: (row as any).essay_title,
        wasAwarded: (row as any).wasAwarded,
      },
    }));
  } catch (error) {
    console.error('❌ Error searching chunks:', error);
    return [];
  }
}

/**
 * Format retrieved chunks for LLM prompt with numbered sources
 *
 * @param chunks - Retrieved chunks from pgvector
 * @returns Formatted string for prompt
 */
export function formatChunksForPrompt(chunks: Array<{
  displayId: number;
  content: string;
  metadata: any;
}>): string {
  return chunks
    .map(
      (chunk) =>
        `Source [ID: ${chunk.displayId}]: "${chunk.content.trim()}" (from ${chunk.metadata.essayTitle || 'Unknown Essay'})`
    )
    .join('\n\n');
}
