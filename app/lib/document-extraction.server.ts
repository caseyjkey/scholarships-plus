/**
 * Document Extraction Module
 *
 * Extracts structured data from uploaded documents using LLM.
 * Supports: transcripts, tribal documents, and general documents.
 */

import OpenAI from "openai";
import { prisma } from "~/db.server";
import { differenceInDays } from "date-fns";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Check if a fact should be skipped due to recent verified entry
 * Returns true if should skip (recent verified fact exists)
 */
async function shouldSkipFactForStaleness(
  userId: string,
  fieldKey: string
): Promise<boolean> {
  const existingFact = await prisma.globalKnowledge.findFirst({
    where: {
      userId,
      type: "obvious_field",
      title: fieldKey,
      verified: true,
    },
    orderBy: { lastVerified: "desc" },
  });

  if (!existingFact || !existingFact.lastVerified) {
    return false; // No verified fact or no timestamp
  }

  const daysSinceVerified = differenceInDays(
    new Date(),
    existingFact.lastVerified
  );

  if (daysSinceVerified <= 30) {
    console.log(
      `[DocumentExtraction] Skipping ${fieldKey}: ` +
      `verified ${daysSinceVerified} days ago`
    );
    return true; // Skip - verified fact is recent
  }

  console.log(
    `[DocumentExtraction] Stale ${fieldKey}: ` +
    `verified ${daysSinceVerified} days ago, storing new value`
  );
  return false; // Old verified fact - store new one
}

export type DocumentType = "transcript" | "tribal_doc" | "general";

export interface ExtractedData {
  extractedData: any;
  summary: string;
  facts: Array<{ field: string; value: string }>;
}

/**
 * Main router - dispatches to appropriate extractor
 */
export async function extractDocumentData(
  type: DocumentType,
  text: string
): Promise<ExtractedData> {
  switch (type) {
    case "transcript":
      return await extractTranscriptData(text);
    case "tribal_doc":
      return await extractTribalDocumentData(text);
    case "general":
      return await extractGeneralDocumentData(text);
    default:
      throw new Error(`Unknown document type: ${type}`);
  }
}

/**
 * Extract data from transcript using LLM
 */
async function extractTranscriptData(text: string): Promise<ExtractedData> {
  const truncatedText = text.length > 12000
    ? text.substring(0, 12000) + "..."
    : text;

  const prompt = `You are extracting structured academic data from a transcript. Output ONLY valid JSON.

TRANSCRIPT TEXT:
"""
${truncatedText}
"""

Extract the following fields:
- gpa: Overall GPA (number only, e.g., 3.8)
- lastTermGpa: Most recent term GPA if available
- major: Declared major/field of study
- degree: Degree type (Bachelor's, Associate, etc.)
- terms: Array of terms, each with:
  - name: Term name (e.g., "Fall 2024")
  - gpa: Term GPA if shown
  - courses: Array of courses with code, name, grade, credits

Return ONLY JSON:
{
  "gpa": 3.8,
  "lastTermGpa": 3.9,
  "major": "Computer Science",
  "degree": "Bachelor of Science",
  "terms": [...]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a structured data extraction system. Extract factual information from documents and return it as JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    const extractedData = JSON.parse(content);

    // Generate summary
    const summary = generateTranscriptSummary(extractedData);

    // Extract facts for GlobalKnowledge
    const facts: Array<{ field: string; value: string }> = [];
    if (extractedData.gpa) {
      facts.push({ field: "Cumulative GPA", value: String(extractedData.gpa) });
    }
    if (extractedData.major) {
      facts.push({ field: "Major", value: extractedData.major });
    }
    if (extractedData.degree) {
      facts.push({ field: "Degree", value: extractedData.degree });
    }

    return { extractedData, summary, facts };
  } catch (error) {
    console.error("[DocumentExtraction] Transcript extraction failed:", error);
    // Fallback: generic summary
    return {
      extractedData: {},
      summary: "Academic transcript document. Could not extract specific data.",
      facts: []
    };
  }
}

/**
 * Generate human-readable summary from extracted transcript data
 */
function generateTranscriptSummary(data: any): string {
  const parts: string[] = [];

  if (data.terms && data.terms.length > 0) {
    const latestTerm = data.terms[data.terms.length - 1];
    parts.push(`${latestTerm.name} transcript`);
    if (latestTerm.courses) {
      parts.push(`with ${latestTerm.courses.length} courses`);
    }
  }

  if (data.gpa) {
    parts.push(`GPA: ${data.gpa}`);
  }

  if (data.major) {
    parts.push(`Major: ${data.major}`);
  }

  return parts.join(", ") || "Academic transcript document";
}

/**
 * Extract data from tribal document using LLM
 */
async function extractTribalDocumentData(text: string): Promise<ExtractedData> {
  const truncatedText = text.length > 12000
    ? text.substring(0, 12000) + "..."
    : text;

  const prompt = `You are extracting information from a tribal documentation document. Output ONLY valid JSON.

DOCUMENT TEXT:
"""
${truncatedText}
"""

Extract:
- documentType: Type of document (id_card, blood_quantum, enrollment, certificate, other)
- tribeName: Name of the tribe/nation
- metadata: Object with ALL labeled fields found on the document

Extract ANY labeled field you find: enrollment number, status, dates, blood quantum, names, etc.

Return ONLY JSON:
{
  "documentType": "id_card",
  "tribeName": "Cherokee Nation",
  "metadata": {
    "enrollmentNumber": "CN123456",
    "status": "Active",
    "dateOfBirth": "2002-05-15",
    "bloodQuantum": "1/4",
    "issueDate": "2020-01-15"
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a structured data extraction system. Extract factual information from documents and return it as JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    const extractedData = JSON.parse(content);

    // Generate summary
    const summary = generateTribalDocSummary(extractedData);

    // Extract facts for GlobalKnowledge
    const facts: Array<{ field: string; value: string }> = [];
    if (extractedData.tribeName) {
      facts.push({ field: "Tribal Affiliation", value: extractedData.tribeName });
    }

    return { extractedData, summary, facts };
  } catch (error) {
    console.error("[DocumentExtraction] Tribal document extraction failed:", error);
    return {
      extractedData: {},
      summary: "Tribal documentation document. Could not extract specific data.",
      facts: []
    };
  }
}

/**
 * Generate human-readable summary from tribal document data
 */
function generateTribalDocSummary(data: any): string {
  const parts: string[] = [];

  if (data.tribeName) {
    parts.push(data.tribeName);
  }

  if (data.documentType) {
    parts.push(data.documentType.replace(/_/g, " "));
  } else {
    parts.push("tribal document");
  }

  return parts.join(" ") || "Tribal documentation";
}

/**
 * Extract data from general document (summary only)
 */
async function extractGeneralDocumentData(text: string): Promise<ExtractedData> {
  const truncatedText = text.length > 8000
    ? text.substring(0, 8000) + "..."
    : text;

  const prompt = `Summarize this document for a scholarship application knowledge base. Write 2-3 sentences capturing:
- What type of document this is
- Key information relevant for scholarship applications
- Any notable achievements or facts mentioned

DOCUMENT:
"""
${truncatedText}
"""

Summary:`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a document summarization assistant. Create clear, concise summaries for scholarship applications.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const summary = response.choices[0].message.content?.trim() ||
      "General supporting document";

    return {
      extractedData: { summary },
      summary,
      facts: [] // General documents don't produce structured facts
    };
  } catch (error) {
    console.error("[DocumentExtraction] General document extraction failed:", error);
    return {
      extractedData: { summary: "" },
      summary: "Supporting document",
      facts: []
    };
  }
}

/**
 * Store extracted facts in GlobalKnowledge with staleness check
 * Skips facts that have recent verified entries (within 30 days)
 */
export async function storeFactsWithStalenessCheck(
  userId: string,
  facts: Array<{ field: string; value: string }>,
  sourceDocumentId: string
): Promise<{ stored: number; skipped: number }> {
  let stored = 0;
  let skipped = 0;

  for (const fact of facts) {
    const fieldKey = fact.field.toLowerCase().trim();

    // Check for stale/recent verified fact
    const shouldSkip = await shouldSkipFactForStaleness(userId, fact.field);

    if (shouldSkip) {
      skipped++;
      continue;
    }

    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: `${fact.field}: ${fact.value}`,
    });

    // Create GlobalKnowledge entry
    await prisma.globalKnowledge.create({
      data: {
        userId,
        type: "obvious_field",
        category: "personal_info",
        title: fact.field,
        content: `Value: ${fact.value}`,
        source: `document:${sourceDocumentId}`,
        confidence: 0.9,
        verified: false,
        lastVerified: null,
        embedding: embeddingResponse.data[0].embedding as any,
      },
    });

    stored++;
  }

  return { stored, skipped };
}
