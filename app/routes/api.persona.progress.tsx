/**
 * Persona Progress Polling API
 *
 * GET /api/persona/progress
 *
 * Returns the current status and progress of persona profile generation
 * Used by the extension to show progress banner
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const userId = await requireUserId(request);

    const profile = await prisma.personaProfile.findUnique({
      where: { userId },
      select: {
        status: true,
        progress: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true,
        sourceEssayCount: true,
        totalWords: true,
      },
    });

    if (!profile) {
      return json({
        status: "not_started",
        progress: 0,
      });
    }

    return json(profile);
  } catch (error) {
    console.error("Persona progress check error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    return json({ error: "Failed to fetch persona progress" }, { status: 500 });
  }
};
