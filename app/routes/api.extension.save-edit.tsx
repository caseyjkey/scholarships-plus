/**
 * POST /api/extension/save-edit
 *
 * Extension endpoint to save manually edited essay responses to history.
 * Called when user edits an autofilled field and blurs (clicks away).
 *
 * Request body:
 * {
 *   scholarshipId: string,
 *   applicationId: string,
 *   fieldName: string,
 *   fieldLabel: string,
 *   fieldType: string,
 *   content: string
 * }
 *
 * Response:
 * {
 *   success: boolean
 * }
 */

import { ActionFunctionArgs, json } from "@remix-run/node";
import jwt from "jsonwebtoken";
import { saveSynthesizedResponse } from "~/lib/synthesis.server";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verify authentication
  const authHeader = request.headers.get("Authorization");
  const userId = verifyExtensionToken(authHeader);

  if (!userId) {
    return json(
      { error: "Unauthorized", loginUrl: "http://localhost:3000/login" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { fieldName, fieldLabel, content } = body;

    if (!fieldName || !fieldLabel || !content) {
      return json(
        { error: "Missing required fields: fieldName, fieldLabel, content" },
        { status: 400 }
      );
    }

    // Save edited response to history (archives old version if exists)
    await saveSynthesizedResponse({
      userId,
      fieldId: fieldName,
      fieldLabel,
      content,
      promptType: "manual_edit" as any, // User manually edited autofilled response
      styleUsed: {
        tone: "user_edited",
        voice: "first-person",
        complexity: "moderate",
        focus: "authentic",
        overrides: true,
      },
      sources: [],
      wordCount: content.split(/\s+/).length,
    });

    console.log(`[AUTO-SAVE] Saved edited response for field: ${fieldLabel}`);

    return json({ success: true });
  } catch (error) {
    console.error("Error saving edited response:", error);
    return json({ error: "Failed to save edited response" }, { status: 500 });
  }
};
