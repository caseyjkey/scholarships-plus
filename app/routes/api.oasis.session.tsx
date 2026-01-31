/**
 * API Route for OASIS Session Capture
 *
 * This endpoint provides an HTML page with an embedded browser window
 * where students can log into OASIS. Once logged in, the window sends
 * the session cookies back to the parent window for capture.
 */

import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  return json({ userId });
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);

  if (request.method === "POST") {
    try {
      const body = await request.json();
      const { cookies, localStorage, sessionStorage } = body;

      // Calculate expiration (30 days from now)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Save or update the session
      const session = await prisma.portalSession.upsert({
        where: {
          userId_portal: {
            userId,
            portal: "oasis",
          },
        },
        create: {
          userId,
          portal: "oasis",
          cookies,
          localStorage,
          sessionStorage,
          lastValid: new Date(),
          expiresAt,
        },
        update: {
          cookies,
          localStorage,
          sessionStorage,
          lastValid: new Date(),
          expiresAt,
        },
      });

      return json({ success: true, sessionId: session.id });
    } catch (error: any) {
      return json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};
