/**
 * Essay Upload Endpoint
 * Handles file uploads, text extraction, database storage, embedding, and similarity computation
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { extractTextFromFile } from "~/lib/text-extraction.server";
import { chunkEssay, storeChunksWithEmbeddings } from "~/lib/embeddings.server";
import { computeSimilarity } from "~/lib/similarity.server";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();

  const file = formData.get("file") as File | null;
  const wasAwarded = formData.get("wasAwarded") === "true";
  const title = formData.get("title") as string | null;

  // Validation
  if (!file) {
    return json({ error: "No file provided" }, { status: 400 });
  }

  // Check file size (max 10MB)
  const MAX_SIZE = 10 * 1024 * 1024;
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

  try {
    // Step 1: Extract text from file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { text: extractedText } = await extractTextFromFile(
      buffer,
      file.name
    );

    if (!extractedText || extractedText.trim().length === 0) {
      return json(
        { error: "Could not extract text from file. Please try another file." },
        { status: 400 }
      );
    }

    // Step 2: Save to database
    const essayTitle =
      title?.trim() || file.name.replace(/\.[^/.]+$/, ""); // Remove extension

    const essay = await prisma.essay.create({
      data: {
        userId,
        essayPrompt: essayTitle,
        body: "", // Empty for uploaded essays (not generated)
        essay: extractedText,
        wasAwarded,
      },
    });

    // Step 3: Chunk the essay and store embeddings in pgvector
    try {
      // Split essay into chunks
      const chunks = chunkEssay(extractedText);

      // Store chunks with embeddings in pgvector
      await storeChunksWithEmbeddings(essay.id, chunks, {
        filename: file.name,
        title: essayTitle,
        awarded: wasAwarded,
        date: new Date().toISOString(),
      });

      console.log(`✅ Essay ${essay.id} chunked into ${chunks.length} chunks with embeddings`);
    } catch (chunkingError) {
      console.error("Chunking/embedding failed (continuing anyway):", chunkingError);
      // Don't fail the upload if chunking fails
      // Essay is still saved in database
    }

    // Step 4: Compute similarities in background
    // Don't wait for this to complete
    computeSimilarity(essay.id, userId).catch((error) => {
      console.error("Similarity computation failed:", error);
    });

    return json({
      success: true,
      essayId: essay.id,
      title: essayTitle,
      message: "Essay uploaded successfully",
    });
  } catch (error) {
    console.error("Essay upload error:", error);

    // Check if it's a database connection error
    if (error instanceof Error) {
      if (error.message.includes("connect") || error.message.includes("ECONNREFUSED")) {
        return json(
          {
            error: "Database is not running. Please start the database and try again.",
          },
          { status: 503 }
        );
      }
    }

    return json(
      { error: "Failed to upload essay. Please try again." },
      { status: 500 }
    );
  }
}
