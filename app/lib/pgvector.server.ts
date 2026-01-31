/**
 * pgvector-based RAG implementation for Scholarships Plus
 * Uses chunk-based retrieval with numbered citations
 */

import { prisma } from "~/db.server";
import { generateEmbedding } from "./embeddings.server";

/**
 * Chunk size for essays (in words)
 */
const CHUNK_SIZE_WORDS = 200;
const CHUNK_OVERLAP_WORDS = 50;

/**
 * Chunk an essay into smaller pieces for precise citation
 */
export async function chunkEssay(
  essayId: string,
  content: string,
  metadata: {
    filename?: string;
    title?: string;
    awarded?: boolean;
    date?: string;
    [key: string]: any;
  }
) {
  // Split content into words
  const words = content.split(/\s+/);
  const chunks: string[] = [];

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE_WORDS, words.length);
    chunks.push(words.slice(start, end).join(" "));
    start = end - CHUNK_OVERLAP_WORDS;

    // Avoid infinite loop
    if (start >= words.length - CHUNK_OVERLAP_WORDS) {
      break;
    }
  }

  // Generate embeddings for each chunk
  const chunkRecords = [];

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);

    chunkRecords.push({
      essayId,
      chunkIndex: i,
      content: chunks[i],
      embedding: embedding.toString(), // pgvector stores as array
      displayId: i + 1, // For prompt formatting (1-based)
      metadata: {
        ...metadata,
        chunkIndex: i,
        totalChunks: chunks.length,
      },
    });
  }

  return chunkRecords;
}

/**
 * Store essay chunks with embeddings in pgvector
 */
export async function storeEssayChunks(chunks: {
  essayId: string;
  chunkIndex: number;
  content: string;
  embedding: string;
  displayId: number;
  metadata: any;
}[]) {
  // Delete existing chunks for this essay
  await prisma.$executeRaw`
    DELETE FROM "EssayChunk" WHERE "essayId" = ${chunks[0].essayId}
  `;

  // Insert new chunks with embeddings
  for (const chunk of chunks) {
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
        ${chunk.essayId}::uuid,
        ${chunk.chunkIndex},
        ${chunk.content},
        ${chunk.embedding}::vector(1024),
        ${chunk.displayId},
        ${JSON.stringify(chunk.metadata)}::jsonb,
        NOW(),
        NOW()
      )
    `;
  }
}

/**
 * Search for relevant chunks using pgvector similarity search
 */
export async function searchRelevantChunks(
  userId: string,
  query: string,
  filters: {
    awardedOnly?: boolean;
    minRelevance?: number;
  } = {},
  topK: number = 5
) {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(",")}]`;

  // Build pgvector query
  let sql = `
    SELECT
      ec.id,
      ec."essayId",
      ec."chunkIndex",
      ec.content,
      ec.displayId,
      ec.metadata,
      e.title as essay_title,
      e."wasAwarded",
      1 - (ec.embedding <=> ${embeddingString}::vector(1024)) as similarity
    FROM "EssayChunk" ec
    JOIN "Essay" e ON ec."essayId" = e.id
    WHERE e."userId" = ${userId}::uuid
  `;

  // Add optional filters
  if (filters.awardedOnly) {
    sql += ` AND e."wasAwarded" = true`;
  }

  if (filters.minRelevance) {
    sql += ` AND (1 - (ec.embedding <=> ${embeddingString}::vector(1024))) >= ${filters.minRelevance}`;
  }

  // Order by similarity and limit
  sql += `
    ORDER BY ec.embedding <=> ${embeddingString}::vector(1024)
    LIMIT ${topK}
  `;

  const results = await prisma.$queryRawUnsafe(sql) as any[];

  return results.map((row: any, index: number) => ({
    id: row.id,
    chunkId: row.displayId,
    displayId: index + 1, // Re-number for prompt (1-based sequential)
    content: row.content,
    similarity: parseFloat(row.similarity),
    metadata: {
      ...row.metadata,
      essayTitle: row.essay_title,
      wasAwarded: row.wasAwarded,
    },
  }));
}

/**
 * Search GlobalKnowledge using pgvector similarity search
 * Used for obvious field preprocessing and general knowledge queries
 */
export async function searchGlobalKnowledge(
  userId: string,
  query: string,
  filters: {
    verified?: boolean;
    type?: string;
    category?: string;
  } = {},
  topK: number = 5
) {
  // Generate query embedding (1536-dim for text-embedding-3-small)
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(",")}]`;

  // Build pgvector query for GlobalKnowledge (1536-dim vectors)
  let sql = `
    SELECT
      gk.id,
      gk.type,
      gk.category,
      gk.title,
      gk.content,
      gk.verified,
      gk.confidence,
      1 - (gk.embedding <=> ${embeddingString}::vector(1536)) as similarity
    FROM "GlobalKnowledge" gk
    WHERE gk."userId" = ${userId}::uuid
      AND gk.embedding IS NOT NULL
  `;

  // Add optional filters
  if (filters.verified !== undefined) {
    sql += ` AND gk.verified = ${filters.verified}`;
  }

  if (filters.type) {
    sql += ` AND gk.type = ${filters.type}`;
  }

  if (filters.category) {
    sql += ` AND gk.category = ${filters.category}`;
  }

  // Order by similarity and limit
  sql += `
    ORDER BY gk.embedding <=> ${embeddingString}::vector(1536)
    LIMIT ${topK}
  `;

  const results = await prisma.$queryRawUnsafe(sql) as any[];

  return results.map((row: any) => ({
    id: row.id,
    content: row.content,
    similarity: parseFloat(row.similarity),
    metadata: {
      type: row.type,
      category: row.category,
      title: row.title,
      verified: row.verified,
      confidence: row.confidence,
    },
  }));
}

/**
 * Format retrieved chunks for LLM prompt with numbered sources
 */
export function formatChunksForPrompt(chunks: {
  displayId: number;
  content: string;
  metadata: any;
}[]): string {
  return chunks
    .map(
      (chunk) =>
        `Source [ID: ${chunk.displayId}]: "${chunk.content.trim()}" (from ${chunk.metadata.essayTitle || "Unknown Essay"})`
    )
    .join("\n\n");
}

/**
 * Build system prompt for citation-required LLM response
 */
export function buildCitationSystemPrompt(): string {
  return `You are an expert scholarship essay writer. Your task is to draft a new essay based on student's past writings.

CRITICAL INSTRUCTIONS:

Use the provided Context Sources to inform the content.

Every time you use a specific fact, story, or phrase from a source, you must cite it using the ID in square brackets, e.g., [1] or [2].

If you combine information from multiple sources, cite both: [1, 3].

Do not mention "Source [X]" by name in the flow of the sentence. Use only the bracketed numbers.

If a piece of information is not in the context, do not invent it.

Your response should be a well-structured essay that naturally incorporates citations from the provided sources.`;
}

/**
 * Process LLM response to extract citations and map to source metadata
 */
export function processCitations(
  llmResponse: string,
  retrievedChunks: {
    displayId: number;
    content: string;
    metadata: any;
  }[]
) {
  // Find all citation references like [1], [2], [1, 3], etc.
  const citationRegex = /\[(\d+(?:,\s*\d+)*)\]/g;
  const citations: Array<{
    reference: string;
    sourceIds: number[];
    sources: Array<{
      id: number;
      title: string;
      excerpt: string;
      awarded?: boolean;
    }>;
  }> = [];

  let match;
  while ((match = citationRegex.exec(llmResponse)) !== null) {
    const reference = match[0]; // e.g., "[1]" or "[1, 3]"
    const ids = match[1]
      .split(",")
      .map((id) => parseInt(id.trim()));

    // Find the corresponding chunks
    const sources = ids.map((id) => {
      const chunk = retrievedChunks.find((c) => c.displayId === id);
      return {
        id,
        title: chunk?.metadata.essayTitle || "Unknown",
        excerpt: chunk?.content?.substring(0, 200) || "",
        awarded: chunk?.metadata.wasAwarded,
      };
    });

    citations.push({
      reference,
      sourceIds: ids,
      sources,
    });
  }

  return {
    content: llmResponse,
    citations,
  };
}

/**
 * Generate RAG response with pgvector and chunk-based citations
 */
export async function generateRAGResponseWithCitations(options: {
  userId: string;
  query: string;
  topK?: number;
  awardedOnly?: boolean;
}) {
  const { userId, query, topK = 5, awardedOnly = false } = options;

  // Step 1: Search for relevant chunks
  const chunks = await searchRelevantChunks(userId, query, {
    awardedOnly,
  }, topK);

  if (chunks.length === 0) {
    return {
      content: "I don't have any relevant past essays to reference for this request. Please upload some essays first.",
      citations: [],
      sources: [],
    };
  }

  // Step 2: Format chunks for prompt
  const contextSources = formatChunksForPrompt(chunks);

  // Step 3: Build system prompt
  const systemPrompt = buildCitationSystemPrompt();

  // Step 4: Call LLM
  const userPrompt = `Context Sources:\n\n${contextSources}\n\nTask: ${query}`;

  const llmResponse = await callGLMChat(systemPrompt, userPrompt);

  // Step 5: Process citations
  const processed = processCitations(llmResponse, chunks);

  return {
    content: processed.content,
    citations: processed.citations,
    sources: chunks.map((chunk) => ({
      id: chunk.displayId,
      title: chunk.metadata.essayTitle,
      excerpt: chunk.content.substring(0, 200),
      relevance: Math.round(chunk.similarity * 100),
      awarded: chunk.metadata.wasAwarded,
    })),
  };
}

/**
 * Call GLM 4.7 chat API
 */
async function callGLMChat(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!process.env.GLM_API_KEY) {
    throw new Error("GLM_API_KEY is not set");
  }

  const apiUrl = process.env.ZAI_API_URL || process.env.GLM_API_URL || "https://api.z.ai/api/coding/paas/v4/chat/completions";
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "glm-4.7",
      // Disable chain-of-thought thinking mode to get direct responses
      thinking: {
        type: "disabled",
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GLM API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
