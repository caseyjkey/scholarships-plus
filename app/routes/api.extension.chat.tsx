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
import { appendFileSync } from "fs";

// Debug logging function
function debugLog(message: string, data?: any) {
  const logMsg = data ? `${message}: ${JSON.stringify(data)}` : message;
  console.log(logMsg);
  appendFileSync("/tmp/extension-chat-debug.log", new Date().toISOString() + " " + logMsg + "\n");
}

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

      // Check if we have multiple unverified candidates for this field
      const { getAllFieldCandidates } = await import("~/lib/field-generation.server");
      const candidates = await getAllFieldCandidates(userId, displayName);

      // Filter to unverified candidates only
      const unverifiedCandidates = candidates.filter(c => !c.verified);

      // If we have multiple candidates, show them as options
      if (unverifiedCandidates.length > 1) {
        const optionsList = unverifiedCandidates
          .slice(0, 4) // Max 4 options
          .map((c, i) => `${i + 1}. **${c.value}**`)
          .join('\n');

        const greeting = `Hello! I found multiple possible values for **"${displayName}"** in your knowledge base:\n\n${optionsList}\n\nWhich one is correct, or would you like to provide a different value?`;

        return json({
          response: greeting,
          canPropose: false,  // Options mode, not proposal
          options: unverifiedCandidates.map(c => c.value),  // Send options to extension
          fieldLabel: displayName,
          fieldType: fieldType,
        });
      }

      // If we have exactly one candidate, suggest it
      if (unverifiedCandidates.length === 1) {
        const candidate = unverifiedCandidates[0];
        const greeting = `Hello! I found **"${candidate.value}"** for **"${displayName}"** in your knowledge base. Is this correct?`;

        return json({
          response: greeting,  // Display message
          proposedValue: candidate.value,  // Actual value to autofill
          canPropose: true,  // Single candidate can be proposed
          fieldLabel: displayName,
          fieldType: fieldType,
        });
      }

      // No candidates - standard greeting
      const greeting = `Hello! I'm helping you with your application for **${scholarshipName}**. I can help you craft a response for **"${displayName}"**. What would you like to say?`;

      return json({
        response: greeting,
        canPropose: false,  // Greetings don't have proposals
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

      // Classify the message type
      const questionType = await classifyQuestionType(message, scholarshipName);

      // Handle simple factual questions with direct DB lookup
      if (questionType === "SIMPLE_QUESTION") {
        const answer = await handleSimpleQuestion(userId, message);
        return json({
          response: answer,
          questionType: "SIMPLE_QUESTION",
        });
      }

      // Handle exploratory questions with RAG
      if (questionType === "EXPLORATORY") {
        // Use RAG with numbered chunk citations
        const { queryRAG } = await import("~/lib/rag.server");
        const ragResponse = await queryRAG({
          userId,
          scholarshipId,
          query: message,
          maxSources: 5,
        });

        // Build response with citations
        let responseText = ragResponse.content;

        // Append source list if we have citations
        if (ragResponse.citations.length > 0) {
          const sourcesList = ragResponse.citations
            .map(cit =>
              cit.sources.map(s => `  [${s.id}: ${s.title}]`).join('')
            )
            .join('\n');

          responseText += `\n\nSources I used:${sourcesList}`;
        }

        return json({
          response: responseText,
          questionType: "EXPLORATORY",
          usedRAG: ragResponse.sources.length > 0,
          sources: ragResponse.sources,
          citations: ragResponse.citations,
        });
      }

      // Handle direct answers - treat as conversational, not for field filling
      // (This is general chat mode, so we just respond conversationally)
      const response = await generateChatResponse(
        `The user is working on a scholarship application for "${scholarshipName}" and said: "${message}"

Respond conversationally to acknowledge what they said.`,
        "text"
      );

      return json({
        response,
        questionType: "DIRECT_ANSWER",
      });
    }

    // Get scholarship info
    const scholarship = await prisma.scrapedScholarship.findUnique({
      where: { id: scholarshipId },
    });

    if (!scholarship) {
      return json({ error: "Scholarship not found" }, { status: 404 });
    }

    // Check if user is responding to options (by checking if we have multiple candidates)
    const { getAllFieldCandidates } = await import("~/lib/field-generation.server");
    const displayName = fieldLabel || fieldName;
    const candidates = await getAllFieldCandidates(userId, displayName);
    const unverifiedCandidates = candidates.filter(c => !c.verified);

    // If we had multiple options and user is sending a message, treat it as their selection
    if (unverifiedCandidates.length > 1) {
      // User is responding to options - check if message matches any candidate
      const selectedCandidate = unverifiedCandidates.find(c =>
        c.value.toLowerCase().trim() === message.toLowerCase().trim()
      );

      if (selectedCandidate) {
        // User selected one of the options - save and autofill
        const selectedValue = selectedCandidate.value;

        // Save to GlobalKnowledge - detect if essay field or obvious field
        const isEssayField = fieldType === 'textarea' || selectedValue.length > 100;

        if (isEssayField) {
          // Save as essay response for history modal
          const { saveSynthesizedResponse } = await import("~/lib/synthesis.server");
          await saveSynthesizedResponse({
            userId,
            fieldId: fieldName,
            fieldLabel: displayName,
            content: selectedValue,
            promptType: 'chat_generated',
            styleUsed: 'user_selected',
            sources: [],
            wordCount: selectedValue.split(/\s+/).length,
          });
        } else {
          // Save as obvious field
          const { saveConfirmedObviousField } = await import("~/lib/field-generation.server");
          const fieldKey = getObviousFieldKey(displayName);
          if (fieldKey) {
            await saveConfirmedObviousField(userId, fieldKey, displayName, selectedValue);
          }
        }

        // Update field mapping
        const fieldMapping = await prisma.fieldMapping.findUnique({
          where: {
            scholarshipId_fieldName: {
              scholarshipId,
              fieldName,
            },
          },
        });

        if (fieldMapping) {
          await prisma.fieldMapping.update({
            where: { id: fieldMapping.id },
            data: {
              approvedValue: selectedValue,
              approved: true,
              approvedAt: new Date(),
            },
          });
        }

        // Return autofill instruction
        return json({
          response: selectedValue,
          canPropose: true,
          autofill: true,  // Tell extension to autofill and close
          fieldLabel: displayName,
          fieldType: fieldType,
        });
      } else {
        // User typed something different - treat as custom value
        // Save to GlobalKnowledge - detect if essay field or obvious field
        const isEssayField = fieldType === 'textarea' || message.length > 100;

        if (isEssayField) {
          // Save as essay response for history modal
          const { saveSynthesizedResponse } = await import("~/lib/synthesis.server");
          await saveSynthesizedResponse({
            userId,
            fieldId: fieldName,
            fieldLabel: displayName,
            content: message,
            promptType: 'chat_generated',
            styleUsed: 'user_custom',
            sources: [],
            wordCount: message.split(/\s+/).length,
          });
        } else {
          // Save as obvious field
          const { saveConfirmedObviousField } = await import("~/lib/field-generation.server");
          const fieldKey = getObviousFieldKey(displayName);
          if (fieldKey) {
            await saveConfirmedObviousField(userId, fieldKey, displayName, message);
          }
        }

        // Update field mapping
        const fieldMapping = await prisma.fieldMapping.findUnique({
          where: {
            scholarshipId_fieldName: {
              scholarshipId,
              fieldName,
            },
          },
        });

        if (fieldMapping) {
          await prisma.fieldMapping.update({
            where: { id: fieldMapping.id },
            data: {
              approvedValue: message,
              approved: true,
              approvedAt: new Date(),
            },
          });
        }

        // Return autofill instruction for custom value
        return json({
          response: message,
          canPropose: true,
          autofill: true,  // Tell extension to autofill and close
          fieldLabel: displayName,
          fieldType: fieldType,
        });
      }
    }

    // Normal chat flow (no options) - continue with AI generation
    // Get existing field mapping if any
    const fieldMapping = await prisma.fieldMapping.findUnique({
      where: {
        scholarshipId_fieldName: {
          scholarshipId,
          fieldName,
        },
      },
    });

    // Build conversation context - include current value for context
    const context: string[] = [];

    if (fieldLabel) {
      context.push(`Field: ${fieldLabel}`);
    }

    if (fieldType) {
      context.push(`Type: ${fieldType}`);
    }

    // Include current value if exists - important for understanding "change it to X" requests
    if (currentValue) {
      context.push(`Current Value: ${currentValue}`);
    }

    // Skip scholarship title in context to avoid AI providing scholarship information
    // The AI should focus on formatting the user's answer, not explaining the scholarship

    // Generate AI response with proposal decision
    debugLog("Calling generateChatResponseWithProposal", { message, fieldType, currentValue, contextCount: context.length });

    const aiResult = await generateChatResponseWithProposal(
      message,
      context.join("\n"),
      fieldType || "text",
      currentValue // Pass current value for better context
    );

    debugLog("AI result received", aiResult);

    // Update field mapping if this is a new proposed value AND we can propose
    if (fieldMapping && aiResult.response && aiResult.response !== currentValue && aiResult.canPropose) {
      await prisma.fieldMapping.update({
        where: { id: fieldMapping.id },
        data: {
          approvedValue: aiResult.response,
          approved: true,
          approvedAt: new Date(),
        },
      });

      // Also save to GlobalKnowledge if this is an obvious field
      const fieldKey = getObviousFieldKey(fieldLabel || fieldName);
      if (fieldKey) {
        await saveConfirmedObviousField(userId, fieldKey, fieldLabel || fieldName, aiResult.response);
      }
    }

    return json({
      response: aiResult.response,
      canPropose: aiResult.canPropose,
      fieldLabel: fieldMapping?.fieldLabel || fieldLabel,
      fieldType: fieldMapping?.fieldType || fieldType,
    });
  } catch (error) {
    console.error("Extension chat error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

/**
 * Format simple direct answer with minor cleanup
 * Capitalizes first letter, adds "University" for common college names, etc.
 */
function formatSimpleValue(value: string, fieldLabel: string): string {
  let formatted = value.trim();

  // Capitalize first letter
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  // Common college name expansions
  const collegeMappings: Record<string, string> = {
    "stanford": "Stanford University",
    "mit": "Massachusetts Institute of Technology",
    "ucla": "University of California, Los Angeles",
    "uc berkeley": "University of California, Berkeley",
    "harvard": "Harvard University",
    "yale": "Yale University",
    "princeton": "Princeton University",
    "columbia": "Columbia University",
    "cornell": "Cornell University",
    "brown": "Brown University",
    "dartmouth": "Dartmouth College",
    "upenn": "University of Pennsylvania",
    "northwestern": "Northwestern University",
    "duke": "Duke University",
    "georgetown": "Georgetown University",
    "nyu": "New York University",
    "usc": "University of Southern California",
    "caltech": "California Institute of Technology",
    "cmu": "Carnegie Mellon University",
  };

  const lowerValue = formatted.toLowerCase();
  // Check for exact match first
  if (collegeMappings[lowerValue]) {
    return collegeMappings[lowerValue];
  }

  return formatted;
}

/**
 * Build prompt for chat-based field refinement
 */
function buildChatPrompt(
  userMessage: string,
  context: string,
  fieldType: string
): string {
  // Detect if user is providing a simple value (short, direct answer)
  const isSimpleValue = userMessage.trim().length < 100 &&
    !userMessage.includes('?') &&
    !userMessage.includes('because') &&
    !userMessage.includes('since') &&
    !userMessage.includes('help me') &&
    !userMessage.includes('how to') &&
    !userMessage.includes('what should') &&
    !userMessage.toLowerCase().includes('more detail') &&
    !userMessage.toLowerCase().includes('elaborate');

  // For select/radio fields or simple short values, just echo them back with minor formatting
  if (fieldType === "select" || fieldType === "radio" || isSimpleValue) {
    return `You are a form-filling assistant. The user just provided a SHORT, DIRECT answer to fill in a form field.

User's answer: "${userMessage}"

YOUR ONLY JOB: Return the cleaned-up value with proper formatting. NOTHING ELSE.

STRICT RULES:
1. Return ONLY the value itself
2. NO explanations, NO context, NO suggestions
3. NO phrases like "I see you want to use..." or "Here's the response..."
4. NO questions, NO additional text whatsoever
5. Minor formatting only: capitalize properly (e.g., "stanford" → "Stanford University")

EXAMPLES:
Input: "Computer Science" → Output: Computer Science
Input: "stanford" → Output: Stanford University
Input: "3.8" → Output: 3.8
Input: "yes" → Output: Yes

NOW OUTPUT ONLY THE VALUE FOR: "${userMessage}"`;
  }

  // For textarea (essays) and longer, more complex requests
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
  // Prefer OpenAI for JSON mode support and reliability
  const useOpenAI = !!process.env.OPENAI_API_KEY;
  const useGLM = !useOpenAI && !!process.env.GLM_API_KEY;

  // Determine max tokens based on field type
  const maxTokens = fieldType === "textarea" ? 500 : 100;

  if (useOpenAI) {
    return await callOpenAI(prompt, maxTokens);
  } else if (useGLM) {
    return await callGLM(prompt, maxTokens);
  } else {
    throw new Error("No AI service configured");
  }
}

/**
 * Generate chat response with proposal decision
 * Returns both the response text and whether AI has enough info to propose
 */
async function generateChatResponseWithProposal(
  userMessage: string,
  context: string,
  fieldType: string,
  currentValue?: string
): Promise<{ response: string; canPropose: boolean }> {
  // Prefer OpenAI for JSON mode since it properly supports structured output
  const useOpenAI = !!process.env.OPENAI_API_KEY;
  const useGLM = !useOpenAI && !!process.env.GLM_API_KEY;

  // Determine max tokens based on field type
  const maxTokens = fieldType === "textarea" ? 500 : 200;

  // Build prompt that asks for JSON response with validation
  // AI should validate answers against field context and set canPropose accordingly
  const prompt = `You are a JSON API for a scholarship application form filler. Output ONLY valid JSON.

FIELD CONTEXT:
${context}

USER SAID: "${userMessage}"

TASK: Validate the user's answer against the field context.
- If answer is complete and valid for this field: set canPropose=true
- If answer is incomplete, invalid, or doesn't match field type: set canPropose=false and ask clarifying questions
- If user provides a correction ("Change it to X", "Use X instead", "X is correct"): use the new value and set canPropose=true

EXAMPLES:
Field: First Name | "Stanford" -> {"response":"Stanford is a university, not a first name. What's your actual first name?","canPropose":false}
Field: First Name | "John" -> {"response":"John","canPropose":true}
Field: First Name | Current Value: "Doe" | "Change it to Key" -> {"response":"Key","canPropose":true}
Field: Last Name | Current Value: "Smith" | "Use Jones instead" -> {"response":"Jones","canPropose":true}
Field: GPA | "3.8" -> {"response":"3.8","canPropose":true}
Field: GPA | "2.4" -> {"response":"2.4","canPropose":true}
Field: GPA | Current Value: "3.5" | "Actually it's 3.8" -> {"response":"3.8","canPropose":true}
Field: GPA | Current Value: "3.75" | "2.40" -> {"response":"2.40","canPropose":true}
Field: GPA | Current Value: "3.8" | "Change it to 2.5" -> {"response":"2.5","canPropose":true}
Field: Major | "Computer Science" -> {"response":"Computer Science","canPropose":true}
Field: Major | Current Value: "Math" | "Change to Physics" -> {"response":"Physics","canPropose":true}
"help me" -> {"response":"What would you like to say?","canPropose":false}
"not sure" -> {"response":"What questions do you have?","canPropose":false}

RULES:
1. Validate that the answer matches the expected field type
2. For text fields: expect names, words, phrases (not numbers, universities as names, dates)
3. For GPA/number fields: ANY valid number is acceptable. GPA values between 0.0 and 4.0 are ALL valid.
4. GPA: Accept ANY value between 0.0-4.0, whether higher or lower than current value. Do NOT reject valid GPAs.
5. For date fields: expect dates (not names, numbers alone)
6. Set canPropose=true ONLY when answer is complete and valid
7. Set canPropose=false and ask for clarification when answer doesn't match field type
8. CRITICAL: If Current Value is provided and user provides ANY new valid value, use the new value and set canPropose=true
9. NEVER reject a valid correction just because it differs from the current value

OUTPUT ONLY JSON:
{"response":"...","canPropose":true}`;

  if (useGLM) {
    return await callGLMWithJSON(prompt, maxTokens);
  } else if (useOpenAI) {
    return await callOpenAIWithJSON(prompt, maxTokens);
  } else {
    throw new Error("No AI service configured");
  }
}

/**
 * Call GLM API and parse JSON response
 */
async function callGLMWithJSON(
  prompt: string,
  maxTokens: number
): Promise<{ response: string; canPropose: boolean }> {
  const apiKey = process.env.GLM_API_KEY;
  // Use standard chat API instead of coding API for better JSON support
  const apiUrl =
    process.env.GLM_API_URL ||
    "https://open.bigmodel.cn/api/paas/v4/chat/completions";

  const adjustedMaxTokens = maxTokens < 200 ? 300 : maxTokens * 2;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "glm-4.7",
      thinking: {
        type: "disabled",
      },
      messages: [
        {
          role: "system",
          content: "You are a JSON API. Your ONLY output must be a valid JSON object. Format: {\"response\":\"string\",\"canPropose\":boolean}. No markdown, no code blocks, no explanations. Never include your internal reasoning or thinking process in the output. Output ONLY the JSON response.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: adjustedMaxTokens,
      temperature: 0.1,
      top_p: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`GLM API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content?.trim() || "";

  // Try to parse JSON
  try {
    debugLog("GLM raw response", content.substring(0, 500));

    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                      content.match(/(\{[\s\S]*?\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    debugLog("Extracted JSON string", jsonStr);

    const parsed = JSON.parse(jsonStr);

    debugLog("Parsed result", parsed);

    // Validate structure
    if (typeof parsed.response === "string" && typeof parsed.canPropose === "boolean") {
      return {
        response: parsed.response,
        canPropose: parsed.canPropose,
      };
    }

    // If structure is invalid, try heuristic fallback
    debugLog("Invalid JSON structure, trying heuristic fallback", parsed);
    return heuristicFallback(content, prompt);
  } catch (e) {
    // If JSON parsing fails, use heuristic fallback
    debugLog("JSON parse failed, trying heuristic fallback", { error: (e as Error).message, contentPreview: content.substring(0, 200) });
    return heuristicFallback(content, prompt);
  }
}

/**
 * Heuristic fallback when JSON parsing fails
 * Analyzes user's original input to determine if it's a direct answer
 */
function heuristicFallback(
  aiResponse: string,
  prompt: string
): { response: string; canPropose: boolean } {
  // Extract the original user input from the prompt
  const userMatch = prompt.match(/User said: "([^"]+)"/);
  const userInput = userMatch ? userMatch[1].trim() : "";

  if (!userInput) {
    return { response: aiResponse, canPropose: false };
  }

  // Check if it's a simple direct answer (not a question)
  const questionStarters = ['how', 'what', 'where', 'when', 'why', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'help', 'i\'m not sure', 'not sure', 'tell me'];
  const lowerInput = userInput.toLowerCase();

  // Check if starts with question word
  const startsWithQuestion = questionStarters.some(starter => lowerInput.startsWith(starter));

  // Check if ends with question mark
  const hasQuestionMark = userInput.endsWith('?');

  // Check if it's a short direct answer (likely canPropose=true)
  const wordCount = userInput.split(/\s+/).length;
  const isShortAnswer = wordCount <= 5;

  // Determine canPropose
  const canPropose = !startsWithQuestion && !hasQuestionMark && isShortAnswer;

  if (canPropose) {
    // For direct answers, use the user's input as the response (with minor formatting)
    // Extract just the value from AI response if it contains useful formatting
    const cleaned = userInput.charAt(0).toUpperCase() + userInput.slice(1);
    return { response: cleaned, canPropose: true };
  }

  // For questions/uncertain input, use the AI's conversational response
  return { response: aiResponse, canPropose: false };
}

/**
 * Call OpenAI API and parse JSON response
 */
async function callOpenAIWithJSON(
  prompt: string,
  maxTokens: number
): Promise<{ response: string; canPropose: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a JSON API. Your ONLY output must be a valid JSON object. Format: {\"response\":\"string\",\"canPropose\":boolean}. No markdown, no code blocks, no explanations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content?.trim() || "";

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed.response === "string" && typeof parsed.canPropose === "boolean") {
      return {
        response: parsed.response,
        canPropose: parsed.canPropose,
      };
    }

    console.warn("[EXTENSION-CHAT] Invalid JSON structure:", parsed);
    return { response: content, canPropose: false };
  } catch (e) {
    console.warn("[EXTENSION-CHAT] JSON parse failed:", content.substring(0, 100));
    return { response: content, canPropose: false };
  }
}

/**
 * Call GLM API
 */
async function callGLM(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.GLM_API_KEY;
  // Use standard chat API instead of coding API for better JSON support
  const apiUrl =
    process.env.GLM_API_URL ||
    "https://open.bigmodel.cn/api/paas/v4/chat/completions";

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
            "You are a scholarship application assistant. Follow the user's instructions EXACTLY. If asked to return only a value, return ONLY that value with no additional text, explanations, or questions. Be concise and follow the format specified in the instructions precisely.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: adjustedMaxTokens,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`GLM API error: ${response.status}`);
  }

  const data = await response.json();
  // Only use content - completely ignore reasoning_content to prevent thinking from showing
  const content = data.choices[0].message.content?.trim();
  return content || "";
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
            "You are a scholarship application assistant. Follow the user's instructions EXACTLY. If asked to return only a value, return ONLY that value with no additional text, explanations, or questions. Be concise and follow the format specified in the instructions precisely.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Classify user's message into one of three types:
 *
 * - SIMPLE_QUESTION: "What's my GPA?", "What's my major?" → direct DB lookup
 * - EXPLORATORY: "What leadership experience do I have?", "Tell me about my achievements" → RAG
 * - DIRECT_ANSWER: "It's 3.5", "Actually use Key", "Computer Science" → just validate/respond
 */
async function classifyQuestionType(message: string, scholarshipName: string): Promise<"SIMPLE_QUESTION" | "EXPLORATORY" | "DIRECT_ANSWER"> {
  // Quick check for obvious direct answers (very short, no question words)
  const lowerMessage = message.toLowerCase().trim();
  const questionWords = ['what', 'how', 'why', 'where', 'when', 'who', 'which', 'describe', 'tell', 'show', 'help', 'explain'];
  const hasQuestionWord = questionWords.some(word => lowerMessage.includes(word));

  // Very short answers without question words are likely direct
  if (message.split(/\s+/).length <= 3 && !hasQuestionWord) {
    return "DIRECT_ANSWER";
  }

  // Use LLM for classification
  const prompt = `Classify this user message as "SIMPLE_QUESTION", "EXPLORATORY", or "DIRECT_ANSWER".

Context: User is working on a scholarship application and opened an AI chat.

User message: "${message}"

RULES:
- SIMPLE_QUESTION: User asks for a specific fact about themselves (GPA, major, college, name, email).
  Examples: "What's my GPA?", "What's my major?", "What college do I go to?", "What's my email?", "whats my gpa"

- EXPLORATORY: User asks open-ended questions about experiences, achievements, or wants help with writing.
  Examples: "What leadership experience do I have?", "Tell me about my achievements", "Help me write about myself", "What are my strengths?", "Describe my activities"

- DIRECT_ANSWER: User provides a specific value, correction, or factual statement.
  Examples: "It's 3.5", "Actually use Key instead", "Computer Science", "My GPA is 3.8", "Yes that's right", "No it's Smith", "Stanford", "Physics"

Return ONLY: {"type":"SIMPLE_QUESTION"} or {"type":"EXPLORATORY"} or {"type":"DIRECT_ANSWER"}`;

  try {
    const useOpenAI = !!process.env.OPENAI_API_KEY;
    const useGLM = !useOpenAI && !!process.env.GLM_API_KEY;

    let result: string;

    if (useGLM) {
      result = await callGLMForClassification(prompt);
    } else if (useOpenAI) {
      result = await callOpenAIForClassification(prompt);
    } else {
      // Fallback heuristic
      if (hasQuestionWord && lowerMessage.includes('my ') && (lowerMessage.includes('gpa') || lowerMessage.includes('major') || lowerMessage.includes('college'))) {
        return "SIMPLE_QUESTION";
      }
      return hasQuestionWord ? "EXPLORATORY" : "DIRECT_ANSWER";
    }

    // Parse result
    const typeMatch = result.match(/"type"\s*:\s*"([^"]+)"/);
    if (typeMatch) {
      const type = typeMatch[1];
      if (type === "SIMPLE_QUESTION" || type === "EXPLORATORY" || type === "DIRECT_ANSWER") {
        return type;
      }
    }

    // Fallback: check for simple question patterns
    if (hasQuestionWord && lowerMessage.includes('my ')) {
      return "SIMPLE_QUESTION";
    }
    return hasQuestionWord ? "EXPLORATORY" : "DIRECT_ANSWER";
  } catch (error) {
    console.error("Classification failed, using heuristic fallback:", error);
    // Fallback to heuristic
    if (hasQuestionWord && lowerMessage.includes('my ')) {
      return "SIMPLE_QUESTION";
    }
    return hasQuestionWord ? "EXPLORATORY" : "DIRECT_ANSWER";
  }
}

/**
 * Call GLM for classification (low token usage)
 */
async function callGLMForClassification(prompt: string): Promise<string> {
  const apiKey = process.env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || "https://open.bigmodel.cn/api/paas/v4/chat/completions";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "glm-4.7",
      thinking: { type: "disabled" },
      messages: [
        {
          role: "system",
          content: "You are a classifier. Output ONLY valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 50,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`GLM classification error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content?.trim() || "";
}

/**
 * Call OpenAI for classification (low token usage)
 */
async function callOpenAIForClassification(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a classifier. Output ONLY valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 50,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI classification error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content?.trim() || "";
}

/**
 * Handle simple factual questions by looking up obvious fields in GlobalKnowledge
 * Returns the answer directly without RAG
 */
async function handleSimpleQuestion(userId: string, message: string): Promise<string> {
  const lowerMessage = message.toLowerCase().trim();

  // Map question patterns to field keys
  const fieldMappings: Record<string, string[]> = {
    'gpa': ['gpa', 'grade point average', 'grade point'],
    'major': ['major', 'field of study', 'concentration', 'field'],
    'college': ['college', 'university', 'school', 'institution'],
    'email': ['email', 'e-mail', 'mail', 'email address'],
    'first name': ['first name', 'firstname', 'given name'],
    'last name': ['last name', 'lastname', 'surname', 'family name'],
    'name': ['full name', 'name', 'complete name'],
    'phone': ['phone', 'telephone', 'mobile', 'cell'],
  };

  // Find matching field key
  for (const [fieldKey, patterns] of Object.entries(fieldMappings)) {
    if (patterns.some(pattern => lowerMessage.includes(pattern))) {
      // Look up in GlobalKnowledge for this field
      const knowledge = await prisma.globalKnowledge.findFirst({
        where: {
          userId,
          type: "obvious_field",
          field: {
            equals: fieldKey,
            mode: 'insensitive',
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (knowledge?.value) {
        return knowledge.value;
      }

      // Not found
      return `I don't have information about your ${fieldKey} in your knowledge base. You can add it by filling out application fields or uploading documents.`;
    }
  }

  // No specific field matched
  return "I'm not sure what specific information you're looking for. Could you be more specific? For example, you can ask about your GPA, major, college, or email.";
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
