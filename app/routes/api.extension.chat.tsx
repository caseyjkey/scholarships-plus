/**
 * Extension Chat API Endpoint
 *
 * Handles conversational AI interactions for field refinement.
 * Users can chat with the agent to get improved/updated responses.
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { verifyExtensionToken } from "~/models/google-credential.server";
import { prisma } from "~/db.server";
import { saveConfirmedObviousField } from "~/lib/field-generation.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Verify JWT token
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = verifyExtensionToken(authHeader);

    if (!userId) {
      return json({ error: "Invalid token" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      scholarshipId,
      applicationId,
      fieldName,
      fieldLabel,
      fieldType,
      message,
      currentValue,
      init,
    } = body;

    // scholarshipId is always required
    if (!scholarshipId) {
      return json(
        { error: "Missing required field: scholarshipId" },
        { status: 400 }
      );
    }

    // For init requests, require fieldName (init is only for field-specific chat)
    if (init && !fieldName) {
      return json(
        { error: "Missing required field: fieldName for init" },
        { status: 400 }
      );
    }

    // For non-init requests, message is required
    if (!init && !message) {
      return json(
        { error: "Missing required field: message" },
        { status: 400 }
      );
    }

    // Handle initial greeting - return personalized message without AI call
    if (init) {
      // Get scholarship info for the greeting
      const scholarship = await prisma.scrapedScholarship.findUnique({
        where: { id: scholarshipId },
      });

      const scholarshipName = scholarship?.title || "this scholarship";
      const displayName = fieldLabel || fieldName;

      // Generate a personalized greeting
      const greeting = `Hello! I'm helping you with your application for **${scholarshipName}**. I can help you craft a response for **"${displayName}"**. What would you like to say?`;

      return json({
        response: greeting,
        fieldLabel: fieldLabel,
        fieldType: fieldType,
      });
    }

    // GENERAL CHAT MODE: No fieldName provided
    // Handle general questions about the application without field context
    if (!fieldName) {
      // Get scholarship info
      const scholarship = await prisma.scrapedScholarship.findUnique({
        where: { id: scholarshipId },
      });

      if (!scholarship) {
        return json({ error: "Scholarship not found" }, { status: 404 });
      }

      const scholarshipName = scholarship?.title || "this scholarship";

      // Build prompt for general chat
      const prompt = `The user is working on a scholarship application for "${scholarshipName}" and has a general question.

User's question: ${message}

Please provide a helpful response that assists them with their application. Be conversational and specific to their scholarship application context.`;

      // Generate response (no field-specific context, no knowledge base search)
      const response = await generateChatResponse(prompt, "text");

      return json({
        response,
      });
    }

    // Get scholarship info
    const scholarship = await prisma.scrapedScholarship.findUnique({
      where: { id: scholarshipId },
    });

    if (!scholarship) {
      return json({ error: "Scholarship not found" }, { status: 404 });
    }

    // Get existing field mapping if any
    const fieldMapping = await prisma.fieldMapping.findUnique({
      where: {
        scholarshipId_fieldName: {
          scholarshipId,
          fieldName,
        },
      },
    });

    // Build conversation context
    const context: string[] = [];

    if (fieldLabel) {
      context.push(`Field Label: ${fieldLabel}`);
    }

    if (fieldType) {
      context.push(`Field Type: ${fieldType}`);
    }

    if (currentValue) {
      context.push(`Current Response: ${currentValue}`);
    }

    if (scholarship.title) {
      context.push(
        `Scholarship: ${scholarship.title} by ${scholarship.organization || "Unknown Organization"}`
      );
    }

    // Build prompt
    const prompt = buildChatPrompt(
      message,
      context.join("\n"),
      fieldType || "text"
    );

    // Search user's knowledge base for relevant context
    const knowledgeContext = await searchKnowledgeBase(
      userId,
      fieldLabel || fieldName,
      fieldType || "text",
      message
    );

    // Add knowledge context to prompt if found
    const finalPrompt = knowledgeContext
      ? `${prompt}\n\nRelevant information from your profile:\n${knowledgeContext}`
      : prompt;

    // Generate response
    const response = await generateChatResponse(finalPrompt, fieldType);

    // Update field mapping if this is a new suggested value
    if (fieldMapping && response && response !== currentValue) {
      await prisma.fieldMapping.update({
        where: { id: fieldMapping.id },
        data: {
          approvedValue: response,
          approved: true,
          approvedAt: new Date(),
        },
      });

      // Also save to GlobalKnowledge if this is an obvious field
      // This creates a learning system - corrections improve future auto-fill
      const fieldKey = getObviousFieldKey(fieldLabel || fieldName);
      if (fieldKey) {
        await saveConfirmedObviousField(userId, fieldKey, fieldLabel || fieldName, response);
      }
    }

    return json({
      response,
      fieldLabel: fieldMapping?.fieldLabel || fieldLabel,
      fieldType: fieldMapping?.fieldType || fieldType,
    });
  } catch (error) {
    console.error("Extension chat error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

/**
 * Build prompt for chat-based field refinement
 */
function buildChatPrompt(
  userMessage: string,
  context: string,
  fieldType: string
): string {
  let basePrompt = "";

  switch (fieldType) {
    case "textarea":
      basePrompt = `The user is working on a scholarship application and needs help refining their essay response.

Context:
${context}

User's request: ${userMessage}

Please provide an improved response that:
- Addresses the user's feedback or request
- Maintains authenticity and personal voice
- Is under 500 words
- Is professional but conversational`;
      break;

    case "select":
    case "radio":
      basePrompt = `The user is working on a scholarship application and needs help selecting the best option.

Context:
${context}

User's request: ${userMessage}

Provide the most appropriate value based on their request. Return just the value, no explanation.`;
      break;

    default:
      basePrompt = `The user is working on a scholarship application and needs help with a short text field.

Context:
${context}

User's request: ${userMessage}

Provide a brief, accurate response that addresses their request. Keep it concise and factual.`;
  }

  return basePrompt;
}

/**
 * Search user's knowledge base for relevant context
 */
async function searchKnowledgeBase(
  userId: string,
  fieldLabel: string,
  fieldType: string,
  userMessage: string
): Promise<string | null> {
  try {
    // Import RAG search utility
    const { searchKnowledge } = await import("~/lib/rag.server");

    // Build search query combining field label and user message
    const searchQuery = `${fieldLabel} ${userMessage} personal information`;

    // Perform semantic search
    const results = await searchKnowledge(userId, searchQuery, {
      limit: 3,
    });

    if (results.length === 0) {
      return null;
    }

    // Format results as context
    return results
      .map((r, i) => `[Source ${i + 1}]: ${r.content}`)
      .join("\n\n");
  } catch (error) {
    console.error("Knowledge base search failed:", error);
    return null;
  }
}

/**
 * Generate chat response using AI
 */
async function generateChatResponse(
  prompt: string,
  fieldType: string
): Promise<string> {
  // Check which AI service is configured
  const useGLM = !!process.env.GLM_API_KEY;
  const useOpenAI = !!process.env.OPENAI_API_KEY;

  // Determine max tokens based on field type
  const maxTokens = fieldType === "textarea" ? 500 : 100;

  if (useGLM) {
    return await callGLM(prompt, maxTokens);
  } else if (useOpenAI) {
    return await callOpenAI(prompt, maxTokens);
  } else {
    throw new Error("No AI service configured");
  }
}

/**
 * Call GLM API
 */
async function callGLM(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.GLM_API_KEY;
  const apiUrl =
    process.env.ZAI_API_URL ||
    process.env.GLM_API_URL ||
    "https://api.z.ai/api/coding/paas/v4/chat/completions";

  // Increase max_tokens to prevent truncation
  const adjustedMaxTokens = maxTokens < 200 ? 200 : maxTokens * 2;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "glm-4.7",
      // Disable chain-of-thought thinking mode to get direct responses
      thinking: {
        type: "disabled",
      },
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that helps users refine scholarship application responses. Be authentic, concise, and professional. When the user provides feedback, incorporate it thoughtfully while maintaining their voice.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: adjustedMaxTokens,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    throw new Error(`GLM API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content?.trim();
  // With thinking mode disabled, reasoning_content should not be used
  // but keep as fallback for compatibility
  const reasoningContent = data.choices[0].message.reasoning_content?.trim();
  return content || reasoningContent || "";
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that helps users refine scholarship application responses. Be authentic, concise, and professional. When the user provides feedback, incorporate it thoughtfully while maintaining their voice.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Get the field key for an obvious field
 * Returns the normalized lowercase label if it's an obvious field, null otherwise
 *
 * Examples: "First Name" → "first name", "GPA" → "gpa"
 */
function getObviousFieldKey(fieldLabel: string): string | null {
  const labelLower = fieldLabel.toLowerCase().trim();

  const obviousFieldPatterns = [
    'first name', 'last name', 'full name', 'your name',
    'university', 'college', 'institution', 'school',
    'email', 'e-mail', 'mail',
    'phone', 'mobile', 'telephone',
    'gpa', 'grade point',
    'major', 'field of study', 'concentration',
    'year', 'grade level', 'class',
    'address', 'street', 'city', 'state', 'zip',
  ];

  const isObviousField = obviousFieldPatterns.some(pattern => labelLower.includes(pattern));

  return isObviousField ? labelLower : null;
}
