/**
 * Document Upload API Endpoint
 *
 * Handles file uploads for transcripts, tribal documents, and references.
 * Supports local file upload and Google Drive import.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { extractTextFromFile } from "~/lib/text-extraction.server";
import {
  extractDocumentData,
  storeFactsWithStalenessCheck,
} from "~/lib/document-extraction.server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();

  const documentType = formData.get("documentType") as string;
  const file = formData.get("file") as File | null;
  const googleDriveUrl = formData.get("googleDriveUrl") as string | null;

  // Validation
  if (!documentType) {
    return json({ error: "Missing documentType" }, { status: 400 });
  }

  if (!["transcript", "tribal_doc", "general"].includes(documentType)) {
    return json(
      { error: "Invalid documentType. Must be transcript, tribal_doc, or general" },
      { status: 400 }
    );
  }

  if (!file && !googleDriveUrl) {
    return json(
      { error: "Either file or googleDriveUrl is required" },
      { status: 400 }
    );
  }

  // Check file size if file provided
  if (file) {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      return json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Check file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type)) {
      return json(
        {
          error:
            "Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.",
        },
        { status: 400 }
      );
    }
  }

  try {
    let extractedText = "";
    let source = "upload";
    let sourceUrl: string | null = null;

    // Extract text from file or Google Drive
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const { text } = await extractTextFromFile(buffer, file.name);
      extractedText = text;
    } else if (googleDriveUrl) {
      // TODO: Implement Google Drive fetching
      source = "google_drive";
      sourceUrl = googleDriveUrl;
      return json(
        { error: "Google Drive import not yet implemented" },
        { status: 501 }
      );
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return json(
        { error: "Could not extract text from document" },
        { status: 400 }
      );
    }

    // Extract structured data using LLM
    const { extractedData, summary, facts } =
      await extractDocumentData(
        documentType as "transcript" | "tribal_doc" | "general",
        extractedText
      );

    // Create document record
    const document = await prisma.document.create({
      data: {
        userId,
        type: documentType,
        title: file?.name || "Imported Document",
        content: extractedText,
        extractedData,
        source,
        sourceUrl,
      },
    });

    // Store summary and facts in GlobalKnowledge
    // Generate embedding for summary
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: summary,
    });

    await prisma.globalKnowledge.create({
      data: {
        userId,
        type: "document_summary",
        category: documentType,
        title: document.title,
        content: summary,
        source: `document:${document.id}`,
        confidence: 0.9,
        verified: false,
        embedding: embeddingResponse.data[0].embedding as any,
      },
    });

    // Store facts with staleness check
    if (facts.length > 0) {
      await storeFactsWithStalenessCheck(userId, facts, document.id);
    }

    return json({
      success: true,
      documentId: document.id,
      title: document.title,
      summary,
      factsStored: facts.length,
    });
  } catch (error) {
    console.error("Document upload error:", error);
    return json(
      { error: "Failed to upload document" },
      { status: 500 }
    );
  }
}
