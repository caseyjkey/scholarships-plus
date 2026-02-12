/**
 * Persona Generation Trigger API
 *
 * POST /api/persona/generate
 *
 * Triggers background persona profile generation for the authenticated user.
 * Returns 409 if generation is already in progress.
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { generatePersonaProfileBackground } from "~/lib/persona-generation.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await requireUserId(request);

    // Check if already generating (avoid duplicate jobs)
    const existing = await prisma.personaProfile.findUnique({
      where: { userId },
      select: { status: true },
    });

    if (existing?.status === "generating") {
      return json(
        {
          success: false,
          message: "Persona generation is already in progress",
          status: existing.status,
        },
        { status: 409 } // Conflict
      );
    }

    // Validation requirement: Prevent re-generation of ready personas without force flag
    // For now, we allow regeneration (can add force parameter later if needed)

    // Trigger background job (fire-and-forget pattern)
    generatePersonaProfileBackground(userId).catch((error) => {
      console.error("Persona generation background job failed:", error);
      // Don't fail the request if background job fails
    });

    return json({
      success: true,
      message: "Persona generation started",
      status: "generating",
    });
  } catch (error) {
    console.error("Persona generation trigger error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    return json({ error: "Failed to start persona generation" }, { status: 500 });
  }
};
