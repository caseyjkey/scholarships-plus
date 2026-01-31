/**
 * API Route for disconnecting a portal session
 */

import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const portal = params.portal;

  if (!portal) {
    return json({ success: false, error: "Portal not specified" }, { status: 400 });
  }

  try {
    await prisma.portalSession.deleteMany({
      where: {
        userId,
        portal,
      },
    });

    return json({ success: true });
  } catch (error: any) {
    console.error('Error deleting portal session:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
