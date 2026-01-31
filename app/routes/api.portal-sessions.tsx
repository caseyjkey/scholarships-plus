/**
 * API Route for Portal Sessions
 *
 * GET /api/portal-sessions
 * Returns all portal sessions for the current user
 */

import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const sessions = await prisma.portalSession.findMany({
    where: { userId },
    select: {
      id: true,
      portal: true,
      lastValid: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Check which sessions are still valid
  const now = new Date();
  const sessionsWithStatus = sessions.map((session) => ({
    ...session,
    isValid: session.expiresAt > now,
  }));

  return json({ sessions: sessionsWithStatus });
}
