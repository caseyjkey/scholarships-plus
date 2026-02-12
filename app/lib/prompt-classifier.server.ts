/**
 * Prompt Type Classifier Module
 *
 * Classifies scholarship essay prompts into types (career, academic, leadership, etc.)
 * for appropriate persona style selection in synthesis generation.
 *
 * Uses gpt-4o-mini for efficient classification with caching support.
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Prompt types for scholarship essays
 */
export type PromptType =
  | "career"
  | "academic"
  | "leadership"
  | "community_service"
  | "personal_challenges"
  | "role_model"
  | "goals"
  | "values"
  | "creativity"
  | "general";

/**
 * Classification result with confidence
 */
export interface ClassificationResult {
  type: PromptType;
  confidence: number;
  reasoning?: string;
}

/**
 * Simple cache for classification results
 * Key: prompt text hash, Value: classification result
 */
const classificationCache = new Map<string, ClassificationResult>();

/**
 * Generate a simple hash for caching
 */
function hashPrompt(prompt: string): string {
  // Simple hash function for cache key
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Classify an essay prompt into a type
 * Uses caching to avoid re-classifying similar prompts
 */
export async function classifyPrompt(
  essayPrompt: string
): Promise<ClassificationResult> {
  const cacheKey = hashPrompt(essayPrompt.trim().toLowerCase());

  // Check cache first
  if (classificationCache.has(cacheKey)) {
    return classificationCache.get(cacheKey)!;
  }

  // Truncate very long prompts for classification
  const truncatedPrompt =
    essayPrompt.length > 500 ? essayPrompt.substring(0, 500) + "..." : essayPrompt;

  const systemPrompt = `You are a scholarship essay prompt classifier. Analyze the essay prompt and classify it into ONE of the following types:

PROMPT TYPES:
- "career": Questions about career goals, professional aspirations, future work
- "academic": Questions about academic interests, research, study plans, intellectual curiosity
- "leadership": Questions about leadership experience, taking charge, influencing others
- "community_service": Questions about volunteer work, community involvement, giving back
- "personal_challenges": Questions about overcoming obstacles, hardships, personal growth
- "role_model": Questions about people who inspire you, mentors, influences
- "goals": General goal questions (short-term and long-term)
- "values": Questions about what matters to you, beliefs, principles
- "creativity": Questions asking for creative thinking, unique perspectives, "think outside the box"
- "general": General or broad questions that don't fit specific categories

Return ONLY valid JSON with this structure:
{
  "type": "prompt_type_from_list_above",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why this type was chosen"
}`;

  const userPrompt = `Classify this scholarship essay prompt:

"${truncatedPrompt}"

Return ONLY valid JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content returned from classification");
    }

    const result = JSON.parse(content) as ClassificationResult;

    // Validate result structure
    const validTypes: PromptType[] = [
      "career",
      "academic",
      "leadership",
      "community_service",
      "personal_challenges",
      "role_model",
      "goals",
      "values",
      "creativity",
      "general",
    ];

    if (!validTypes.includes(result.type)) {
      console.warn(`[PromptClassifier] Unknown type: ${result.type}, defaulting to "general"`);
      result.type = "general";
    }

    // Cache the result
    classificationCache.set(cacheKey, result);

    console.log(`[PromptClassifier] Classified as "${result.type}" (confidence: ${result.confidence})`);
    return result;
  } catch (error) {
    console.error("[PromptClassifier] Classification failed:", error);

    // Return safe default on error
    const defaultResult: ClassificationResult = {
      type: "general",
      confidence: 0.5,
      reasoning: "Default due to classification error",
    };

    return defaultResult;
  }
}

/**
 * Clear the classification cache (useful for testing or forcing re-classification)
 */
export function clearClassificationCache(): void {
  classificationCache.clear();
  console.log("[PromptClassifier] Cache cleared");
}

/**
 * Get cache size (for monitoring)
 */
export function getCacheSize(): number {
  return classificationCache.size;
}
