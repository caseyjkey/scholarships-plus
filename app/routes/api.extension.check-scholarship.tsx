/**
 * API Routes for Chrome Extension Integration
 *
 * GET /api/extension/check-scholarship - Check if URL matches a known scholarship
 * POST /api/extension/sync-cookies - Sync cookies from extension
 * GET /api/extension/field-mappings/:scholarshipId - Get field mappings
 * POST /api/extension/field-mapping - Save/update a field mapping
 * POST /api/extension/knowledge - Add to global knowledge base
 * POST /api/extension/chat - Agent chat with semantic knowledge search
 */

import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

/**
 * GET /api/extension/check-scholarship
 * Check if a URL matches a known scholarship
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);

  const applicationUrl = url.searchParams.get("url");
  const portal = url.searchParams.get("portal");

  if (!applicationUrl) {
    return json({ known: false }, { status: 400 });
  }

  try {
    // Find matching scholarship by application URL
    // Note: ScrapedScholarship doesn't have userId, it's shared across users
    const scholarship = await prisma.scrapedScholarship.findFirst({
      where: {
        applicationUrl,
      },
      include: {
        fieldMappings: {
          where: {
            userId,
            approved: true
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!scholarship) {
      return json({ known: false });
    }

    // Get the application ID if it exists
    const application = await prisma.application.findFirst({
      where: {
        scholarshipId: scholarship.id,
        userId,
      },
    });

    return json({
      known: true,
      scholarship: {
        id: scholarship.id,
        title: scholarship.title,
        portal: scholarship.portal,
        applicationId: application?.id,
      },
      fieldMappings: scholarship.fieldMappings,
    });
  } catch (error) {
    console.error("Error checking scholarship:", error);
    return json({ known: false, error: "Failed to check scholarship" }, { status: 500 });
  }
};
