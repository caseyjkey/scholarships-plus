/**
 * Field Response Generation Service
 *
 * Generates AI-powered responses for scholarship application fields
 * using RAG (Retrieval-Augmented Generation) from user's knowledge base
 */

import { prisma } from "~/db.server";

interface GenerateFieldResponseParams {
  userId: string;
  applicationId: string;
  field: {
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
  };
  scholarship: {
    id: string;
    title: string;
    organization: string;
  };
}

/**
 * Extract clean search query from field label
 * Removes form instructions, validation messages, and other noise
 * Examples:
 * - "Major/Field of Study - Please select from the list" -> "Major/Field of Study"
 * - "Name of college or university you are attending." -> "Name of college or university"
 * - "Degree being pursued *" -> "Degree being pursued"
 */
function extractCleanSearchQuery(fieldLabel: string): string {
  let cleaned = fieldLabel;

  // Remove common suffixes
  const suffixesToRemove = [
    ' - please select from the list',
    ' - please select',
    ' please select from the list',
    ' please select',
    ' - please select from the list\\.',
    ' - please note.*',
    ' - .* \\(if applicable\\)',
    ' - .* \\(if different\\)',
    ' \\*',
    ' \\*\\s*$',
    ' if not listed.*',
    ' if other.*',
    ' \\(.*\\)',  // Remove parenthetical instructions
    ' \\s*-\\s*.*$',  // Remove everything after " - "
  ];

  for (const suffix of suffixesToRemove) {
    const regex = new RegExp(suffix, 'gi');
    cleaned = cleaned.replace(regex, '');
  }

  // Clean up extra whitespace and trailing punctuation
  cleaned = cleaned
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!]+$/, '');

  return cleaned;
}

/**
 * Preprocessing for obvious fields using vector similarity
 *
 * Uses pgvector to find semantically similar field values:
 * 1. First checks for previously confirmed values via vector search
 * 2. Falls back to extracting from general knowledge base
 *
 * When user confirms a value via chat, it's saved for future vector matching.
 */
async function preprocessObviousField(
  userId: string,
  fieldLabel: string,
  fieldType: string
): Promise<string | null> {
  const labelLower = fieldLabel.toLowerCase();

  // Define obvious field patterns - fields that can use vector similarity search from knowledge base
  const obviousFieldPatterns = [
    'first name', 'last name', 'full name', 'your name',
    'university', 'college', 'institution', 'school',
    'email', 'e-mail', 'mail',
    'phone', 'mobile', 'telephone',
    'gpa', 'grade point',
    'major', 'field of study', 'concentration', 'degree', 'pursuing', 'program',
    'year', 'grade level', 'class',
    'address', 'street', 'city', 'state', 'zip',
  ];

  // Check if this is an obvious field
  const isObviousField = obviousFieldPatterns.some(pattern => labelLower.includes(pattern));

  if (!isObviousField) {
    return null; // Not an obvious field, requires AI generation
  }

  // STAGE 1: Vector search for previously confirmed values (verified: true)
  try {
    const { searchGlobalKnowledge } = await import("~/lib/pgvector.server");

    // Extract clean search query from field label - remove form instructions and noise
    // "Major/Field of Study - Please select from the list" -> "Major/Field of Study"
    const cleanQuery = extractCleanSearchQuery(fieldLabel);

    // Search for verified entries similar to this field label
    const fieldSearchResults = await searchGlobalKnowledge(
      userId,
      cleanQuery,
      { verified: true },
      3
    );

    // Find high-similarity match (>0.85 threshold for confident match)
    const confirmedMatch = fieldSearchResults.find(chunk =>
      chunk.similarity > 0.85 &&
      chunk.metadata.verified === true
    );

    if (confirmedMatch) {
      // Extract value from content (format: "Value: John Doe")
      const valueMatch = confirmedMatch.content.match(/^Value:\s*(.+)$/m);
      if (valueMatch) {
        const value = valueMatch[1].trim();
        console.log(`[Preprocess] Found confirmed value for "${fieldLabel}": ${value} (similarity: ${confirmedMatch.similarity.toFixed(2)})`);
        return value;
      }
    }

    // STAGE 2: No confirmed value found, search general knowledge base using vector similarity
    // Try multiple query strategies to find relevant knowledge
    const searchQueries = [
      cleanQuery,  // Clean label: "Major/Field of Study"
      `${cleanQuery} degree`,  // "Major/Field of Study degree"
      `${cleanQuery} education`,  // "Major/Field of Study education"
    ];

    let bestMatch = null;
    let bestSimilarity = 0;

    for (const query of searchQueries) {
      const results = await searchGlobalKnowledge(userId, query, {}, 5);
      if (results.length > 0 && results[0].similarity > bestSimilarity) {
        bestMatch = results[0];
        bestSimilarity = results[0].similarity;
      }
    }

    if (bestMatch && bestSimilarity > 0.5) {
      console.log(`[Preprocess] Found knowledge match for "${fieldLabel}": ${bestMatch.content.substring(0, 50)}... (similarity: ${bestSimilarity.toFixed(2)})`);

      // For structured data like email, phone, etc., extract the specific value using regex
      // For everything else, return the most relevant chunk content directly
      const extractedValue = extractStructuredValue(bestMatch.content, labelLower);
      return extractedValue || bestMatch.content;
    }

  } catch (error) {
    console.error(`[Preprocess] Error for ${fieldLabel}:`, error);
  }

  return null; // Fall through to AI generation
}

/**
 * Extract structured values (email, phone, etc.) from content using regex
 * This is only for truly structured data - everything else uses vector similarity
 */
function extractStructuredValue(content: string, labelLower: string): string | null {
  // Email extraction
  if (labelLower.includes('email')) {
    const emailMatch = content.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) return emailMatch[0];
  }

  // Phone extraction
  if (labelLower.includes('phone') || labelLower.includes('mobile')) {
    const phoneMatch = content.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) return phoneMatch[0];
  }

  // GPA extraction
  if (labelLower.includes('gpa')) {
    const gpaMatch = content.match(/(\d\.?\d*)\s*gpa/i);
    if (gpaMatch) return gpaMatch[1];
  }

  // No structured value found - return null so caller uses the raw content
  return null;
}

/**
 * Generate an AI-powered response for a single field
 */
export async function generateFieldResponse({
  userId,
  applicationId,
  field,
  scholarship,
}: GenerateFieldResponseParams): Promise<string> {
  const { fieldName, fieldLabel, fieldType } = field;

  // PREPROCESSING: Check for obvious fields that can be filled directly from knowledge base
  // These don't require AI generation - just direct lookup
  const preprocessedValue = await preprocessObviousField(userId, fieldLabel, fieldType);
  if (preprocessedValue) {
    console.log(`Preprocessed value for field "${fieldLabel}": ${preprocessedValue.substring(0, 50)}...`);
    return preprocessedValue;
  }

  // Build prompt based on field type
  let prompt = "";
  let maxTokens = 100;

  switch (fieldType) {
    case "textarea":
      // Essay/long-form field
      prompt = buildEssayPrompt(fieldLabel, scholarship);
      maxTokens = 500;
      break;

    case "select":
    case "radio":
      // Multiple choice - we'll return a selection
      prompt = buildChoicePrompt(fieldLabel, scholarship);
      maxTokens = 50;
      break;

    default:
      // Text input
      prompt = buildTextPrompt(fieldLabel, scholarship);
      maxTokens = 100;
  }

  // Search user's knowledge base for relevant context
  // Check BOTH GlobalKnowledge (for facts/values) and EssayChunk (for essay content)
  const context = await searchKnowledgeBase(userId, fieldLabel, fieldType);

  // Also search GlobalKnowledge for explicit field values (more direct than essay chunks)
  const globalContext = await searchGlobalKnowledgeBase(userId, fieldLabel, fieldType);

  // Add context to prompt if found
  const allContext = [context, globalContext].filter(Boolean).join("\n\n");
  if (allContext) {
    prompt = `${prompt}\n\nRelevant information from your profile:\n${allContext}`;
  }

  try {
    // Call AI service
    const generated = await callAI(prompt, maxTokens);
    return generated;
  } catch (error) {
    console.error(`AI generation failed for ${fieldName}:`, error);
    throw error;
  }
}

/**
 * Build prompt for essay/long-form fields
 */
function buildEssayPrompt(fieldLabel: string, scholarship: any): string {
  return `Please write a response for the scholarship application field "${fieldLabel}" for ${scholarship.title} by ${scholarship.organization}.

IMPORTANT: If provided with relevant information from your profile below, use that information as the primary source. Do not make up facts or information not present in your profile.

Keep your response:
- Personal and authentic
- Under 500 words
- Focused on your actual experiences and goals
- Professional but conversational in tone`;
}

/**
 * Build prompt for multiple choice fields
 */
function buildChoicePrompt(fieldLabel: string, scholarship: any): string {
  return `For the scholarship application field "${fieldLabel}" (${scholarship.title}), provide the most appropriate response.

CRITICAL: If provided with relevant information from your profile below, prioritize that information over the scholarship name or any assumptions.

Return just the value, no explanation.`;
}

/**
 * Build prompt for short text fields
 */
function buildTextPrompt(fieldLabel: string, scholarship: any): string {
  return `Please provide a brief, accurate response for "${fieldLabel}" for the ${scholarship.title} scholarship.

CRITICAL: If provided with relevant information from your profile below, use that information. Do not guess or make up facts.

Keep it concise and factual.`;
}

/**
 * Search user's knowledge base for relevant context
 */
async function searchKnowledgeBase(
  userId: string,
  fieldLabel: string,
  fieldType: string
): Promise<string | null> {
  try {
    // Import RAG search utility
    const { searchKnowledge } = await import("~/lib/rag.server");

    // Build search query based on field
    const searchQuery = `${fieldLabel} personal information`;

    // Perform semantic search
    const results = await searchKnowledge(userId, searchQuery, {
      limit: 3,
    });

    if (!results || !Array.isArray(results) || results.length === 0) {
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
 * Search GlobalKnowledge for direct field values (more specific than essay chunks)
 * This finds explicit facts like "Computer Science major" rather than essay content
 */
async function searchGlobalKnowledgeBase(
  userId: string,
  fieldLabel: string,
  fieldType: string
): Promise<string | null> {
  try {
    const { searchGlobalKnowledge } = await import("~/lib/pgvector.server");

    // Try multiple search queries to find relevant entries
    const searchQueries = [
      fieldLabel,  // "Major/Field of Study"
      `${fieldLabel} degree`,  // "Major/Field of Study degree"
      `${fieldLabel} education`,  // "Major/Field of Study education"
    ];

    const allResults = [];
    for (const query of searchQueries) {
      const results = await searchGlobalKnowledge(userId, query, {}, 3);
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      return null;
    }

    // Deduplicate by ID and sort by similarity
    const seen = new Set();
    const uniqueResults = allResults.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).sort((a, b) => b.similarity - a.similarity).slice(0, 5);

    // Format results with titles and metadata for better AI understanding
    return uniqueResults
      .map((r) => `[${r.metadata.type || 'info'}] ${r.metadata.title || r.metadata.category || 'Entry'}: ${r.content}`)
      .join("\n\n");
  } catch (error) {
    console.error("GlobalKnowledge search failed:", error);
    return null;
  }
}

/**
 * Call AI service to generate response
 */
async function callAI(prompt: string, maxTokens: number): Promise<string> {
  // Check which AI service is configured
  const useGLM = !!process.env.GLM_API_KEY;
  const useOpenAI = !!process.env.OPENAI_API_KEY;

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
  const apiUrl = process.env.ZAI_API_URL || process.env.GLM_API_URL || "https://api.z.ai/api/coding/paas/v4/chat/completions";

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
          content: "You are a helpful assistant that writes scholarship application responses. Be authentic, concise, and professional.",
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
          content: "You are a helpful assistant that writes scholarship application responses. Be authentic, concise, and professional.",
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
 * Save a user-confirmed obvious field value
 * Called when user accepts a chat-generated response for an obvious field
 *
 * Generates embedding for vector similarity search so future fields can
 * find this value semantically.
 *
 * @param userId - User ID
 * @param fieldKey - Normalized lowercase label (e.g., "first name", "gpa")
 * @param fieldLabel - Original label as it appears on the form
 * @param value - The confirmed value
 */
export async function saveConfirmedObviousField(
  userId: string,
  fieldKey: string,
  fieldLabel: string,
  value: string
): Promise<void> {
  try {
    // Map field to appropriate knowledge type
    const typeMap: Record<string, string> = {
      'first name': 'value',
      'last name': 'value',
      'full name': 'value',
      'email': 'value',
      'phone': 'value',
      'university': 'experience',
      'college': 'experience',
      'major': 'value',
      'gpa': 'achievement',
    };

    const knowledgeType = typeMap[fieldKey] || 'value';

    // Check if verified entry already exists for this category
    const existing = await prisma.globalKnowledge.findFirst({
      where: {
        userId,
        category: fieldKey,
        verified: true,
      },
    });

    if (existing) {
      // Update existing verified entry
      await prisma.globalKnowledge.update({
        where: { id: existing.id },
        data: {
          title: fieldLabel,
          content: `Value: ${value}`,
          verified: true,
          confidence: 1.0,
          updatedAt: new Date(),
        },
      });
      console.log(`[saveConfirmedObviousField] Updated "${fieldKey}": ${value}`);
    } else {
      // Create new verified entry
      const knowledge = await prisma.globalKnowledge.create({
        data: {
          userId,
          type: knowledgeType,
          category: fieldKey,
          title: fieldLabel,
          content: `Value: ${value}`,
          verified: true,
          confidence: 1.0,
          source: "user_confirmed",
          useCount: 0,
        },
      });

      // Generate embedding for vector search
      const { generateEmbedding } = await import("~/lib/embeddings.server");
      const embedding = await generateEmbedding(`${fieldLabel}: ${value}`);

      // Update embedding via raw SQL (required for pgvector)
      await prisma.$executeRaw`
        UPDATE "GlobalKnowledge"
        SET embedding = ${JSON.stringify(embedding)}::vector(1536)
        WHERE id = ${knowledge.id}
      `;

      console.log(`[saveConfirmedObviousField] Created "${fieldKey}": ${value} (with embedding)`);
    }
  } catch (error) {
    console.error("[saveConfirmedObviousField] Error:", error);
    // Don't throw - this is a nice-to-have, not critical
  }
}
