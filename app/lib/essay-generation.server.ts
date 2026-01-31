/**
 * Essay Generation Service
 * AI-powered essay generation using RAG (Retrieval-Augmented Generation)
 * Generates scholarship essays based on user's past work
 */

import { prisma } from "~/db.server";
import { searchRelevantChunks } from "./pgvector.server";
import { getNextVersion, createDraft, type EssayDraftWithRelations } from "../models/essay.server";
import type { Application, Scholarship } from "@prisma/client";

interface GenerateEssayOptions {
  approach?: "narrative" | "analytical" | "creative" | "persuasive";
  temperature?: number;
  maxTokens?: number;
}

interface RetrievedChunk {
  id: string;
  displayId: number;
  content: string;
  similarity: number;
  metadata: {
    essayTitle?: string;
    wasAwarded?: boolean;
    date?: string;
    [key: string]: unknown;
  };
}

/**
 * Build the essay generation prompt
 */
export function buildGenerationPrompt(
  scholarship: Scholarship,
  chunks: RetrievedChunk[],
  approach: string = "narrative"
): string {
  // Format chunks for the prompt
  const contextSources = chunks.map((chunk: RetrievedChunk) =>
    `Source [${chunk.displayId}]: "${chunk.content.trim()}" (from ${chunk.metadata.essayTitle || "Unknown Essay"}${chunk.metadata.wasAwarded ? " - Awarded" : ""})`
  ).join("\n\n");

  // Build the prompt
  return `You are an expert scholarship essay writer. Write a compelling essay based on the following:

SCHOLARSHIP: ${scholarship.title}
ORGANIZATION: ${scholarship.organization || "Various"}
${scholarship.amount ? `AWARD: $${scholarship.amount}` : ""}

REQUIREMENTS:
${typeof scholarship.requirements === "object" ? JSON.stringify(scholarship.requirements, null, 2) : scholarship.requirements}

APPROACH: Write in a ${approach} style (narrative=storytelling, analytical=expository, creative=innovative, persuasive=convincing)

CONTEXT FROM STUDENT'S PAST WORK:
${contextSources}

INSTRUCTIONS:
1. Write a complete, well-structured essay (500-800 words)
2. Incorporate relevant stories, achievements, and experiences from the student's past work
3. Use a ${approach} writing approach
4. Be authentic and personalized - avoid generic statements
5. Cite sources using [1], [2] notation when incorporating specific content from past work
6. Create a compelling narrative that demonstrates the student's qualifications
7. End with a strong conclusion that ties back to the scholarship's mission

Your response should be ONLY the essay content, starting with an engaging introduction.`;
}

/**
 * Call GLM API for essay generation
 */
async function callGLMForEssay(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.8,
  maxTokens: number = 3000
): Promise<string> {
  if (!process.env.GLM_API_KEY) {
    throw new Error("GLM_API_KEY is not configured");
  }

  const apiUrl = process.env.ZAI_API_URL || process.env.GLM_API_URL || "https://api.z.ai/api/coding/paas/v4/chat/completions";
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "glm-4.7",
      // Disable chain-of-thought thinking mode to get direct responses
      thinking: {
        type: "disabled",
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GLM API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Generate an essay draft using RAG
 */
export async function generateEssay(
  application: Application & { scholarship: Scholarship },
  options: GenerateEssayOptions = {}
): Promise<EssayDraftWithRelations> {
  const { approach = "narrative", temperature = 0.8, maxTokens = 3000 } = options;

  try {
    // Step 1: Search for relevant chunks from user's past essays
    const chunks = await searchRelevantChunks(application.userId, application.scholarship.title, {}, 10);

    if (chunks.length === 0) {
      throw new Error("No relevant past essays found. Please upload some essays first.");
    }

    // Step 2: Build the generation prompt
    const systemPrompt = `You are an expert scholarship essay writer with years of experience helping students win competitive scholarships. Your essays are authentic, compelling, and tailored to each scholarship's mission.`;

    const userPrompt = buildGenerationPrompt(application.scholarship, chunks as unknown as RetrievedChunk[], approach);

    // Step 3: Generate the essay
    const content = await callGLMForEssay(systemPrompt, userPrompt, temperature, maxTokens);

    // Step 4: Get the next version number
    const version = await getNextVersion(application.id);

    // Step 5: Save the draft
    const draft = await createDraft({
      applicationId: application.id,
      version,
      approach,
      content,
      prompt: userPrompt,
      sources: chunks.map((c: any) => ({
        id: c.id,
        displayId: c.displayId,
        content: c.content,
        title: c.metadata.essayTitle,
        awarded: c.metadata.wasAwarded,
      })),
    });

    // Step 6: Return the draft with relations
    const savedDraft = await prisma.essayDraft.findUnique({
      where: { id: draft.id },
      include: {
        application: {
          include: {
            scholarship: true,
          },
        },
        parent: true,
      },
    });

    if (!savedDraft) {
      throw new Error("Failed to save draft");
    }

    return savedDraft as EssayDraftWithRelations;
  } catch (error) {
    console.error("Essay generation error:", error);
    throw error;
  }
}

/**
 * Revise an existing essay based on feedback
 */
export async function reviseEssay(
  draftId: string,
  feedback: string,
  temperature: number = 0.7
): Promise<EssayDraftWithRelations> {
  try {
    // Get the original draft
    const originalDraft = await prisma.essayDraft.findUnique({
      where: { id: draftId },
      include: {
        application: {
          include: {
            scholarship: true,
          },
        },
      },
    });

    if (!originalDraft) {
      throw new Error("Draft not found");
    }

    // Build revision prompt
    const systemPrompt = `You are an expert scholarship essay writer. The user has provided feedback on an essay draft. Revise the essay to address the feedback while maintaining its core strengths and authenticity.`;

    const userPrompt = `ORIGINAL ESSAY:
${originalDraft.content}

FEEDBACK:
${feedback}

REVISED ESSAY:
Please provide the revised essay that addresses all the feedback points.`;

    // Generate revised content
    const revisedContent = await callGLMForEssay(systemPrompt, userPrompt, temperature, 3000);

    // Get next version
    const version = await getNextVersion(originalDraft.applicationId);

    // Create revision as new draft
    const revisedDraft = await createDraft({
      applicationId: originalDraft.applicationId,
      version,
      approach: originalDraft.approach || undefined,
      content: revisedContent,
      prompt: userPrompt,
      sources: originalDraft.sources,
      parentId: draftId,
    });

    // Return with relations
    const savedDraft = await prisma.essayDraft.findUnique({
      where: { id: revisedDraft.id },
      include: {
        application: {
          include: {
            scholarship: true,
          },
        },
        parent: true,
      },
    });

    if (!savedDraft) {
      throw new Error("Failed to save revised draft");
    }

    return savedDraft as EssayDraftWithRelations;
  } catch (error) {
    console.error("Essay revision error:", error);
    throw error;
  }
}
