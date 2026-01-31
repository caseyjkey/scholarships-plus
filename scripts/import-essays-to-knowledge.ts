#!/usr/bin/env tsx
/**
 * Import User Essays to Global Knowledge Base
 *
 * This script reads a user's past essays and extracts structured knowledge
 * to build their global knowledge base for use in application interviews.
 *
 * Usage:
 *   npx tsx scripts/import-essays-to-knowledge.ts <user-email>
 */

import { prisma } from "../app/db.server.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ExtractedKnowledge {
  type: "experience" | "skill" | "achievement" | "value" | "goal";
  category?: string;
  title: string;
  content: string;
  confidence: number;
  sourceEssay: string;
}

/**
 * Extract knowledge from a single essay using LLM
 */
async function extractKnowledgeFromEssay(
  essay: { id: string; essayPrompt: string; body: string; essay: string }
): Promise<ExtractedKnowledge[]> {
  const prompt = `
You are analyzing a scholarship essay to extract knowledge about the applicant.

ESSAY PROMPT:
${essay.essayPrompt}

ESSAY RESPONSE:
${essay.body || essay.essay}

Extract the following types of knowledge. For each, provide:
1. type: "experience", "skill", "achievement", "value", or "goal"
2. category: A grouping (e.g., "leadership", "community_service", "academic")
3. title: A concise title
4. content: Full details with context
5. confidence: How certain you are this is accurate (0.1-1.0)

IMPORTANT:
- Extract SPECIFIC facts, not generalizations
- Include numbers, dates, roles, and details
- For experiences: what they did, where, when, impact
- For skills: specific technical or soft skills demonstrated
- For achievements: awards, recognition, metrics
- For values: what matters to them, principles
- For goals: aspirations, future plans

Return as JSON object with a "knowledge" array containing all extracted items:
{
  "knowledge": [
    {
      "type": "experience",
      "category": "leadership",
      "title": "Food bank volunteer coordinator",
      "content": "Coordinated 15 volunteers at local food bank from 2022-2024. Increased food distribution by 40% through new scheduling system.",
      "confidence": 0.9
    }
  ]
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert at analyzing personal essays to extract structured knowledge about applicants.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");

  // Handle both formats: array directly or wrapped in object
  const knowledgeArray = Array.isArray(result) ? result : (result.knowledge || []);

  // Add source essay ID to each extracted item
  const knowledge: ExtractedKnowledge[] = knowledgeArray.map((item: any) => ({
    ...item,
    sourceEssay: essay.id,
  }));

  return knowledge;
}

/**
 * Generate embedding for knowledge content
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Import essays to global knowledge base
 */
async function importEssaysToKnowledge(userEmail: string) {
  console.log(`🔍 Finding user: ${userEmail}`);

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: {
      essays: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    console.error(`❌ User not found: ${userEmail}`);
    return;
  }

  console.log(`✅ Found user with ${user.essays.length} essay(s)`);

  if (user.essays.length === 0) {
    console.log("⚠️  No essays found to import");
    return;
  }

  let totalExtracted = 0;
  let totalStored = 0;

  for (const essay of user.essays) {
    console.log(`\n📝 Processing essay: ${essay.essayPrompt.substring(0, 50)}...`);

    try {
      // Extract knowledge using LLM
      const knowledgeItems = await extractKnowledgeFromEssay(essay);
      totalExtracted += knowledgeItems.length;

      console.log(`   Extracted ${knowledgeItems.length} knowledge items`);

      // Store each knowledge item
      for (const item of knowledgeItems) {
        try {
          // Generate embedding
          const embedding = await generateEmbedding(
            `${item.title}: ${item.content}`
          );

          // Create record with Prisma (auto-generates CUID)
          const knowledge = await prisma.globalKnowledge.create({
            data: {
              userId: user.id,
              type: item.type,
              category: item.category,
              title: item.title,
              content: item.content,
              source: "essay",
              sourceEssay: item.sourceEssay,
              confidence: item.confidence,
              verified: false,
              useCount: 0,
            },
          });

          // Update embedding separately using raw SQL
          await prisma.$executeRaw`
            UPDATE "GlobalKnowledge"
            SET embedding = ${JSON.stringify(embedding)}::vector(1536)
            WHERE id = ${knowledge.id}
          `;

          totalStored++;
          console.log(`   ✓ Stored: ${item.title}`);
        } catch (error) {
          console.error(`   ✗ Failed to store: ${item.title}`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to process essay`, error);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Essays processed: ${user.essays.length}`);
  console.log(`   Knowledge extracted: ${totalExtracted}`);
  console.log(`   Knowledge stored: ${totalStored}`);
  console.log(`\n✅ Import complete!`);
}

// Get email from command line
const userEmail = process.argv[2];

if (!userEmail) {
  console.error("Usage: npx tsx scripts/import-essays-to-knowledge.ts <user-email>");
  console.error("Example: npx tsx scripts/import-essays-to-knowledge.ts user@example.com");
  process.exit(1);
}

importEssaysToKnowledge(userEmail)
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
