/**
 * Essay Generation API Endpoint
 * Generates AI-powered essay drafts using RAG
 * POST /api/essays/generate
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { generateEssay } from "~/lib/essay-generation.server";

interface GenerateEssayRequest {
  applicationId: string;
  approach?: "narrative" | "analytical" | "creative" | "persuasive";
}

export async function action({ request }: ActionFunctionArgs) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Authenticate user
    const userId = await requireUserId(request);

    // Parse request body
    const body = await request.json();
    const { applicationId, approach }: GenerateEssayRequest = body;

    // Validation
    if (!applicationId) {
      return json(
        { error: "applicationId is required" },
        { status: 400 }
      );
    }

    // Validate approach if provided
    if (approach && !["narrative", "analytical", "creative", "persuasive"].includes(approach)) {
      return json(
        { error: "Invalid approach. Must be one of: narrative, analytical, creative, persuasive" },
        { status: 400 }
      );
    }

    // Fetch application with scholarship details
    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        userId,
      },
      include: {
        scholarship: true,
      },
    });

    // Verify application exists and belongs to user
    if (!application) {
      return json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Generate the essay draft
    const draft = await generateEssay(application, { approach });

    // Return the generated draft
    return json({
      draftId: draft.id,
      version: draft.version,
      content: draft.content,
      sources: draft.sources,
      approach: draft.approach,
      status: draft.status,
      createdAt: draft.createdAt,
    });
  } catch (error) {
    console.error("Essay generation API error:", error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes("No relevant past essays found")) {
        return json(
          { error: "No relevant past essays found. Please upload some essays first." },
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
      { error: "Failed to generate essay. Please try again." },
      { status: 500 }
    );
  }
}
