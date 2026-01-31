/**
 * API Route for OASIS Session Retrieval
 *
 * GET /api/oasis.session/:sessionId
 * Returns a saved OASIS session for use in scraping/completing applications
 *
 * GET /api/oasis.session/current
 * Returns the current user's active OASIS session
 */

import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

/**
 * GET /api/oasis.session/:sessionId
 * Returns a specific session by ID
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const sessionId = params.sessionId;

  // Verify user owns this session
  const session = await prisma.portalSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
  });

  if (!session) {
    return json({ error: "Session not found" }, { status: 404 });
  }

  // Check if session is still valid
  if (session.expiresAt < new Date()) {
    return json({ error: "Session expired" }, { status: 401 });
  }

  // Update lastValid timestamp
  await prisma.portalSession.update({
    where: { id: sessionId },
    data: { lastValid: new Date() },
  });

  return json({
    id: session.id,
    userId: session.userId,
    portal: session.portal,
    cookies: session.cookies,
    localStorage: session.localStorage,
    sessionStorage: session.sessionStorage,
    lastValid: session.lastValid,
    expiresAt: session.expiresAt,
  });
}
