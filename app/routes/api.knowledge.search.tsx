/**
 * API Routes for Knowledge Search and Application Context
 *
 * These endpoints provide:
 * - Semantic search for similar knowledge (using pgvector)
 * - Application-specific context management
 * - Auto-context building for indexed scholarships
 */

import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * GET /api/knowledge/search
 * Semantic search for similar knowledge using pgvector
 * Query params: q (query text), type?, category?, limit?
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);

  const query = url.searchParams.get("q");
  const type = url.searchParams.get("type");
  const category = url.searchParams.get("category");
  const limit = parseInt(url.searchParams.get("limit") || "10");

  if (!query) {
    return json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  try {
    // Generate embedding for query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Build WHERE clause
    const where: any = { userId };
    if (type) where.type = type;
    if (category) where.category = category;

    // Use raw SQL for vector similarity search
    const embeddingStr = JSON.stringify(queryEmbedding);
    const results = await prisma.$queryRaw`
      SELECT
        id,
        type,
        category,
        title,
        content,
        confidence,
        verified,
        source,
        "useCount",
        "createdAt",
        (embedding <#> ${embeddingStr}::vector) AS similarity
      FROM "GlobalKnowledge"
      WHERE "userId" = ${userId}
        ${type ? prisma.$queryRawUnsafe`AND type = ${type}` : prisma.$queryRawUnsafe``}
        ${category ? prisma.$queryRawUnsafe`AND category = ${category}` : prisma.$queryRawUnsafe``}
        AND embedding IS NOT NULL
      ORDER BY (embedding <#> ${embeddingStr}::vector) ASC
      LIMIT ${limit}
    ` as any[];

    return json({
      results,
      query,
    });
  } catch (error: any) {
    console.error("Semantic search error:", error);
    return json(
      { error: "Search failed", details: error.message },
      { status: 500 }
    );
  }
};

/**
 * POST /api/knowledge/search
 * Auto-build application context for a scholarship
 * Body: { applicationId, scholarshipId }
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const body = await request.json();
  const { applicationId, scholarshipId } = body;

  if (!applicationId && !scholarshipId) {
    return json(
      { error: "Missing applicationId or scholarshipId" },
      { status: 400 }
    );
  }

  try {
    let applicationId_final = applicationId;

    // If only scholarshipId provided, find or create application
    if (scholarshipId && !applicationId) {
      let application = await prisma.application.findFirst({
        where: {
          userId,
          scrapedScholarshipId: scholarshipId,
        },
      });

      if (!application) {
        application = await prisma.application.create({
          data: {
            userId,
            scrapedScholarshipId: scholarshipId,
            status: "draft",
          },
        });
      }

      applicationId_final = application.id;
    }

    // Get the scholarship with application sections
    const application = await prisma.application.findUnique({
      where: { id: applicationId_final },
      include: {
        scrapedScholarship: {
          select: {
            title: true,
            applicationSections: true,
          },
        },
      },
    });

    if (!application || !application.scrapedScholarship) {
      return json({ error: "Application or scholarship not found" }, { status: 404 });
    }

    const sections = application.scrapedScholarship.applicationSections;
    if (!sections) {
      return json({ error: "Scholarship not fully indexed yet" }, { status: 400 });
    }

    // Build context for each section
    const contextResults = [];

    for (const section of sections) {
      // Skip if context already exists
      const existing = await prisma.applicationContext.findFirst({
        where: {
          applicationId: applicationId_final,
          sectionId: section.id || `section_${Math.random().toString(36).substr(2, 9)}`,
        },
      });

      if (existing) {
        contextResults.push(existing);
        continue;
      }

      // Get question/prompt
      const question = section.question || section.label || "";
      const questionSummary = question.substring(0, 500);

      // Semantic search for relevant global knowledge
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: question,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search for similar knowledge
      const embeddingStr = JSON.stringify(queryEmbedding);
      const similarKnowledge = await prisma.$queryRaw`
        SELECT id, type, title, content
        FROM "GlobalKnowledge"
        WHERE "userId" = ${userId}
          AND embedding IS NOT NULL
        ORDER BY (embedding <#> ${embeddingStr}::vector) ASC
        LIMIT 5
      ` as any[];

      // Analyze gaps
      const hasGlobalKnowledge = (similarKnowledge as any[]).length > 0;
      const avgConfidence =
        hasGlobalKnowledge && (similarKnowledge as any[])[0]?.similarity < 0.3
          ? false
          : hasGlobalKnowledge;

      // Create application context
      const context = await prisma.applicationContext.create({
        data: {
          userId,
          applicationId: applicationId_final,
          sectionId: section.id || `section_${Date.now()}`,
          sectionType: section.type || "text",
          questionSummary,
          status: "draft",
        },
      });

      contextResults.push({
        ...context,
        hasGlobalKnowledge,
        similarKnowledge: similarKnowledge || [],
      });
    }

    return json({
      applicationId: applicationId_final,
      context: contextResults,
    });
  } catch (error: any) {
    console.error("Auto-build context error:", error);
    return json(
      { error: "Failed to build context", details: error.message },
      { status: 500 }
    );
  }
};
