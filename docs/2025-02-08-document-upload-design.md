# Document Upload Feature Design

**Date:** 2025-02-08
**Status:** Design Complete, Ready for Implementation

## Overview

Users need to upload supporting documents (transcripts, tribal documentation, reference letters) that aren't scholarship essays. These documents contain facts that should be extracted and added to the knowledge base for AI chat and autofill.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend  │────▶│  Upload API  │────▶│  Text Extraction│
│ (3 sections)│     │ /api/docs/   │     │  PDF/DOCX/TXT   │
└─────────────┘     └──────────────┘     └─────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  LLM Router  │
                   └──────────────┘
                    /      |      \
                   /       |       \
                  ▼        ▼        ▼
            ┌────────┐ ┌──────┐ ┌──────┐
            │Transcr │ │Tribal│ │Gen/  │
            │Parser  │ │Doc   │ │Other │
            └────────┘ └──────┘ └──────┘
                │         │         │
                ▼         ▼         ▼
            ┌────────────────────────────┐
            │  Document Model (DB)        │
            │  - type, title, content     │
            │  - extractedData (JSON)     │
            └────────────────────────────┘
                        │
                        ▼
            ┌────────────────────────────┐
            │  GlobalKnowledge           │
            │  - Summary for RAG search   │
            │  - Key facts (GPA, tribe)  │
            └────────────────────────────┘
```

## Data Model

### New Prisma Model: `Document`

```prisma
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

### Update to `GlobalKnowledge`

Add `lastVerified` column:

```prisma
model GlobalKnowledge {
  // ... existing fields ...
  verified      Boolean   @default(false)
  lastVerified  DateTime? // NEW: When user last confirmed this fact

  @@index([userId, verified, lastVerified])
}
```

### `extractedData` Schemas

**Transcript:**
```json
{
  "gpa": 3.8,
  "lastTermGpa": 3.9,
  "terms": [
    {
      "name": "Fall 2024",
      "courses": [
        { "code": "CS 101", "name": "Intro to Programming", "grade": "A", "credits": 4 }
      ]
    }
  ],
  "major": "Computer Science",
  "degree": "Bachelor of Science"
}
```

**Tribal Document:**
```json
{
  "documentType": "tribal_document",
  "tribeName": "Cherokee Nation",
  "metadata": {
    "enrollmentNumber": "CN123456",
    "status": "Active",
    "dateOfBirth": "2002-05-15",
    "bloodQuantum": "1/4"
  }
}
```

**General:**
```json
{
  "summary": "Reference letter from Dr. Smith highlighting leadership..."
}
```

## API Endpoints

### POST /api/documents/upload

**Request Body:**
```json
{
  "documentType": "transcript" | "tribal_doc" | "general",
  "file": File (multipart)  // OR
  "googleDriveUrl": string  // one required
}
```

**Processing Flow:**
1. File/Drive URL → Extract text
2. Route to LLM extractor based on type
3. Store in `Document` model
4. Store summary + facts in `GlobalKnowledge`

### GET /api/documents

Returns user's documents with optional filtering by type.

### DELETE /api/documents/:id

Delete a document and its associated knowledge entries.

## UI Design

Three drag-drop sections on `/documents` page:

```
┌─────────────────────────────────────────────────────────────┐
│  📄 Transcripts                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   Drag & drop or select from Drive                   │  │
│  │   [Choose File]  [Select from Drive]                 │  │
│  └──────────────────────────────────────────────────────┘  │
│  📎 Spring 2024 Transcript                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🪪 Tribal Documentation                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   Drag & drop or select from Drive                   │  │
│  │   [Choose File]  [Select from Drive]                 │  │
│  └──────────────────────────────────────────────────────┘  │
│  📎 Cherokee Nation ID Card                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  📝 References & Applications                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   Drag & drop or select from Drive                   │  │
│  │   [Choose File]  [Select from Drive]                 │  │
│  └──────────────────────────────────────────────────────┘  │
│  📎 Dr. Smith Reference Letter                             │
└─────────────────────────────────────────────────────────────┘
```

## LLM Extractor Prompts

### Transcript Extractor

Extracts GPA, major, courses, terms from academic transcripts.

### Tribal Document Extractor

Extracts tribe name and all labeled fields (enrollment, status, dates, etc.) into flexible `metadata` object.

### General Document Summarizer

Creates 2-3 sentence summary for RAG search.

## Fact Conflict Resolution

**Logic:**
1. Check for existing verified fact within last 30 days
2. If recent verified entry exists → skip new value
3. Otherwise → store new value with `verified: false`, let AI chat resolve

**Example:**
- Existing: GPA 3.75 (verified 25 days ago) → Skip new GPA 3.8
- Existing: GPA 3.75 (verified 60 days ago) → Store GPA 3.8 (unverified), AI chat will ask user which is correct

## File Structure

```
app/
├── routes/
│   ├── api.documents.upload.tsx      # Upload endpoint
│   ├── api.documents.tsx             # List/delete endpoints
│   └── documents._index.tsx          # Documents UI page
├── lib/
│   └── document-extraction.server.ts # LLM extractors
└── components/
    ├── DocumentUploadZone.tsx        # Upload component
    └── DocumentList.tsx              # List component
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| File > 10MB | Error message |
| Unsupported type | Error message |
| Empty text | Error message |
| Google Drive auth expired | Redirect to re-auth |
| LLM timeout | Store document, mark extraction failed |
| Duplicate document | Prompt to confirm |

## Implementation Order

1. Prisma schema + migration
2. `document-extraction.server.ts`
3. API endpoints
4. Frontend components
5. Documents page
6. Testing
