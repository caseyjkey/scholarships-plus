# Document Upload Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a document upload system for transcripts, tribal documents, and references with AI-powered fact extraction and Google Drive integration.

**Architecture:** Three-type document upload (transcript, tribal_doc, general) with unified UI accepting local files or Google Drive. Each document type routes to a specialized LLM extractor that produces structured data stored in a new `Document` model. Summaries and key facts are added to `GlobalKnowledge` for RAG search and field autofill. Facts from verified entries within 30 days take precedence over new extractions.

**Tech Stack:** Prisma (PostgreSQL), Remix (React), OpenAI/GLM API, Google Drive API, PDF/DOCX parsing (pdf-parse, mammoth)

---

## Task 1: Add `lastVerified` column to `GlobalKnowledge` model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add lastVerified field to GlobalKnowledge model**

```prisma
model GlobalKnowledge {
  id          String   @id @default(cuid())
  userId      String
  type        String
  category    String?
  title       String
  content     String   @db.Text
  source      String?
  sourceEssay String?
  confidence  Float    @default(0.5)
  verified    Boolean  @default(false)
  lastVerified DateTime? // NEW: Track when user last confirmed this fact
  embedding   Unsupported("vector(1536)")?
  metadata    Json?
  useCount    Int      @default(0)
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([userId, category])
  @@index([userId, confidence])
  @@index([userId, verified])
  @@index([userId, verified, lastVerified]) // NEW composite index
}
```

**Step 2: Create and run migration**

Run: `npx prisma migrate dev --name add_last_verified_to_global_knowledge`

Expected: Migration file created, database schema updated, Prisma client regenerated.

**Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add lastVerified timestamp to GlobalKnowledge for staleness tracking"
```

---

## Task 2: Add `Document` model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add Document model to User relation**

Update the `User` model to include the documents relation:

```prisma
model User {
  id                String              @id @default(cuid())
  email             String              @unique
  role              UserRole            @default(STUDENT)
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  password          Password?
  essays            Essay[]
  googleCredentials GoogleCredential[]
  applications      Application[]
  portalSessions    PortalSession[]
  scrapeJobs        ScrapeJob[]
  globalKnowledge   GlobalKnowledge[]
  applicationContexts ApplicationContext[]
  fieldMappings     FieldMapping[]
  indexingSessions  IndexingSession[]
  personaProfile    PersonaProfile?
  documents         Document[] // NEW
}
```

**Step 2: Add Document model**

Add at the end of the schema file (before the final `}`):

```prisma
// User documents - transcripts, tribal docs, references
model Document {
  id            String   @id @default(cuid())
  userId        String
  type          String   // "transcript", "tribal_doc", "general"
  title         String
  content       String   @db.Text  // Extracted text from file
  extractedData Json?    // Type-specific structured data
  source        String   @default("upload") // "upload", "google_drive"
  sourceUrl     String?  // Google Drive URL if applicable
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([userId, createdAt])
}
```

**Step 3: Create and run migration**

Run: `npx prisma migrate dev --name add_document_model`

Expected: Migration file created, Document table created.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Document model for transcripts, tribal docs, and references"
```

---

## Task 3: Create document extraction server module

**Files:**
- Create: `app/lib/document-extraction.server.ts`

**Step 1: Create the module skeleton**

```typescript
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
```

**Step 4: Commit**

```bash
git add app/lib/document-extraction.server.ts
git commit -m "feat: add document extraction module skeleton"
```

---

## Task 4: Implement transcript extractor

**Files:**
- Modify: `app/lib/document-extraction.server.ts`

**Step 1: Write the transcript extractor function**

Replace the placeholder `extractTranscriptData` function:

```typescript
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
```

**Step 2: Commit**

```bash
git add app/lib/document-extraction.server.ts
git commit -m "feat: implement transcript LLM extractor"
```

---

## Task 5: Implement tribal document extractor

**Files:**
- Modify: `app/lib/document-extraction.server.ts`

**Step 1: Write the tribal document extractor function**

Replace the placeholder `extractTribalDocumentData` function:

```typescript
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
```

**Step 2: Commit**

```bash
git add app/lib/document-extraction.server.ts
git commit -m "feat: implement tribal document LLM extractor"
```

---

## Task 6: Implement general document extractor

**Files:**
- Modify: `app/lib/document-extraction.server.ts`

**Step 1: Write the general document extractor function**

Replace the placeholder `extractGeneralDocumentData` function:

```typescript
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
```

**Step 2: Commit**

```bash
git add app/lib/document-extraction.server.ts
git commit -m "feat: implement general document LLM extractor"
```

---

## Task 7: Add fact staleness check helper function

**Files:**
- Modify: `app/lib/document-extraction.server.ts`

**Step 1: Import Prisma and add staleness check function**

Add imports at top of file:

```typescript
import { prisma } from "~/db.server";
import { differenceInDays } from "date-fns";
```

Add the helper function after the imports:

```typescript
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
```

**Step 2: Commit**

```bash
git add app/lib/document-extraction.server.ts
git commit -m "feat: add fact staleness check helper (30-day verified window)"
```

---

## Task 8: Add function to store facts with staleness check

**Files:**
- Modify: `app/lib/document-extraction.server.ts`

**Step 1: Add storeFactsWithStalenessCheck function**

```typescript
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
```

**Step 2: Commit**

```bash
git add app/lib/document-extraction.server.ts
git commit -m "feat: add storeFactsWithStalenessCheck function"
```

---

## Task 9: Create document upload API endpoint

**Files:**
- Create: `app/routes/api.documents.upload.tsx`

**Step 1: Create the upload endpoint**

```typescript
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
```

**Step 2: Commit**

```bash
git add app/routes/api.documents.upload.tsx
git commit -m "feat: add document upload API endpoint"
```

---

## Task 10: Create document list API endpoint

**Files:**
- Create: `app/routes/api.documents.tsx`

**Step 1: Create the list/delete endpoint**

```typescript
/**
 * Documents API Endpoint
 *
 * GET: List user's documents
 * DELETE: Delete a document
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

/**
 * GET /api/documents
 * Returns user's documents with optional filtering by type
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  const where: any = { userId };
  if (type) {
    where.type = type;
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return json({ documents });
};

/**
 * DELETE /api/documents?id=<id>
 * Deletes a document
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);

  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return json({ error: "Missing document id" }, { status: 400 });
  }

  // Verify ownership
  const document = await prisma.document.findFirst({
    where: { id, userId },
  });

  if (!document) {
    return json({ error: "Document not found" }, { status: 404 });
  }

  // Delete associated knowledge entries
  await prisma.globalKnowledge.deleteMany({
    where: {
      userId,
      source: `document:${id}`,
    },
  });

  // Delete document
  await prisma.document.delete({
    where: { id },
  });

  return json({ success: true });
};
```

**Step 2: Commit**

```bash
git add app/routes/api.documents.tsx
git commit -m "feat: add document list and delete API endpoints"
```

---

## Task 11: Create DocumentUploadZone component

**Files:**
- Create: `app/components/DocumentUploadZone.tsx`

**Step 1: Create the upload zone component**

```typescript
/**
 * DocumentUploadZone Component
 *
 * A drag-and-drop upload zone that accepts local files or Google Drive.
 */

import { useState, useRef } from "react";

interface DocumentUploadZoneProps {
  documentType: "transcript" | "tribal_doc" | "general";
  onUploadSuccess: (documentId: string, title: string) => void;
  disabled?: boolean;
}

export function DocumentUploadZone({
  documentType,
  onUploadSuccess,
  disabled = false,
}: DocumentUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("documentType", documentType);
      formData.append("file", file);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Upload failed");
        return;
      }

      const result = await response.json();
      onUploadSuccess(result.documentId, result.title);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleGoogleDrive = () => {
    // TODO: Implement Google Drive picker
    alert("Google Drive integration coming soon");
  };

  return (
    <div
      className={`sp-upload-zone ${isDragging ? "sp-dragging" : ""} ${
        disabled ? "sp-disabled" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="sp-upload-content">
        <p className="sp-upload-text">
          Drag & drop or select from Drive
        </p>
        <div className="sp-upload-buttons">
          <button
            type="button"
            onClick={handleFileSelect}
            disabled={disabled || isUploading}
            className="sp-btn-secondary"
          >
            Choose File
          </button>
          <button
            type="button"
            onClick={handleGoogleDrive}
            disabled={disabled || isUploading}
            className="sp-btn-secondary"
          >
            Select from Drive
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.txt"
          className="sp-hidden"
          disabled={disabled || isUploading}
        />
      </div>

      <style>{`
        .sp-upload-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 32px;
          text-align: center;
          transition: all 0.2s;
        }
        .sp-upload-zone.sp-dragging {
          border-color: #4f46e5;
          background: #eef2ff;
        }
        .sp-upload-zone.sp-disabled {
          opacity: 0.5;
          pointer-events: none;
        }
        .sp-upload-text {
          margin-bottom: 16px;
          color: #666;
        }
        .sp-upload-buttons {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .sp-btn-secondary {
          padding: 8px 16px;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: white;
          cursor: pointer;
        }
        .sp-btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sp-hidden {
          display: none;
        }
      `}</style>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/DocumentUploadZone.tsx
git commit -m "feat: add DocumentUploadZone component"
```

---

## Task 12: Create DocumentList component

**Files:**
- Create: `app/components/DocumentList.tsx`

**Step 1: Create the document list component**

```typescript
/**
 * DocumentList Component
 *
 * Displays uploaded documents with delete functionality.
 */

import { useEffect, useState } from "react";

interface Document {
  id: string;
  type: string;
  title: string;
  source: string;
  createdAt: string;
}

interface DocumentListProps {
  documentType: "transcript" | "tribal_doc" | "general";
  refreshTrigger?: number;
  onDocumentDeleted?: () => void;
}

export function DocumentList({
  documentType,
  refreshTrigger = 0,
  onDocumentDeleted,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
  }, [documentType, refreshTrigger]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/documents?type=${documentType}`
      );
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/documents?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDocuments(documents.filter((d) => d.id !== id));
        onDocumentDeleted?.();
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete document");
    }
  };

  if (loading) {
    return <div className="sp-loading">Loading...</div>;
  }

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="sp-document-list">
      {documents.map((doc) => (
        <div key={doc.id} className="sp-document-item">
          <span className="sp-doc-icon">
            {doc.source === "google_drive" ? "☁️" : "💾"}
          </span>
          <span className="sp-doc-title">{doc.title}</span>
          <span className="sp-doc-date">
            {new Date(doc.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={() => handleDelete(doc.id, doc.title)}
            className="sp-delete-btn"
          >
            ✕
          </button>
        </div>
      ))}

      <style>{`
        .sp-document-list {
          margin-top: 16px;
        }
        .sp-document-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 4px;
          background: #f9fafb;
        }
        .sp-doc-icon {
          font-size: 16px;
        }
        .sp-doc-title {
          flex: 1;
          font-size: 14px;
        }
        .sp-doc-date {
          font-size: 12px;
          color: #666;
        }
        .sp-delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          color: #666;
        }
        .sp-delete-btn:hover {
          color: #dc2626;
        }
        .sp-loading {
          padding: 16px;
          text-align: center;
          color: #666;
        }
      `}</style>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/DocumentList.tsx
git commit -m "feat: add DocumentList component"
```

---

## Task 13: Create documents page

**Files:**
- Create: `app/routes/documents._index.tsx`

**Step 1: Create the documents page**

```typescript
/**
 * Documents Page
 *
 * User interface for uploading and managing documents.
 */

import { useState } from "react";
import { DocumentUploadZone } from "~/components/DocumentUploadZone";
import { DocumentList } from "~/components/DocumentList";
import { requireUserId } from "~/session.server";
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  return {}; // Auth check only
};

export default function DocumentsPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <h1>Documents</h1>
      <p style={{ color: "#666", marginBottom: "32px" }}>
        Upload transcripts, tribal documentation, and reference letters for
        AI-powered autofill.
      </p>

      {/* Transcripts Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📄</span> Transcripts
        </h2>
        <DocumentUploadZone
          documentType="transcript"
          onUploadSuccess={handleUploadSuccess}
        />
        <DocumentList
          documentType="transcript"
          refreshTrigger={refreshTrigger}
        />
      </section>

      {/* Tribal Documentation Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🪪</span> Tribal Documentation
        </h2>
        <DocumentUploadZone
          documentType="tribal_doc"
          onUploadSuccess={handleUploadSuccess}
        />
        <DocumentList
          documentType="tribal_doc"
          refreshTrigger={refreshTrigger}
        />
      </section>

      {/* References & Applications Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📝</span> References & Applications
        </h2>
        <DocumentUploadZone
          documentType="general"
          onUploadSuccess={handleUploadSuccess}
        />
        <DocumentList
          documentType="general"
          refreshTrigger={refreshTrigger}
        />
      </section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/routes/documents._index.tsx
git commit -m "feat: add documents page with three upload sections"
```

---

## Task 14: Test document upload flow

**Files:**
- Test: Manual testing via browser

**Step 1: Start development server**

Run: `npm run dev`

Expected: Server starts at http://localhost:3000

**Step 2: Navigate to documents page**

Open: http://localhost:3000/documents

Expected: Documents page loads with three sections

**Step 3: Test transcript upload**

1. Click "Choose File" in Transcripts section
2. Select a PDF transcript
3. Verify upload succeeds

Expected: Document appears in list below upload zone

**Step 4: Test tribal document upload**

1. Click "Choose File" in Tribal Documentation section
2. Select a tribal ID document
3. Verify upload succeeds

Expected: Document appears in list

**Step 5: Test document deletion**

1. Click "✕" button on a document
2. Confirm deletion
3. Verify document removed from list

Expected: Document deleted successfully

**Step 6: Verify database records**

Run: `npx prisma studio`

Expected: Can see Document records in Prisma Studio

**Step 7: Verify GlobalKnowledge entries**

Run: `npx prisma studio`

Expected: Can see document summaries and extracted facts in GlobalKnowledge

---

## Task 15: Add Google Drive import (optional/future)

This task is deferred as it requires implementing the Google Drive picker integration. The existing essay upload Google Drive code can be reused as a reference.

---

## Testing Checklist

- [ ] Transcript PDF upload extracts GPA, major, courses
- [ ] Tribal document upload extracts tribe name and metadata
- [ ] General document upload creates summary
- [ ] Facts stored in GlobalKnowledge with proper embeddings
- [ ] Staleness check skips facts with recent verified entries
- [ ] Document deletion removes associated GlobalKnowledge entries
- [ ] UI renders three sections correctly
- [ ] Drag-and-drop file upload works
- [ ] File type validation rejects unsupported formats
- [ ] File size validation rejects files > 10MB

---

## Implementation Complete

All core tasks complete. The document upload feature is now functional for local file uploads. Google Drive integration can be added as a follow-up using the existing essay upload code as reference.
