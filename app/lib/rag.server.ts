/**
 * RAG (Retrieval-Augmented Generation) Query Pipeline
 * Refactored to use pgvector with chunk-based citations
 *
 * This file now acts as an interface layer, delegating to pgvector.server.ts
 * for the actual pgvector-based implementation with numbered citations.
 */

import {
  searchRelevantChunks,
  formatChunksForPrompt,
  buildCitationSystemPrompt,
  generateRAGResponseWithCitations,
} from "./pgvector.server";
import type { Source, Message } from "~/types/chat";

interface RAGQueryOptions {
  userId: string;
  scholarshipId: string;
  query: string;
  conversationHistory?: Message[];
  systemPrompt?: string;
  maxSources?: number;
}

interface RAGResponse {
  content: string;
  sources: Source[];
  citations: Array<{
    reference: string;
    sourceIds: number[];
    sources: Array<{
      id: number;
      title: string;
      excerpt: string;
      awarded?: boolean;
    }>;
  }>;
  agentStatus: string;
}

/**
 * Main RAG query function
 * Searches for relevant chunks and generates AI response with numbered citations
 *
 * Architecture:
 * 1. Query pgvector for top-k similar chunks
 * 2. Format as "Source [ID: 1]: content..."
 * 3. Instruct LLM to cite with [1], [2] notation
 * 4. Post-process to extract citations and map to sources
 */
export async function queryRAG(options: RAGQueryOptions): Promise<RAGResponse> {
  const {
    userId,
    scholarshipId,
    query,
    conversationHistory = [],
    systemPrompt,
    maxSources = 5,
  } = options;

  try {
    // Step 1: Search pgvector for relevant chunks (with pgvector similarity)
    const chunks = await searchRelevantChunks(userId, query, {}, maxSources);

    if (chunks.length === 0) {
      return {
        content: "I don't have any relevant past essays to reference for this request. Please upload some essays first.",
        sources: [],
        citations: [],
        agentStatus: "No relevant content found",
      };
    }

    // Step 2: Generate RAG response with citations
    const response = await generateRAGResponseWithCitations({
      userId,
      query,
      topK: maxSources,
    });

    // Step 3: Convert chunks to Source format for frontend compatibility
    const sources: Source[] = chunks.map((chunk) => ({
      id: chunk.id,
      type: "essay" as const,
      title: chunk.metadata.essayTitle || "Unknown Essay",
      excerpt: chunk.content.substring(0, 200),
      date: chunk.metadata.date || new Date().toISOString(),
      relevance: Math.round(chunk.similarity * 100),
      awarded: chunk.metadata.wasAwarded,
      scholarshipId: scholarshipId,
      content: chunk.content,
    }));

    return {
      content: response.content,
      sources,
      citations: response.citations,
      agentStatus: "Response generated using past essays as reference",
    };
  } catch (error) {
    console.error("❌ RAG query error:", error);

    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes("GLM_API_KEY")) {
        return {
          content: "I'm sorry, but the GLM API key is not configured. Please add GLM_API_KEY to your environment variables.",
          sources: [],
          citations: [],
          agentStatus: "Configuration Error",
        };
      }

      if (error.message.includes("vector") || error.message.includes("pgvector")) {
        return {
          content: "I'm sorry, but the vector database is not available. Please make sure pgvector is installed and the database migration has been run.",
          sources: [],
          citations: [],
          agentStatus: "Database Error",
        };
      }
    }

    throw new Error(`RAG query failed: ${error}`);
  }
}

/**
 * Legacy alias for backward compatibility
 * Maps to the new chunk-based RAG system
 */

/**
 * Simple knowledge search for field generation
 * Returns relevant content from user's knowledge base as plain text
 */
export async function searchKnowledge(
  userId: string,
  fieldLabel: string,
  fieldType: string,
  query?: string
): Promise<string | null> {
  try {
    // Build a search query combining field label and optional user query
    const searchQuery = query || `${fieldLabel} ${fieldType} personal information`;

    // Search for relevant chunks
    const chunks = await searchRelevantChunks(userId, searchQuery, {}, 3);

    if (chunks.length === 0) {
      return null;
    }

    // Format chunks as plain text context
    return chunks
      .map((chunk, i) => `[Source ${i + 1}]: ${chunk.content}`)
      .join("\n\n");
  } catch (error) {
    console.error("Knowledge search failed:", error);
    return null;
  }
}
