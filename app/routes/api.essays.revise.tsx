/**
 * Essay Revision API Endpoint
 * Generates revised versions of essay drafts based on user feedback
 * POST /api/essays/revise
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { reviseEssay } from "~/lib/essay-generation.server";

interface ReviseEssayRequest {
  draftId: string;
  feedback: string;
}

export async function action({ request }: ActionFunctionArgs) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await requireUserId(request);

    // Parse request body
    const body = await request.json();
    const { draftId, feedback }: ReviseEssayRequest = body;

    // Validation
    if (!draftId) {
      return json({ error: "draftId is required" }, { status: 400 });
    }

    if (!feedback || feedback.trim().length === 0) {
      return json({ error: "Feedback is required" }, { status: 400 });
    }

    // Fetch the draft with application details to verify ownership
    const draft = await prisma.essayDraft.findUnique({
      where: { id: draftId },
      include: {
        application: {
          include: {
            scholarship: true,
          },
        },
      },
    });

    // Verify draft exists and user owns it
    if (!draft) {
      return json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.application.userId !== userId) {
      return json({ error: "Unauthorized" }, { status: 403 });
    }

    // Generate the revised essay
    const revisedDraft = await reviseEssay(draftId, feedback);

    return json({
      draftId: revisedDraft.id,
      version: revisedDraft.version,
      content: revisedDraft.content,
      status: revisedDraft.status,
      createdAt: revisedDraft.createdAt,
    });
  } catch (error) {
    console.error("Essay revision API error:", error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes("No relevant past essays found")) {
        return json(
          { error: "Cannot revise: No relevant past essays found." },
          { status: 400 }
        );
      }

      if (error.message.includes("GLM_API_KEY")) {
        return json(
          { error: "AI service is not configured. Please contact support." },
          { status: 503 }
        );
      }
    }

    // Generic error
    return json(
      { error: "Failed to revise draft. Please try again." },
      { status: 500 }
    );
  }
}
