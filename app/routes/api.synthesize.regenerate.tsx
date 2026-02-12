/**
 * Synthesis Regenerate API Endpoint
 *
 * POST /api/synthesize/regenerate
 *
 * Regenerates a synthesized response with style overrides.
 * Moves the old version to "past_synthesis" type for history.
 *
 * Allows users to adjust:
 * - Tone (e.g., more formal, more conversational)
 * - Voice (e.g., more confident, more humble)
 * - Complexity (e.g., simple, moderate, sophisticated)
 * - Focus (e.g., story-driven, achievement-oriented)
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import {
  generateSynthesis,
  saveSynthesizedResponse,
  type SynthesisRequest,
  type StyleOverrides,
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
      styleOverrides,
      currentSynthesisId, // ID of current synthesis to move to history
    } = body as Partial<SynthesisRequest & { currentSynthesisId?: string }>;

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

    if (!styleOverrides) {
      return json({ error: "Missing required field: styleOverrides" }, { status: 400 });
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

    if (!profile || profile.status !== "ready") {
      return json({
        error: "Persona profile not ready. Cannot regenerate.",
        profileStatus: profile?.status || "not_found",
      }, { status: 400 });
    }

    // Move old synthesis to history if provided
    if (currentSynthesisId) {
      try {
        await prisma.globalKnowledge.update({
          where: { id: currentSynthesisId },
          data: {
            type: "past_synthesis",
            metadata: {
              // Preserve existing metadata and add regeneration info
              ...(await prisma.globalKnowledge.findUnique({
                where: { id: currentSynthesisId },
                select: { metadata: true },
              })).metadata,
              regeneratedAt: new Date().toISOString(),
              regeneratedReason: "style_override",
            },
          },
        });
        console.log(`[Regenerate] Moved previous synthesis to history: ${currentSynthesisId}`);
      } catch (error) {
        console.warn("[Regenerate] Could not move old synthesis to history:", error);
        // Continue anyway - this is not critical
      }
    }

    // Generate new synthesis with style overrides
    const synthesis = await generateSynthesis({
      userId,
      fieldId,
      fieldLabel,
      essayPrompt,
      scholarshipTitle,
      wordLimit,
      styleOverrides: styleOverrides as StyleOverrides,
    });

    // Save new synthesized response
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

    return json({
      success: true,
      synthesis: {
        content: synthesis.content,
        wordCount: synthesis.wordCount,
        promptType: synthesis.promptType,
        sources: synthesis.sources,
        styleUsed: synthesis.styleUsed,
      },
      previousMovedToHistory: !!currentSynthesisId,
    });
  } catch (error) {
    console.error("[Regenerate API] Error:", error);

    if (error instanceof Error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ error: "Internal server error" }, { status: 500 });
  }
};
