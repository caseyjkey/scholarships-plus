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
 * Extract data from transcript
 */
async function extractTranscriptData(text: string): Promise<ExtractedData> {
  // TODO: Implement
  return {
    extractedData: {},
    summary: "Transcript data",
    facts: []
  };
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
