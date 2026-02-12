/**
 * Persona Profile Generation Module
 *
 * Analyzes user essays to extract writing style, key experiences,
 * and quick facts for use in synthesized essay generation.
 *
 * This runs in the background after essay upload to build
 * a user's writing persona for AI-powered essay synthesis.
 */

import OpenAI from "openai";
import { prisma } from "~/db.server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a persona profile for a user from their essays
 * This is the main analysis function
 */
async function generatePersonaProfile(
  userId: string,
  essays: Array<{ id: string; essayPrompt: string; body: string; essay: string }>
): Promise<{
  writingStyle: any;
  keyFacts: any;
  quickFacts: any;
}> {
  console.log(`[PersonaGeneration] Starting persona analysis for ${userId.substring(0, 8)}...`);

  // Step 1: Extract writing style
  const writingStyle = await extractWritingStyle(essays);

  // Step 2: Extract key facts (experiences, achievements, values, goals)
  const keyFacts = await extractKeyFacts(essays);

  // Step 3: Extract quick facts from existing obvious_field knowledge
  const quickFacts = await extractQuickFacts(userId);

  console.log(`[PersonaGeneration] ✅ Persona analysis complete`);

  return {
    writingStyle,
    keyFacts,
    quickFacts,
  };
}

/**
 * Sample representative essays from the user's collection
 * Prioritizes awarded essays and recent ones
 */
async function sampleRepresentativeEssays(
  userId: string
): Promise<Array<{ id: string; essayPrompt: string; body: string; essay: string }>> {
  // Get all essays, prioritize awarded ones
  const allEssays = await prisma.essay.findMany({
    where: {
      userId,
      // Only use uploaded essays (has content in body)
      body: { not: { equals: "" } },
    },
    select: {
      id: true,
      essayPrompt: true,
      body: true,
      essay: true,
      wasAwarded: true,
    },
    orderBy: [
      { wasAwarded: "desc" }, // Awarded essays first
      { createdAt: "desc" },  // Then most recent
    ],
  });

  // Filter out essays with empty or too short content
  const validEssays = allEssays.filter(
    (e) => e.body && e.body.trim().length > 200
  );

  // Minimum essay count check (validation requirement)
  if (validEssays.length < 3) {
    throw new Error(
      `Insufficient essays for persona generation (found ${validEssays.length}, minimum 3 required)`
    );
  }

  // Sample: 75% awarded, 25% others (up to 15 total)
  const awarded = validEssays.filter((e) => e.wasAwarded === true);
  const others = validEssays.filter((e) => e.wasAwarded !== true);

  const awardedSample = awarded.slice(0, 12);
  const otherSample = others.slice(0, 3);

  return [...awardedSample, ...otherSample].slice(0, 15);
}

/**
 * Extract writing style analysis from essays
 */
async function extractWritingStyle(
  essays: Array<{ id: string; essayPrompt: string; body: string; essay: string }>
): Promise<any> {
  // Build essay text for analysis (truncate each essay if needed)
  const essayTexts = essays
    .map((e) => {
      const text = e.body || e.essay || "";
      const prompt = e.essayPrompt || "Essay";
      const truncated = text.length > 2000 ? text.substring(0, 2000) + "..." : text;
      return `---\nPROMPT: ${prompt}\n${truncated}\n---`;
    })
    .join("\n\n");

  const prompt = `Analyze the following essays and extract the author's writing style.

ESSAYS:
${essayTexts}

Return ONLY valid JSON with this structure:
{
  "learned": {
    "tone": "descriptive tone (e.g., 'inspirational', 'pragmatic', 'personal', 'formal', 'conversational')",
    "voice": "voice description (e.g., 'first-person narrative', 'confident', 'humble', 'enthusiastic')",
    "complexity": "complexity level (e.g., 'simple', 'moderate', 'sophisticated')",
    "focus": "primary focus (e.g., 'story-driven', 'achievement-oriented', 'community-focused', 'academic')"
  },
  "examples": [
    {
      "context": "when this style is used",
      "excerpt": "representative quote from essays (max 100 words)",
      "technique": "writing technique observed (e.g., 'anecdote opener', 'conclusion with forward-looking statement')"
    }
  ],
  "overrides": {
    "avoid": ["phrases or patterns to avoid"],
    "prefer": ["preferred phrases or patterns"]
  }
}

CRITICAL RULES:
- Extract ONLY patterns that appear consistently across 3+ essays
- Examples must be DIRECT quotes from the provided essays
- If insufficient data (fewer than 5 essays), set learned to null and examples/overrides to empty arrays
- Return ONLY the JSON object, no explanations
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use gpt-4o for better analysis quality
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a writing analysis system. Extract writing style patterns from essays and return them as JSON. Only include patterns that appear consistently across multiple essays.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.warn("[PersonaGeneration] No writing style content returned");
      return { learned: null, examples: [], overrides: { avoid: [], prefer: [] } };
    }

    const parsed = JSON.parse(content);
    console.log("[PersonaGeneration] ✅ Writing style extracted");
    return parsed;
  } catch (error) {
    console.error("[PersonaGeneration] Writing style extraction failed:", error);
    // Return safe default on error
    return { learned: null, examples: [], overrides: { avoid: [], prefer: [] } };
  }
}

/**
 * Extract key facts (experiences, achievements, values, goals) from essays
 */
async function extractKeyFacts(
  essays: Array<{ id: string; essayPrompt: string; body: string; essay: string }>
): Promise<any> {
  // Build essay text for analysis
  const essayTexts = essays
    .map((e) => {
      const text = e.body || e.essay || "";
      const prompt = e.essayPrompt || "Essay";
      const truncated = text.length > 1500 ? text.substring(0, 1500) + "..." : text;
      return `---\nPROMPT: ${prompt}\n${truncated}\n---`;
    })
    .join("\n\n");

  const prompt = `Extract structured information about the essay author from their scholarship application materials.

ESSAYS:
${essayTexts}

CRITICAL RULES - PREVENTING GARBAGE DATA:
1. Extract information in FIRST-PERSON context ("I", "my", "me")
2. DO NOT extract information about OTHER people mentioned
3. DO NOT extract information from quotes, examples, or stories about others
4. Use null if information is ambiguous or clearly about someone else
5. Each entry should include source essay context

Return ONLY valid JSON:
{
  "experiences": [
    {
      "title": "short title (e.g., 'Food Bank Volunteer')",
      "description": "detailed description (1-3 sentences)",
      "category": "leadership | community_service | academic | work | extracurricular",
      "timeframe": "when this occurred (e.g., '2022-2023', 'sophomore year')",
      "sourceEssay": "essay title or prompt"
    }
  ],
  "achievements": [
    {
      "title": "achievement name",
      "description": "what was accomplished",
      "impact": "impact or result (quantifiable if possible)",
      "category": "academic | leadership | service | other",
      "sourceEssay": "essay title or prompt"
    }
  ],
  "values": [
    {
      "value": "core value (e.g., 'community service', 'education equity')",
      "evidence": "how this value is demonstrated in essays",
      "sourceEssay": "essay title or prompt"
    }
  ],
  "goals": [
    {
      "goal": "short-term or long-term goal",
      "motivation": "why this goal matters",
      "sourceEssay": "essay title or prompt"
    }
  ]
}

STRICT REQUIREMENTS:
- Return ONLY the JSON object, no explanations
- Use empty arrays [] if no information found
- Use null for missing/ambiguous information
- DO NOT guess or make up values
- Evidence should be DIRECT quotes or close paraphrases
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use gpt-4o for better analysis quality
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a structured data extraction system. Extract factual information from essays about the AUTHOR ONLY (first-person context) and return it as JSON. Never extract information about other people mentioned in the essays.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2500,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      console.warn("[PersonaGeneration] No key facts content returned");
      return {
        experiences: [],
        achievements: [],
        values: [],
        goals: [],
      };
    }

    const parsed = JSON.parse(content);
    console.log("[PersonaGeneration] ✅ Key facts extracted");
    return parsed;
  } catch (error) {
    console.error("[PersonaGeneration] Key facts extraction failed:", error);
    // Return safe default on error
    return {
      experiences: [],
      achievements: [],
      values: [],
      goals: [],
    };
  }
}

/**
 * Extract quick facts from existing GlobalKnowledge obvious_field entries
 * This reuses the fact extraction that already happened during essay upload
 */
async function extractQuickFacts(userId: string): Promise<any> {
  try {
    // Get verified obvious_field facts (validation requirement: use obvious_field type)
    const obviousFields = await prisma.globalKnowledge.findMany({
      where: {
        userId,
        type: "obvious_field", // Validation requirement: filter by type
        verified: true, // Validation requirement: only verified facts
      },
      select: {
        title: true,
        content: true,
      },
    });

    // Extract values from content (format: "Value: <actual value>")
    const fieldMap = {
      "first name": "name",
      "last name": null, // Part of name, not separate
      "email address": "email",
      "phone number": "phone",
      "cumulative gpa": "gpa",
      "university": "university",
      "college": "university",
      "major": "major",
      "class year": "year",
    };

    const quickFacts: any = {
      name: null,
      email: null,
      phone: null,
      gpa: null,
      university: null,
      major: null,
      year: null,
    };

    for (const field of obviousFields) {
      const match = field.content.match(/^Value:\s*(.+)$/m);
      if (!match) continue;

      const value = match[1].trim();
      const titleLower = field.title.toLowerCase();

      // Map to quickFacts keys
      for (const [pattern, key] of Object.entries(fieldMap)) {
        if (titleLower.includes(pattern) && key) {
          // Special handling for name (combine first + last)
          if (key === "name" && quickFacts.name) {
            quickFacts.name = `${quickFacts.name} ${value}`;
          } else if (key) {
            (quickFacts as any)[key] = value;
          }
          break;
        }
      }
    }

    console.log(`[PersonaGeneration] ✅ Quick facts extracted from ${obviousFields.length} obvious fields`);
    return quickFacts;
  } catch (error) {
    console.error("[PersonaGeneration] Quick facts extraction failed:", error);
    // Return safe default on error
    return {
      name: null,
      email: null,
      phone: null,
      gpa: null,
      university: null,
      major: null,
      year: null,
    };
  }
}

/**
 * Background job wrapper for persona profile generation
 * This handles the full lifecycle: status updates, progress tracking, error handling
 */
export async function generatePersonaProfileBackground(
  userId: string
): Promise<void> {
  console.log(`[PersonaGeneration] Starting background job for user ${userId.substring(0, 8)}...`);

  // Create or update profile record with generating status
  const profile = await prisma.personaProfile.upsert({
    where: { userId },
    create: {
      userId,
      status: "generating",
      progress: 0,
      startedAt: new Date(),
    },
    update: {
      status: "generating",
      progress: 0,
      startedAt: new Date(),
      errorMessage: null, // Clear any previous error
    },
  });

  try {
    // Progress: 10% - Sampling essays
    await prisma.personaProfile.update({
      where: { id: profile.id },
      data: { progress: 10 },
    });

    const essays = await sampleRepresentativeEssays(userId);
    console.log(`[PersonaGeneration] Sampled ${essays.length} essays`);

    // Progress: 30% - Analyzing writing style
    await prisma.personaProfile.update({
      where: { id: profile.id },
      data: { progress: 30 },
    });

    const result = await generatePersonaProfile(userId, essays);

    // Progress: 90% - Finalizing
    await prisma.personaProfile.update({
      where: { id: profile.id },
      data: { progress: 90 },
    });

    // Progress: 100% - Complete
    await prisma.personaProfile.update({
      where: { id: profile.id },
      data: {
        status: "ready",
        progress: 100,
        completedAt: new Date(),
        writingStyle: result.writingStyle,
        keyFacts: result.keyFacts,
        quickFacts: result.quickFacts,
        sourceEssayCount: essays.length,
        totalWords: essays.reduce((sum, e) => sum + (e.body?.split(/\s+/).length || 0), 0),
        lastRefreshedAt: new Date(),
      },
    });

    console.log(`[PersonaGeneration] ✅ Completed for user ${userId.substring(0, 8)}...`);
  } catch (error: any) {
    console.error(`[PersonaGeneration] ❌ Failed for user ${userId.substring(0, 8)}...:`, error);

    await prisma.personaProfile.update({
      where: { id: profile.id },
      data: {
        status: "failed",
        errorMessage: error.message,
        completedAt: new Date(),
        progress: 0, // Reset progress on failure
      },
    });
  }
}
