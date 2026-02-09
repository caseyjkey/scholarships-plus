/**
 * Document Extraction Module
 *
 * Extracts structured data from uploaded documents using LLM.
 * Supports: transcripts, tribal documents, and general documents.
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
 * Extract data from tribal document
 */
async function extractTribalDocumentData(text: string): Promise<ExtractedData> {
  // TODO: Implement
  return {
    extractedData: {},
    summary: "Tribal document data",
    facts: []
  };
}

/**
 * Extract data from general document
 */
async function extractGeneralDocumentData(text: string): Promise<ExtractedData> {
  // TODO: Implement
  return {
    extractedData: { summary: "" },
    summary: "General document",
    facts: []
  };
}
