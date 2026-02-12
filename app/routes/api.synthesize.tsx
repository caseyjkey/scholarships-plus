/**
 * Synthesis API Endpoint
 *
 * POST /api/synthesize
 *
 * Generates a synthesized essay response for a scholarship application field.
 * Combines user's persona profile with relevant past experiences.
 *
 * Returns:
 * - 202 if persona profile not ready (still generating)
 * - 400 if missing required fields
 * - 401 if unauthorized
 * - 200 with synthesized response on success
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import {
  generateSynthesis,
  saveSynthesizedResponse,
  findPastResponses,
  type SynthesisRequest,
} from "~/lib/synthesis.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Verify authentication
    const userId = await requireUserId(request);

    // Parse request body
    const body = await request.json();
    const {
      fieldId,
      fieldLabel,
      essayPrompt,
      scholarshipTitle,
      wordLimit,
    } = body as Partial<SynthesisRequest>;

    // Validation
    if (!fieldId) {
      return json({ error: "Missing required field: fieldId" }, { status: 400 });
    }

    if (!fieldLabel) {
      return json({ error: "Missing required field: fieldLabel" }, { status: 400 });
    }

    if (!essayPrompt) {
      return json({ error: "Missing required field: essayPrompt" }, { status: 400 });
    }

    if (!scholarshipTitle) {
      return json({ error: "Missing required field: scholarshipTitle" }, { status: 400 });
    }

    // Check persona profile readiness
    const profile = await prisma.personaProfile.findUnique({
      where: { userId },
      select: {
        status: true,
        progress: true,
        errorMessage: true,
      },
    });

    if (!profile) {
      return json({
        error: "Persona profile not found. Please upload essays to generate your profile.",
        profileStatus: "not_found",
      }, { status: 202 });
    }

    if (profile.status === "generating") {
      return json({
        error: "Your profile is still being generated. Please wait...",
        profileStatus: "generating",
        progress: profile.progress,
      }, { status: 202 });
    }

    if (profile.status === "failed") {
      return json({
        error: `Profile generation failed: ${profile.errorMessage || "Unknown error"}`,
        profileStatus: "failed",
      }, { status: 500 });
    }

    if (profile.status !== "ready") {
      return json({
        error: "Profile is not ready. Please upload more essays.",
        profileStatus: profile.status,
      }, { status: 202 });
    }

    // Generate synthesis
    const synthesis = await generateSynthesis({
      userId,
      fieldId,
      fieldLabel,
      essayPrompt,
      scholarshipTitle,
      wordLimit,
    });

    // Save synthesized response to GlobalKnowledge
    await saveSynthesizedResponse({
      userId,
      fieldId,
      fieldLabel,
      content: synthesis.content,
      promptType: synthesis.promptType,
      styleUsed: synthesis.styleUsed,
      sources: synthesis.sources,
      wordCount: synthesis.wordCount,
    });

    // Find past responses for history panel
    const pastResponses = await findPastResponses(userId, fieldLabel);

    return json({
      success: true,
      synthesis: {
        content: synthesis.content,
        wordCount: synthesis.wordCount,
        promptType: synthesis.promptType,
        sources: synthesis.sources,
        styleUsed: synthesis.styleUsed,
      },
      pastResponses,
    });
  } catch (error) {
    console.error("[Synthesis API] Error:", error);

    if (error instanceof Error) {
      // Check for persona not ready error
      if (error.message.includes("not ready") || error.message.includes("upload more essays")) {
        return json({
          error: error.message,
          profileStatus: "not_ready",
        }, { status: 202 });
      }

      return json({ error: error.message }, { status: 500 });
    }

    return json({ error: "Internal server error" }, { status: 500 });
  }
};
