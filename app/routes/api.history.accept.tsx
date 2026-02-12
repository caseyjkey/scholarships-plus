/**
 * Accept Synthesized Response API Endpoint
 *
 * POST /api/history/accept
 *
 * Accepts a synthesized response and saves it as the approved field value.
 * This triggers the extension to autofill the field and show a burst animation.
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Verify authentication
    const userId = await requireUserId(request);

    // Parse request body
    const body = await request.json();
    const { synthesisId, fieldId, scholarshipId } = body;

    // Validation
    if (!synthesisId) {
      return json({ error: "Missing required field: synthesisId" }, { status: 400 });
    }

    if (!fieldId) {
      return json({ error: "Missing required field: fieldId" }, { status: 400 });
    }

    if (!scholarshipId) {
      return json({ error: "Missing required field: scholarshipId" }, { status: 400 });
    }

    // Fetch the synthesized response
    const synthesis = await prisma.globalKnowledge.findUnique({
      where: { id: synthesisId },
    });

    if (!synthesis) {
      return json({ error: "Synthesized response not found" }, { status: 404 });
    }

    // Verify ownership
    if (synthesis.userId !== userId) {
      return json({ error: "Unauthorized" }, { status: 403 });
    }

    // Verify it's a synthesized response
    if (synthesis.type !== "synthesized_response") {
      return json({ error: "Not a synthesized response" }, { status: 400 });
    }

    // Get metadata
    const metadata = synthesis.metadata as any;
    const fieldLabel = metadata?.fieldLabel || fieldId;

    // Find or create FieldMapping
    const fieldMapping = await prisma.fieldMapping.upsert({
      where: {
        scholarshipId_fieldName: {
          scholarshipId,
          fieldName: fieldId,
        },
      },
      create: {
        scholarshipId,
        userId,
        fieldName: fieldId,
        fieldLabel,
        fieldType: metadata?.fieldType || "textarea",
        approvedValue: synthesis.content,
        approved: true,
        approvedAt: new Date(),
        source: "agent",
      },
      update: {
        approvedValue: synthesis.content,
        approved: true,
        approvedAt: new Date(),
        fieldLabel, // Update label in case it changed
      },
    });

    // Save to ApplicationContext for record-keeping
    // First check if an application exists for this scholarship
    const application = await prisma.application.findFirst({
      where: {
        userId,
        scrapedScholarshipId: scholarshipId,
      },
    });

    if (application) {
      // Create or update ApplicationContext
      await prisma.applicationContext.upsert({
        where: {
          applicationId_sectionId: {
            applicationId: application.id,
            sectionId: fieldId,
          },
        },
        create: {
          applicationId: application.id,
          sectionId: fieldId,
          sectionType: metadata?.fieldType || "textarea",
          questionSummary: fieldLabel,
          responseDraft: synthesis.content,
          source: "synthesized",
          styleUsed: metadata?.styleUsed,
          themes: [], // Will be populated during analysis
          tone: metadata?.styleUsed?.tone,
          referencedGlobalKnowledge: [synthesisId],
        },
        update: {
          responseDraft: synthesis.content,
          source: "synthesized",
          styleUsed: metadata?.styleUsed,
          tone: metadata?.styleUsed?.tone,
          referencedGlobalKnowledge: [synthesisId],
          updatedAt: new Date(),
        },
      });
    }

    // Mark synthesis as verified in GlobalKnowledge
    await prisma.globalKnowledge.update({
      where: { id: synthesisId },
      data: {
        verified: true,
        metadata: {
          ...metadata,
          acceptedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`[Accept] User accepted synthesis for field "${fieldLabel}"`);

    return json({
      success: true,
      fieldMapping: {
        id: fieldMapping.id,
        fieldId: fieldMapping.fieldName,
        fieldLabel: fieldMapping.fieldLabel,
        approvedValue: fieldMapping.approvedValue,
      },
      synthesis: {
        id: synthesis.id,
        content: synthesis.content,
        wordCount: metadata?.wordCount,
      },
    });
  } catch (error) {
    console.error("[Accept API] Error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    return json({ error: "Failed to accept response" }, { status: 500 });
  }
};
