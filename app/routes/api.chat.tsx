/**
 * Chat API Endpoint
 * Handles chat requests for scholarship application assistance
 * Uses RAG (Retrieval-Augmented Generation) to provide contextualized responses
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { requireUserId } from "~/session.server";
import { queryRAG } from "~/lib/rag.server";
import type { ChatRequest, ChatResponse } from "~/types/chat";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  // Only accept POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { applicationId, scholarshipId, message, history = [] } = body as ChatRequest;

    // Validation
    if (!applicationId || !scholarshipId || !message) {
      return json(
        { error: "Missing required fields: applicationId, scholarshipId, message" },
        { status: 400 }
      );
    }

    // Check for API keys
    if (!process.env.GLM_API_KEY) {
      return json(
        {
          error: "GLM_API_KEY is not configured. Please set the GLM_API_KEY environment variable.",
          content: "I'm sorry, but the AI service is not configured. Please contact support.",
          sources: [],
          agentStatus: "Configuration Error",
        },
        { status: 503 }
      );
    }

    // Call RAG query
    const response = await queryRAG({
      userId,
      scholarshipId,
      query: message,
      conversationHistory: history,
      maxSources: 5,
    });

    // Return response
    const chatResponse: ChatResponse = {
      content: response.content,
      sources: response.sources,
      agentStatus: response.agentStatus,
      currentStep: "chat",
    };

    return json(chatResponse);
  } catch (error) {
    console.error("Chat API error:", error);

    // Check for specific error types
    if (error instanceof Error) {
      // Database connection errors
      if (error.message.includes("connect") || error.message.includes("ECONNREFUSED")) {
        return json(
          {
            error: "Database is not running. Please start the database and try again.",
            content: "I'm sorry, but I'm unable to access the database. Please make sure the database is running.",
            sources: [],
            agentStatus: "Database Error",
          },
          { status: 503 }
        );
      }

      // API key errors
      if (error.message.includes("GLM_API_KEY")) {
        return json(
          {
            error: error.message,
            content: "I'm sorry, but there's a configuration issue with the AI services. Please contact support.",
            sources: [],
            agentStatus: "Configuration Error",
          },
          { status: 503 }
        );
      }
    }

    // Generic error
    return json(
      {
        error: "An error occurred while processing your request. Please try again.",
        content: "I'm sorry, but something went wrong. Please try again.",
        sources: [],
        agentStatus: "Error",
      },
      { status: 500 }
    );
  }
}
