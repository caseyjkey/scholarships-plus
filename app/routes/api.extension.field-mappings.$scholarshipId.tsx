/**
 * GET /api/extension/field-mappings/:scholarshipId
 * Get field mappings for a scholarship
 */

import { LoaderFunctionArgs, json } from "@remix-run/node";
import { prisma } from "~/db.server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Verify JWT token and return userId
 */
function verifyExtensionToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;

  try {
    const decoded = jwt.verify(match[1], JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  // Verify JWT token from extension
  const authHeader = request.headers.get("Authorization");
  const userId = verifyExtensionToken(authHeader);

  if (!userId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const scholarshipId = params.scholarshipId;

  if (!scholarshipId) {
    return json({ mappings: [] });
  }

  try {
    // Get application for this scholarship if exists
    const application = await prisma.application.findFirst({
      where: {
        scrapedScholarshipId: scholarshipId,
        userId,
      },
    });

    const mappings = await prisma.fieldMapping.findMany({
      where: {
        scholarshipId,
      },
      orderBy: { updatedAt: "desc" },
    });

    return json({
      mappings,
      applicationId: application?.id,
    });
  } catch (error) {
    console.error("Error fetching field mappings:", error);
    return json({ mappings: [], applicationId: null });
  }
};
