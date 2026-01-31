/**
 * Essay Similarity Computation
 * Background job to compute similarity scores between essays
 * Helps identify which past essays are most relevant for new applications
 */

import { prisma } from '~/db.server';
import { generateEmbedding } from './embeddings.server';

interface SimilarityResult {
  essayId: string;
  similarToId: string;
  score: number;
  reason?: string;
}

interface EssayWithEmbedding {
  id: string;
  body: string;
  essayPrompt: string;
  wasAwarded: boolean | null | undefined;
  vectorId?: string | null;
}

/**
 * Compute similarity between two essays using cosine similarity
 */
export async function computeSimilarity(
  essayId: string,
  userId: string
): Promise<SimilarityResult[]> {
  try {
    // Fetch the target essay
    const targetEssay = await prisma.essay.findUnique({
      where: { id: essayId },
    });

    if (!targetEssay) {
      throw new Error(`Essay ${essayId} not found`);
    }

    // Fetch all other essays from the same user
    const otherEssays = await prisma.essay.findMany({
      where: {
        userId,
        id: { not: essayId },
      },
      select: {
        id: true,
        essay: true,
        essayPrompt: true,
        wasAwarded: true,
      },
    });

    if (otherEssays.length === 0) {
      console.log(`ℹ️ No other essays found for user ${userId}`);
      return [];
    }

    // Generate embedding for target essay
    const targetEmbedding = await generateEmbedding(
      `${targetEssay.essayPrompt}\n\n${targetEssay.essay}`
    );

    // Compute similarity with each other essay
    const similarities: SimilarityResult[] = [];

    for (const otherEssay of otherEssays) {
      const otherEmbedding = await generateEmbedding(
        `${otherEssay.essayPrompt}\n\n${otherEssay.essay}`
      );

      // Compute cosine similarity
      const score = cosineSimilarity(targetEmbedding, otherEmbedding);

      // Generate reason for similarity
      const reason = generateSimilarityReason(score, otherEssay.wasAwarded ?? undefined);

      similarities.push({
        essayId,
        similarToId: otherEssay.id,
        score,
        reason,
      });
    }

    // Sort by similarity score (descending)
    similarities.sort((a, b) => b.score - a.score);

    // Save similarities to database
    await saveSimilarities(similarities);

    // Update essay's last similarity check timestamp
    await prisma.essay.update({
      where: { id: essayId },
      data: { lastSimilarityCheck: new Date() },
    });

    console.log(
      `✅ Computed ${similarities.length} similarities for essay ${essayId}`
    );

    return similarities;
  } catch (error) {
    console.error(`❌ Error computing similarities: ${error}`);
    throw error;
  }
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Generate human-readable reason for similarity
 */
function generateSimilarityReason(score: number, wasAwarded?: boolean): string {
  const percentage = Math.round(score * 100);

  if (percentage >= 90) {
    return `Very high similarity (${percentage}%). ${
      wasAwarded ? 'This essay was awarded a scholarship - strong template!' : ''
    }`;
  } else if (percentage >= 75) {
    return `High similarity (${percentage}%). ${
      wasAwarded ? 'Awarded essay - good reference point.' : ''
    }`;
  } else if (percentage >= 50) {
    return `Moderate similarity (${percentage}%). ${
      wasAwarded ? 'Awarded essay - some relevant themes.' : ''
    }`;
  } else if (percentage >= 25) {
    return `Low similarity (${percentage}%). ${
      wasAwarded ? 'Awarded essay - minor thematic overlap.' : ''
    }`;
  } else {
    return `Very low similarity (${percentage}%).`;
  }
}

/**
 * Save similarities to database
 */
async function saveSimilarities(similarities: SimilarityResult[]): Promise<void> {
  // Use upsert to handle duplicates
  for (const similarity of similarities) {
    await prisma.essaySimilarity.upsert({
      where: {
        essayId_similarToId: {
          essayId: similarity.essayId,
          similarToId: similarity.similarToId,
        },
      },
      create: {
        essayId: similarity.essayId,
        similarToId: similarity.similarToId,
        score: similarity.score,
        reason: similarity.reason,
      },
      update: {
        score: similarity.score,
        reason: similarity.reason,
        computedAt: new Date(),
      },
    });
  }
}

/**
 * Get similar essays for a given essay
 */
export async function getSimilarEssays(
  essayId: string,
  limit: number = 5
): Promise<SimilarityResult[]> {
  const similarities = await prisma.essaySimilarity.findMany({
    where: { essayId },
    orderBy: { score: 'desc' },
    take: limit,
    include: {
      similarTo: {
        select: {
          id: true,
          essayPrompt: true,
          essay: true,
          wasAwarded: true,
          createdAt: true,
        },
      },
    },
  });

  return similarities.map((s) => ({
    essayId: s.essayId,
    similarToId: s.similarToId,
    score: s.score,
    reason: s.reason ?? undefined,
  }));
}

/**
 * Batch compute similarities for all user essays
 * Useful for initial setup or periodic refresh
 */
export async function computeAllSimilaritiesForUser(userId: string): Promise<void> {
  console.log(`🔄 Computing all similarities for user ${userId}...`);

  const essays = await prisma.essay.findMany({
    where: { userId },
    select: { id: true },
  });

  for (const essay of essays) {
    try {
      await computeSimilarity(essay.id, userId);
      // Small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Error computing similarities for essay ${essay.id}:`, error);
    }
  }

  console.log(`✅ Completed similarity computation for user ${userId}`);
}

/**
 * Find most relevant past essay for a scholarship
 * Combines similarity scores with awarded status
 */
export async function findMostRelevantEssay(
  userId: string,
  scholarshipQuery: string
): Promise<EssayWithEmbedding | null> {
  // This would use vector search to find essays similar to the scholarship
  // For now, return the most recently awarded essay
  const awardedEssay = await prisma.essay.findFirst({
    where: {
      userId,
      wasAwarded: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return awardedEssay;
}

/**
 * Get similarity statistics for a user's essays
 */
export async function getSimilarityStats(userId: string) {
  const totalEssays = await prisma.essay.count({
    where: { userId },
  });

  const awardedEssays = await prisma.essay.count({
    where: { userId, wasAwarded: true },
  });

  const totalSimilarities = await prisma.essaySimilarity.count({
    where: {
      essay: { userId },
    },
  });

  return {
    totalEssays,
    awardedEssays,
    totalSimilarities,
    avgSimilaritiesPerEssay: totalEssays > 0 ? totalSimilarities / totalEssays : 0,
  };
}
