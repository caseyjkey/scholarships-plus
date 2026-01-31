# Scholarships Plus - Pinecone → pgvector Refactoring Plan

**Date:** 2025-01-23
**Goal:** Refactor RAG system from Pinecone to local pgvector with chunk-based citations
**Status:** Infrastructure Updated, Schema Updated, Migration Pending

---

## Executive Summary

This refactoring replaces the Pinecone-based vector database with **pgvector** in the shared Postgres instance. The new architecture uses **chunk-based retrieval** for precise numbered citations (e.g., "[1]", "[2]") that can be mapped back to source essays.

### Key Changes
- **Docker:** `postgres:latest` → `pgvector/pgvector:pg16`
- **Storage:** Pinecone cloud → local pgvector
- **Granularity:** Essay-level → Chunk-level (200 word chunks)
- **Citations:** Source objects → Numbered footnotes [1], [2]
- **Embedding:** Still GLM 4.7 `embedding-2` (1024 dimensions)

---

## What's Been Completed ✅

### 1. Infrastructure Updates
- ✅ `docker-compose.yml`: Updated to `pgvector/pgvector:pg16` image
- ✅ `.env`: Added GLM_API_KEY, fixed DATABASE_URL to `scholarships_plus`
- ✅ `.env.example`: Removed PINECONE_API_KEY, cleaned up

### 2. Database Schema
- ✅ `prisma/schema.prisma`: Added `EssayChunk` model
- ✅ Removed `vectorId` from Essay model (no longer needed)
- ✅ Added relation: Essay → EssayChunk (one-to-many)

### 3. Foundation Code
- ✅ `app/lib/pgvector.server.ts`: Created with chunk-based retrieval logic
- ✅ Citation workflow: Numbered sources with metadata mapping

---

## Immediate Next Steps (CRITICAL)

### ⚠️ Docker Container Migration Required

The PostgreSQL image has changed from `postgres:latest` to `pgvector/pgvector:pg16`. You MUST restart your Docker containers.

**Step-by-Step Docker Migration:**

```bash
# 1. Stop current containers
docker compose down

# 2. (Optional) Backup existing data if you want to keep it
mv postgres-data postgres-data-backup

# 3. Start new containers with pgvector image
docker compose up -d

# 4. Verify pgvector is available
docker exec -it scholarships-plus-postgres-1 psql -U postgres -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"

# 5. Create the scholarships_plus database
docker exec -it scholarships-plus-postgres-1 psql -U postgres -c "CREATE DATABASE scholarships_plus;"

# 6. Generate Prisma client
npx prisma generate

# 7. Run migration to create tables
npx prisma migrate dev --name add_pgvector_essay_chunks

# 8. Verify everything works
npx tsx scripts/check-db.ts
```

**Expected Output from Step 4:**
```
 extversion
--------------
 0.7.4
```
(Shows pgvector extension is installed)

---

## Database Migration Details

### Migration File to be Created

The migration will:

1. **Enable pgvector extension:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

2. **Create EssayChunk table:**
```sql
CREATE TABLE "EssayChunk" (
    "id" TEXT NOT NULL,
    "essayId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "displayId" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssayChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EssayChunk_essayId_chunkIndex_idx" ON "EssayChunk"("essayId", "chunkIndex");
```

3. **Create vector similarity index (for fast search):**
```sql
CREATE INDEX essaychunk_embedding_idx ON "EssayChunk"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

4. **Remove vectorId from Essay table:**
```sql
ALTER TABLE "Essay" DROP COLUMN IF EXISTS "vectorId";
```

---

## Code Refactoring Steps

After Docker migration and schema migration are complete, complete these code changes:

### Phase 1: Core RAG Updates (90 minutes)

#### 1. Update `app/lib/embeddings.server.ts`

**Changes needed:**
- Remove all Pinecone-specific code
- Keep GLM 4.7 `embedding-2` generation (already correct)
- Add chunking logic before embedding
- Return embeddings as number arrays (not vectors)

**New function needed:**
```typescript
// Generate embedding for a single chunk
async function generateChunkEmbedding(chunk: string): Promise<number[]> {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'embedding-2',
      input: chunk
    })
  });

  const data = await response.json();
  return data.data[0].embedding; // Returns number[1024]
}
```

#### 2. Update `app/lib/rag.server.ts`

**Changes needed:**
- Replace Pinecone search with pgvector search
- Format retrieved chunks as "Source [ID: 1]: content..."
- Update system prompt for citation requirements
- Post-process LLM response to extract citations

**New system prompt:**
```
You are an expert scholarship essay writer. Your task is to draft a new essay based on the student's past writings.

CRITICAL INSTRUCTIONS:

Use the provided Context Sources to inform the content.

Every time you use a specific fact, story, or phrase from a source, you must cite it using the ID in square brackets, e.g., [1] or [2].

If you combine information from multiple sources, cite both: [1, 3].

Do not mention "Source [X]" by name in the flow of the sentence. Use only the bracketed numbers.

If a piece of information is not in the context, do not invent it.
```

#### 3. Update `app/lib/pgvector.server.ts`

**Current status:** Already created, may need adjustments based on actual schema.

**Key function to verify:**
```typescript
// Search chunks using pgvector cosine similarity
async function searchRelevantChunks(
  userId: string,
  query: string,
  topK: number = 5
): Promise<ChunkWithMetadata[]>
```

### Phase 2: Upload Flow Updates (45 minutes)

#### 4. Update `app/routes/essays.upload.tsx`

**Changes needed:**
- After extracting text from file, split into chunks (~200 words each)
- Generate embedding for each chunk
- Store chunks in EssayChunk table with embeddings
- Remove Pinecone embedding code

**New upload flow:**
```typescript
// 1. Extract text from file
const { text } = await extractTextFromFile(buffer, filename);

// 2. Create essay record
const essay = await prisma.essay.create({...});

// 3. Chunk the essay
const chunks = await chunkEssay(essay.id, text, {
  filename,
  awarded: wasAwarded,
});

// 4. Generate embeddings and store
await storeChunksWithEmbeddings(chunks);
```

### Phase 3: Chat API Updates (30 minutes)

#### 5. Update `app/routes/api.chat.tsx`

**Changes needed:**
- Use new RAG function that returns numbered citations
- Format response for frontend
- Return citations array with source metadata

**New response format:**
```typescript
{
  content: "I developed leadership skills by managing the debate team [1]...",
  citations: [
    {
      reference: "[1]",
      sourceIds: [1],
      sources: [
        {
          id: 1,
          title: "Leadership Essay",
          excerpt: "I led the debate team...",
          awarded: true
        }
      ]
    }
  ]
}
```

### Phase 4: Cleanup (15 minutes)

#### 6. Remove Pinecone Files

```bash
# Remove these files:
rm app/lib/pinecone.server.ts

# Remove Pinecone dependency
npm uninstall @pinecone-database/pinecone

# Update imports in remaining files
# (remove any references to pinecone.server.ts)
```

---

## Testing Checklist

After completing all refactoring steps:

### Infrastructure Tests
- [ ] Docker container running with pgvector image
- [ ] pgvector extension enabled: `SELECT extversion FROM pg_extension WHERE extname = 'vector';`
- [ ] scholarships_plus database created
- [ ] Migration applied successfully

### Backend Tests
- [ ] Can upload an essay → chunks created in EssayChunk table
- [ ] Chunks have embeddings in embedding column
- [ ] Vector search returns relevant chunks
- [ ] Chat API returns response with numbered citations [1], [2]

### Integration Tests
- [ ] Upload essay → Search query → Get cited response
- [ ] Citation numbers map correctly to source essays
- [ ] Frontend can display interactive footnotes

---

## Files Summary

### Files to Update (7)
1. `app/lib/embeddings.server.ts` - Remove Pinecone, add chunking
2. `app/lib/rag.server.ts` - New citation workflow
3. `app/lib/pgvector.server.ts` - Verify/refine pgvector queries
4. `app/routes/essays.upload.tsx` - Add chunking step
5. `app/routes/api.chat.tsx` - New citation format
6. `prisma/schema.prisma` - ✅ DONE (EssayChunk added)
7. `docker-compose.yml` - ✅ DONE (pgvector image)

### Files to Remove (1)
1. `app/lib/pinecone.server.ts` - No longer needed

### Dependencies to Remove
- `@pinecone-database/pinecone`

---

## Troubleshooting

### Issue: "vector type does not exist"

**Cause:** pgvector extension not enabled
**Fix:** Run `CREATE EXTENSION vector;` in the database

### Issue: "function embedding() does not exist"

**Cause:** EssayChunk table not created yet
**Fix:** Run migration: `npx prisma migrate dev`

### Issue: "Docker container won't start"

**Cause:** Old postgres-data volume incompatible
**Fix:**
```bash
docker compose down
rm -rf postgres-data  # ⚠️ This deletes old data!
docker compose up -d
```

### Issue: "Chunk embeddings not working"

**Cause:** Prisma doesn't support vector type natively
**Fix:** Use raw SQL with `prisma.$queryRaw` (already implemented in pgvector.server.ts)

---

## Time Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | Docker migration | 15 min |
| 2 | Database schema/migration | 30 min |
| 3 | Core RAG updates | 90 min |
| 4 | Upload flow updates | 45 min |
| 5 | Chat API updates | 30 min |
| 6 | Cleanup | 15 min |
| 7 | Testing | 30 min |
| **Total** | | **~4 hours** |

---

## Architecture Comparison

### Before (Pinecone)
```
Essay → Extract Text → Generate Embedding → Store in Pinecone
                                              ↓
User Query → Generate Query Embedding → Search Pinecone → Get Essay Sources
                                              ↓
                                      Format Context → Call LLM → Get Response
```

### After (pgvector with Chunks)
```
Essay → Extract Text → Split into Chunks → Generate Embeddings → Store in pgvector
                                                      ↓
User Query → Generate Query Embedding → Search pgvector → Get Top 5 Chunks
                                                      ↓
                                          Format as "Source [ID: 1]: ..." → Call LLM → Get Response with [1], [2]
                                                      ↓
                                          Post-Process → Map Citations to Source Metadata
```

---

## Success Criteria

Refactoring is complete when:

1. ✅ Docker runs pgvector/pgvector:pg16 image
2. ✅ pgvector extension enabled in database
3. ✅ EssayChunk table exists with vector column
4. ✅ Uploaded essays are chunked and embedded
5. ✅ Chat returns numbered citations [1], [2], etc.
6. ✅ Citations map correctly to source essays
7. ✅ Frontend can display interactive footnotes
8. ✅ Pinecone dependency removed
9. ✅ All tests pass

---

## Next Steps After This Plan

1. Execute Docker migration steps
2. Run database migration
3. Complete code refactoring (Phases 1-4)
4. Test end-to-end flow
5. Complete remaining chat UI components (from NEXT_STEPS.md)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-23
