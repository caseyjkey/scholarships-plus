/**
 * Extension Authentication Endpoints
 *
 * POST /api/extension/auth/login - Exchange session cookie for JWT token
 * GET /api/extension/auth/verify - Verify JWT token and return user info
 */

import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId, getSession, destroySession } from "~/session.server";
import { prisma } from "~/db.server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d"; // Token expires in 7 days

/**
 * Generate JWT token for user
 */
function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

/**
 * POST /api/extension/auth/login
 * Exchange session cookie for JWT token
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Get user from session cookie
    const userId = await requireUserId(request);

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return json({ error: "User not found" }, { status: 404 });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    return json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      expiresIn: JWT_EXPIRES_IN,
    });
  } catch (error) {
    // User is not logged in
    return json(
      {
        error: "Not authenticated",
        loginUrl: `${process.env.APP_BASE_URL || "http://localhost:3000"}/login`,
      },
      { status: 401 }
    );
  }
};
