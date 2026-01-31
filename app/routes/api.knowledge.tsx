/**
 * API Routes for Global Knowledge Management
 *
 * These endpoints allow managing the user's global knowledge base:
 * - Retrieving knowledge with optional filtering
 * - Adding new knowledge items
 * - Updating/verifying knowledge (during interview)
 * - Semantic search for similar knowledge
 * - Managing application-specific context
 */

import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * GET /api/knowledge
 * Returns user's global knowledge base with optional filtering
 * Query params: type, category, verified, minConfidence
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);

  const type = url.searchParams.get("type");
  const category = url.searchParams.get("category");
  const verified = url.searchParams.get("verified");
  const minConfidence = url.searchParams.get("minConfidence");
  const search = url.searchParams.get("search"); // Text search

  const where: any = { userId };

  if (type) where.type = type;
  if (category) where.category = category;
  if (verified !== null) where.verified = verified === "true";
  if (minConfidence) where.confidence = { gte: parseFloat(minConfidence) };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  const knowledge = await prisma.globalKnowledge.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
  });

  return json({ knowledge });
};

/**
 * POST /api/knowledge
 * Adds a new knowledge item to the global knowledge base
 * Body: { type, category, title, content, confidence? }
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const method = request.method;

  // POST: Add new knowledge
  if (method === "POST") {
    const body = await request.json();
    const { type, category, title, content, confidence = 0.5 } = body;

    if (!type || !title || !content) {
      return json(
        { error: "Missing required fields: type, title, content" },
        { status: 400 }
      );
    }

    try {
      // Generate embedding
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: `${title}: ${content}`,
      });

      const knowledge = await prisma.globalKnowledge.create({
        data: {
          userId,
          type,
          category,
          title,
          content,
          confidence,
          source: "manual_entry",
          verified: false,
          embedding: embeddingResponse.data[0].embedding as any,
        },
      });

      return json({ knowledge }, { status: 201 });
    } catch (error: any) {
      return json(
        { error: "Failed to create knowledge", details: error.message },
        { status: 500 }
      );
    }
  }

  // PUT: Update knowledge (verify during interview)
  if (method === "PUT") {
    const body = await request.json();
    const { id, title, content, verified, confidence } = body;

    if (!id) {
      return json({ error: "Missing knowledge id" }, { status: 400 });
    }

    try {
      // Verify ownership
      const existing = await prisma.globalKnowledge.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return json({ error: "Knowledge not found" }, { status: 404 });
      }

      // Update
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (verified !== undefined) updateData.verified = verified;
      if (confidence !== undefined) updateData.confidence = confidence;

      // Regenerate embedding if content changed
      if (content !== undefined || title !== undefined) {
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: `${title || existing.title}: ${content || existing.content}`,
        });
        updateData.embedding = embeddingResponse.data[0].embedding as any;
      }

      const knowledge = await prisma.globalKnowledge.update({
        where: { id },
        data: updateData,
      });

      return json({ knowledge });
    } catch (error: any) {
      return json(
        { error: "Failed to update knowledge", details: error.message },
        { status: 500 }
      );
    }
  }

  // DELETE: Remove knowledge
  if (method === "DELETE") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return json({ error: "Missing knowledge id" }, { status: 400 });
    }

    try {
      // Verify ownership
      const existing = await prisma.globalKnowledge.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return json({ error: "Knowledge not found" }, { status: 404 });
      }

      await prisma.globalKnowledge.delete({
        where: { id },
      });

      return json({ success: true });
    } catch (error: any) {
      return json(
        { error: "Failed to delete knowledge", details: error.message },
        { status: 500 }
      );
    }
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};
