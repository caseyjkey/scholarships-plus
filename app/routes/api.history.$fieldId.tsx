/**
 * Field History API Endpoint
 *
 * GET /api/history/:fieldId
 *
 * Returns historical responses for a specific field.
 * Groups responses into three panels:
 * 1. Synthesized (current AI-generated response)
 * 2. Last Year (responses from the past year)
 * 3. Older (responses older than one year)
 *
 * Used by the extension's history modal.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  try {
    // Verify authentication
    const userId = await requireUserId(request);

    // Get fieldId from URL params
    const { fieldId } = params;
    if (!fieldId) {
      return json({ error: "Missing fieldId parameter" }, { status: 400 });
    }

    // Define one year ago for grouping
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Fetch all relevant responses for this field
    const allResponses = await prisma.globalKnowledge.findMany({
      where: {
        userId,
        OR: [
          { type: "synthesized_response" },
          { type: "past_synthesis" },
          { type: "essay_response" },
        ],
        // Filter by fieldId in metadata
        metadata: {
          path: ["fieldId"],
          equals: fieldId,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Limit to 50 most recent
    });

    // Group responses by category
    const synthesizedResponses: any[] = [];
    const lastYear: any[] = [];
    const older: any[] = [];

    for (const response of allResponses) {
      const metadata = response.metadata as any;
      const createdAt = response.createdAt;

      const responseData = {
        id: response.id,
        content: response.content,
        type: response.type,
        category: response.category,
        promptType: metadata?.promptType,
        wordCount: metadata?.wordCount,
        sources: metadata?.sources || [],
        styleUsed: metadata?.styleUsed,
        createdAt: createdAt.toISOString(),
        generatedAt: metadata?.generatedAt,
      };

      // Current synthesized response (most recent, not archived)
      if (response.type === "synthesized_response") {
        synthesizedResponses.push(responseData);
      }
      // Past responses grouped by age
      else if (response.type === "past_synthesis" || response.type === "essay_response") {
        if (createdAt > oneYearAgo) {
          lastYear.push(responseData);
        } else {
          older.push(responseData);
        }
      }
    }

    // Get persona profile status
    const profile = await prisma.personaProfile.findUnique({
      where: { userId },
      select: {
        status: true,
        progress: true,
      },
    });

    // Get field info for context
    const fieldMapping = await prisma.fieldMapping.findFirst({
      where: {
        userId,
        fieldName: fieldId,
      },
      select: {
        fieldLabel: true,
        fieldType: true,
      },
    });

    // Combine last year and older into prior responses
    const priorResponses = [...lastYear, ...older];

    // Get most recent synthesized response (if any)
    const synthesized = synthesizedResponses.length > 0 ? synthesizedResponses[0] : null;

    return json({
      fieldId,
      fieldLabel: fieldMapping?.fieldLabel || null,
      fieldType: fieldMapping?.fieldType || null,
      profileStatus: profile?.status || "not_found",
      profileProgress: profile?.progress || 0,
      synthesized,
      priorResponses,
      synthesizedHistory: synthesizedResponses.slice(1), // Any additional synthesized responses
      hasContent: synthesizedResponses.length > 0 || priorResponses.length > 0,
    });
  } catch (error) {
    console.error("[History API] Error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    return json({ error: "Failed to fetch field history" }, { status: 500 });
  }
};
