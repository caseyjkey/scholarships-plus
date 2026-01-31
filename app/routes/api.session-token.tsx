/**
 * Generate a one-time session token for bookmarklet authentication
 */

import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { randomBytes } from "crypto";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Generate a random token
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Store the token
  await prisma.sessionToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return json({ token });
}
