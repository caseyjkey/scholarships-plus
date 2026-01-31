/**
 * API Routes for Application Context Management
 *
 * GET /api/applications/:id/context - Get all context for an application
 * PUT /api/applications/:id/context - Update context (add draft, update status)
 * DELETE /api/applications/:id/context/:sectionId - Remove context
 */

import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

/**
 * GET /api/applications/:id/context
 * Returns all application context with knowledge references
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const applicationId = params.id;

  // Verify ownership
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
  });

  if (!application) {
    return json({ error: "Application not found" }, { status: 404 });
  }

  // Get all context for this application
  const context = await prisma.applicationContext.findMany({
    where: { applicationId },
    orderBy: { createdAt: "asc" },
  });

  // Get referenced global knowledge details
  const referencedKnowledgeIds = new Set<string>();
  context.forEach((c) => {
    (c.referencedGlobalKnowledge as string[] || []).forEach((id) =>
      referencedKnowledgeIds.add(id)
    );
  });

  const referencedKnowledge =
    referencedKnowledgeIds.size > 0
      ? await prisma.globalKnowledge.findMany({
          where: {
            id: { in: Array.from(referencedKnowledgeIds) },
          },
        })
      : [];

  return json({
    context,
    referencedKnowledge,
  });
};

/**
 * PUT /api/applications/:id/context
 * Updates or creates application context
 * Body: { sectionId, questionSummary, responseDraft, referencedGlobalKnowledge, themes, tone, status }
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const applicationId = params.id;
  const body = await request.json();

  // Verify ownership
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
  });

  if (!application) {
    return json({ error: "Application not found" }, { status: 404 });
  }

  const {
    sectionId,
    sectionType,
    questionSummary,
    responseDraft,
    referencedGlobalKnowledge,
    themes,
    tone,
    status,
    userFeedback,
  } = body;

  try {
    // Upsert context
    const context = await prisma.applicationContext.upsert({
      where: {
        applicationId_sectionId: {
          applicationId,
          sectionId,
        },
      },
      create: {
        userId,
        applicationId,
        sectionId,
        sectionType: sectionType || "text",
        questionSummary,
        responseDraft,
        referencedGlobalKnowledge: referencedGlobalKnowledge || [],
        themes: themes || [],
        tone,
        status: status || "draft",
        userFeedback,
      },
      update: {
        questionSummary,
        responseDraft,
        referencedGlobalKnowledge: referencedGlobalKnowledge || [],
        themes: themes || [],
        tone,
        status: status || undefined,
        userFeedback,
      },
    });

    // Update global knowledge usage tracking
    if (referencedGlobalKnowledge && referencedGlobalKnowledge.length > 0) {
      await prisma.globalKnowledge.updateMany({
        where: {
          id: { in: referencedGlobalKnowledge },
        },
        data: {
          useCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    }

    return json({ context });
  } catch (error: any) {
    console.error("Context update error:", error);
    return json(
      { error: "Failed to update context", details: error.message },
      { status: 500 }
    );
  }
};
