/**
 * POST /api/extension/map-option
 *
 * Maps a text response to the best matching option for a select/date field
 * Uses fresh LLM call without application context to avoid overflow
 */

import { ActionFunctionArgs, json } from "@remix-run/node";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const GLM_API_KEY = process.env.GLM_API_KEY;
const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

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

async function callGLMForOptionMapping(
  response: string,
  options: string[],
  fieldLabel: string
): Promise<string | null> {
  if (!GLM_API_KEY) {
    console.error("GLM_API_KEY not set");
    return null;
  }

  const optionsList = options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");

  const prompt = `You are helping map a user's response to a form field option.

Field: ${fieldLabel}
Available Options:
${optionsList}

User's Response: "${response}"

Select the option that best matches the user's response. Return ONLY the exact option text, nothing else.

If the response is "Full-time student pursuing a Master's degree" and options include "Full-Time" and "Part-Time", return "Full-Time".
If the response is a date like "May 2025" and options are month names, return "May".

Return only the matching option text.`;

  try {
    const apiResponse = await fetch(GLM_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 50,
      }),
    });

    if (!apiResponse.ok) {
      throw new Error(`GLM API error: ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    const bestOption = data.choices?.[0]?.message?.content?.trim();

    // Find the option that matches (case-insensitive)
    const matched = options.find(
      (opt) => opt.toLowerCase() === bestOption?.toLowerCase()
    );

    return matched || null;
  } catch (error) {
    console.error("GLM API error:", error);
    return null;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Verify authentication
    const authHeader = request.headers.get("Authorization");
    const userId = verifyExtensionToken(authHeader);

    if (!userId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { response, options, fieldLabel } = body;

    if (!response || !options || !Array.isArray(options)) {
      return json(
        { error: "Missing required fields: response, options" },
        { status: 400 }
      );
    }

    // Call LLM to map response to best option
    const bestOption = await callGLMForOptionMapping(
      response,
      options,
      fieldLabel || "Field"
    );

    if (!bestOption) {
      // Fallback: try simple matching
      const responseLower = response.toLowerCase();
      const matched = options.find((opt) =>
        responseLower.includes(opt.toLowerCase())
      );

      return json({
        bestOption: matched || options[0], // Default to first option
        confidence: matched ? "medium" : "low",
      });
    }

    return json({
      bestOption,
      confidence: "high",
    });
  } catch (error) {
    console.error("Map option error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
