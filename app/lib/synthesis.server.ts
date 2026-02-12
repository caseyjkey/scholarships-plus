/**
 * Synthesis Engine Module
 *
 * Generates synthesized essay responses by combining:
 * 1. User's writing persona (from PersonaProfile)
 * 2. Relevant past experiences (from vector search)
 * 3. Quick facts (from verified obvious fields)
 * 4. Essay prompt context
 *
 * This creates original, authentic responses in the user's voice
 * while drawing on their actual experiences and achievements.
 */

import OpenAI from "openai";
import { prisma } from "~/db.server";
import { searchEssayChunks } from "./pgvector.server";
import { classifyPrompt, type PromptType } from "./prompt-classifier.server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Synthesis request parameters
 */
export interface SynthesisRequest {
  userId: string;
  fieldId: string; // Application field identifier
  fieldLabel: string; // Human-readable field name
  essayPrompt: string; // The scholarship essay prompt/question
  scholarshipTitle: string; // For context
  wordLimit?: number; // Optional word limit
  styleOverrides?: StyleOverrides; // Optional style adjustments
}

/**
 * Style override options for regeneration
 */
export interface StyleOverrides {
  tone?: string;
  voice?: string;
  complexity?: string;
  focus?: string;
}

/**
 * Source citation for synthesized response
 */
export interface SourceCitation {
  id: number;
  title: string;
  excerpt: string;
  awarded?: boolean;
}

/**
 * Synthesis response with sources
 */
export interface SynthesisResponse {
  content: string; // The synthesized essay response
  sources: SourceCitation[]; // Source essays used
  promptType: PromptType; // Classification of prompt type
  wordCount: number; // Word count of generated response
  styleUsed: StyleUsed; // Writing style applied
}

/**
 * Writing style applied to the response
 */
export interface StyleUsed {
  tone: string;
  voice: string;
  complexity: string;
  focus: string;
  overrides?: boolean; // Whether user overrides were applied
}

/**
 * Generate a synthesized essay response
 * This is the main synthesis function
 */
export async function generateSynthesis(
  request: SynthesisRequest
): Promise<SynthesisResponse> {
  console.log(`[Synthesis] Generating response for field "${request.fieldLabel}"...`);

  // Step 1: Load persona profile
  const persona = await loadPersonaProfile(request.userId);

  if (!persona) {
    throw new Error("Persona profile not ready. Please upload more essays first.");
  }

  // Step 2: Classify prompt type
  const classification = await classifyPrompt(request.essayPrompt);
  console.log(`[Synthesis] Prompt classified as "${classification.type}"`);

  // Step 3: Vector search for relevant experiences
  const searchQuery = buildSearchQuery(request.essayPrompt, classification.type);
  const chunks = await searchEssayChunks(request.userId, searchQuery, {}, 10);

  console.log(`[Synthesis] Retrieved ${chunks.length} relevant chunks`);

  // Step 4: Extract quick facts from persona
  const quickFacts = persona.quickFacts as any;

  // Step 4.5: Check for obvious fields - return direct value without LLM
  const obviousFieldResult = checkObviousField(request.fieldLabel, quickFacts);
  if (obviousFieldResult) {
    console.log(`[Synthesis] ✅ Obvious field detected - returning direct value`);
    return {
      content: obviousFieldResult,
      sources: [],
      promptType: "obvious" as PromptType,
      wordCount: 1,
      styleUsed: {
        tone: "direct",
        voice: "factual",
        complexity: "simple",
        focus: "accurate",
      },
    };
  }

  // Step 5: Determine writing style (with or without overrides)
  const styleUsed = determineStyle(persona.writingStyle as any, request.styleOverrides, classification.type);

  // Step 6: Generate synthesis via LLM
  const synthesis = await generateSynthesisWithLLM({
    essayPrompt: request.essayPrompt,
    scholarshipTitle: request.scholarshipTitle,
    fieldLabel: request.fieldLabel,
    wordLimit: request.wordLimit,
    chunks,
    quickFacts,
    styleUsed,
    promptType: classification.type,
  });

  // Step 7: Build source citations
  const sources = buildSourceCitations(chunks);

  console.log(`[Synthesis] ✅ Generated ${synthesis.content.split(/\s+/).length} words`);

  return {
    content: synthesis.content,
    sources,
    promptType: classification.type,
    wordCount: synthesis.content.split(/\s+/).length,
    styleUsed,
  };
}

/**
 * Load user's persona profile
 */
async function loadPersonaProfile(userId: string): Promise<any | null> {
  const profile = await prisma.personaProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    return null;
  }

  // Check if profile is ready
  if (profile.status !== "ready") {
    console.log(`[Synthesis] Profile status: ${profile.status}, progress: ${profile.progress}%`);
    return null;
  }

  return profile;
}

/**
 * Build search query for vector search
 * Combines prompt text with prompt type for better retrieval
 */
function buildSearchQuery(essayPrompt: string, promptType: PromptType): string {
  const typeKeywords: Record<PromptType, string[]> = {
    career: ["career", "professional", "job", "work", "aspirations", "goals"],
    academic: ["academic", "research", "study", "intellectual", "learning"],
    leadership: ["leadership", "lead", "team", "organization", "president", "officer"],
    community_service: ["volunteer", "community", "service", "helping", "outreach"],
    personal_challenges: ["challenge", "overcome", "obstacle", "hardship", "difficult"],
    role_model: ["inspire", "mentor", "influence", "role model", "look up to"],
    goals: ["goal", "future", "plan", "aspire", "achieve"],
    values: ["value", "believe", "principle", "important", "matter"],
    creativity: ["creative", "innovative", "unique", "different", "think"],
    general: ["experience", "story", "about", "myself", "background"],
  };

  const keywords = typeKeywords[promptType] || typeKeywords.general;

  // Combine prompt with relevant keywords
  return `${essayPrompt} ${keywords.join(" ")}`;
}

/**
 * Determine writing style to use
 * Combines persona style with optional user overrides
 */
function determineStyle(
  personaWritingStyle: any,
  overrides?: StyleOverrides,
  promptType?: PromptType
): StyleUsed {
  // Get base style from persona
  const baseStyle = personaWritingStyle?.learned || {
    tone: "conversational",
    voice: "first-person narrative",
    complexity: "moderate",
    focus: "story-driven",
  };

  // Apply overrides if provided
  if (overrides) {
    return {
      tone: overrides.tone || baseStyle.tone,
      voice: overrides.voice || baseStyle.voice,
      complexity: overrides.complexity || baseStyle.complexity,
      focus: overrides.focus || baseStyle.focus,
      overrides: true,
    };
  }

  return {
    tone: baseStyle.tone,
    voice: baseStyle.voice,
    complexity: baseStyle.complexity,
    focus: baseStyle.focus,
    overrides: false,
  };
}

/**
 * Generate synthesis using LLM
 * Combines persona, retrieved experiences, and context
 */
async function generateSynthesisWithLLM(params: {
  essayPrompt: string;
  scholarshipTitle: string;
  fieldLabel: string;
  wordLimit?: number;
  chunks: Array<{
    id: number;
    displayId: number;
    content: string;
    similarity: number;
    metadata: any;
  }>;
  quickFacts: any;
  styleUsed: StyleUsed;
  promptType: PromptType;
}): Promise<{ content: string }> {
  // Format chunks for prompt
  const formattedChunks = params.chunks
    .slice(0, 7) // Use top 7 chunks
    .map(
      (chunk) =>
        `[Source ${chunk.displayId}]: ${chunk.content.trim()} (from "${chunk.metadata.essayTitle}")`
    )
    .join("\n\n");

  // Format quick facts
  const quickFactsText = formatQuickFacts(params.quickFacts);

  // Build system prompt
  const systemPrompt = `You are an expert scholarship essay writer who crafts ORIGINAL responses in a student's authentic voice.

CRITICAL INSTRUCTIONS - PREVENTING PLAGIARISM:
1. DO NOT copy-paste from the provided sources
2. Use sources for INSPIRATION and FACTS only
3. Write ORIGINAL sentences and paragraphs
4. Maintain the student's natural voice and style
5. Cite sources using [1], [2] notation when drawing specific facts

WRITING STYLE TO EMULATE:
- Tone: ${params.styleUsed.tone}
- Voice: ${params.styleUsed.voice}
- Complexity: ${params.styleUsed.complexity}
- Focus: ${params.styleUsed.focus}

STUDENT QUICK FACTS:
${quickFactsText}

RELEVANT PAST EXPERIENCES (for inspiration, not copying):
${formattedChunks}

TASK: Write an ORIGINAL essay response that authentically represents this student's voice and experiences.

REQUIREMENTS:
- ${params.wordLimit ? `Keep response under ${params.wordLimit} words` : "Keep response concise (under 500 words)"}
- Use first-person perspective ("I", "my")
- Draw from the provided experiences for inspiration
- Cite sources when referencing specific facts or experiences
- Write originally - do not copy phrases or sentences from sources
- Match the specified writing style characteristics
- Address the essay prompt directly and thoughtfully`;

  const userPrompt = `SCHOLARSHIP: ${params.scholarshipTitle}

ESSAY PROMPT: ${params.essayPrompt}

FIELD: ${params.fieldLabel}

Write an ORIGINAL, authentic response in the student's voice that addresses this prompt.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7, // Slightly higher for creativity while maintaining consistency
      max_tokens: params.wordLimit ? Math.min(params.wordLimit * 2, 2000) : 1500,
    });

    const content = response.choices[0].message.content || "";

    return { content };
  } catch (error) {
    console.error("[Synthesis] LLM generation failed:", error);
    throw new Error(`Failed to generate synthesis: ${error}`);
  }
}

/**
 * Format quick facts for prompt
 */
function formatQuickFacts(quickFacts: any): string {
  if (!quickFacts) {
    return "No quick facts available";
  }

  const facts: string[] = [];

  if (quickFacts.name) facts.push(`Name: ${quickFacts.name}`);
  if (quickFacts.email) facts.push(`Email: ${quickFacts.email}`);
  if (quickFacts.university) facts.push(`University: ${quickFacts.university}`);
  if (quickFacts.major) facts.push(`Major: ${quickFacts.major}`);
  if (quickFacts.year) facts.push(`Year: ${quickFacts.year}`);
  if (quickFacts.gpa) facts.push(`GPA: ${quickFacts.gpa}`);

  return facts.length > 0 ? facts.join("\n") : "No quick facts available";
}

/**
 * Check if field is an obvious field and return direct value
 * For basic fields like First Name, Email, etc., return the quick fact value directly
 * without calling the LLM to prevent hallucinations
 */
function checkObviousField(fieldLabel: string, quickFacts: any): string | null {
  if (!quickFacts || !fieldLabel) {
    return null;
  }

  const label = fieldLabel.toLowerCase();
  const name = quickFacts.name?.toLowerCase() || "";
  const email = quickFacts.email?.toLowerCase() || "";
  const phone = quickFacts.phone?.toString() || "";
  const university = quickFacts.university || "";
  const major = quickFacts.major || "";
  const gpa = quickFacts.gpa?.toString() || "";
  const year = quickFacts.year?.toString() || "";

  // First Name - extract from name field
  if (label.includes("first name") || label === "first name" || label === "firstname") {
    const firstName = name.split(" ")[0];
    if (firstName) {
      return firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }
    return null;
  }

  // Last Name - extract from name field
  if (label.includes("last name") || label === "last name" || label === "lastname" || label === "surname" || label === "family name") {
    const parts = name.trim().split(" ");
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    if (lastName) {
      return lastName.charAt(0).toUpperCase() + lastName.slice(1);
    }
    return null;
  }

  // Email Address
  if (label.includes("email") || label === "email" || label === "email address") {
    return email || null;
  }

  // Phone Number
  if (label.includes("phone") || label === "phone" || label === "phone number" || label === "mobile" || label === "telephone") {
    return phone || null;
  }

  // University/College
  if (label.includes("university") || label.includes("college") || label.includes("institution") || label.includes("school") && !label.includes("high school")) {
    return university || null;
  }

  // Major
  if (label.includes("major") || label.includes("field of study") || label.includes("program")) {
    return major || null;
  }

  // GPA
  if (label.includes("gpa") || label.includes("grade point") || label === "cumulative gpa") {
    return gpa || null;
  }

  // Class Year
  if (label.includes("class year") || label.includes("year") || label.includes("graduation year")) {
    return year || null;
  }

  return null;
}

/**
 * Build source citations from chunks
 */
function buildSourceCitations(
  chunks: Array<{
    id: number;
    displayId: number;
    content: string;
    metadata: any;
  }>
): SourceCitation[] {
  return chunks.slice(0, 5).map((chunk) => ({
    id: chunk.displayId,
    title: chunk.metadata.essayTitle || "Unknown Essay",
    excerpt: chunk.content.substring(0, 150) + (chunk.content.length > 150 ? "..." : ""),
    awarded: chunk.metadata.wasAwarded,
  }));
}

/**
 * Save synthesized response to GlobalKnowledge
 */
export async function saveSynthesizedResponse(params: {
  userId: string;
  fieldId: string;
  fieldLabel: string;
  content: string;
  promptType: PromptType;
  styleUsed: StyleUsed;
  sources: SourceCitation[];
  wordCount: number;
}): Promise<void> {
  // Check for existing synthesized response for this field
  const existingResponse = await prisma.globalKnowledge.findFirst({
    where: {
      userId: params.userId,
      type: "synthesized_response",
      metadata: {
        path: ["fieldId"],
        equals: params.fieldId,
      },
    },
  });

  // If exists, archive it as past_synthesis before creating new one
  if (existingResponse) {
    await prisma.globalKnowledge.update({
      where: { id: existingResponse.id },
      data: {
        type: "past_synthesis",
        // Keep all other data the same for version history
      },
    });
    console.log(`[Synthesis] Archived previous version for field "${params.fieldLabel}"`);
  }

  // Create new synthesized response (this becomes the current one)
  await prisma.globalKnowledge.create({
    data: {
      userId: params.userId,
      type: "synthesized_response",
      category: params.promptType,
      title: `Synthesized: ${params.fieldLabel}`,
      content: params.content,
      verified: false, // Synthesized responses need user confirmation
      confidence: 0.9,
      metadata: {
        fieldId: params.fieldId,
        fieldLabel: params.fieldLabel,
        promptType: params.promptType,
        styleUsed: params.styleUsed,
        sources: params.sources,
        wordCount: params.wordCount,
        generatedAt: new Date().toISOString(),
      },
      embedding: null, // Will be computed if needed for search
    },
  });

  console.log(`[Synthesis] Saved synthesized response for field "${params.fieldLabel}"`);
}

/**
 * Find past responses for history panel
 */
export async function findPastResponses(userId: string, fieldLabel: string): Promise<any[]> {
  const responses = await prisma.globalKnowledge.findMany({
    where: {
      userId,
      OR: [
        { type: "synthesized_response" },
        { type: "past_synthesis" },
        { type: "essay_response" },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Group by year (last year vs older)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return responses.map((r) => ({
    id: r.id,
    content: r.content,
    type: r.type,
    category: r.category,
    metadata: r.metadata,
    isLastYear: r.createdAt > oneYearAgo,
  }));
}
