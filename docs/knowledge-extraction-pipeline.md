# Knowledge Extraction Pipeline Documentation

**Created:** 2026-01-28
**Status:** Production Ready
**Updated:** 2026-01-30 - Added obvious field learning system

## Overview

The knowledge extraction pipeline converts unstructured user essays into a structured, searchable knowledge base. This enables AI-powered scholarship application assistance that references the user's actual experiences, skills, and achievements.

## Pipeline Architecture

```
┌─────────────────┐
│   User Essays   │
│  (Essay table)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  import-essays-to-knowledge.ts Script   │
│  - Reads essay.body                     │
│  - Extracts structured knowledge        │
│  - Generates embeddings                 │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│      OpenAI GPT-4o-mini                 │
│  Extracts:                              │
│  - Experiences (what, where, when)      │
│  - Skills (technical & soft)            │
│  - Achievements (awards, metrics)       │
│  - Values (principles, what matters)    │
│  - Goals (aspirations, plans)           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│    OpenAI text-embedding-3-small        │
│  Creates 1536-dimensional vectors       │
│  for semantic similarity search         │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│    PostgreSQL + pgvector                │
│  GlobalKnowledge table:                 │
│  - Stores structured knowledge          │
│  - Vector similarity search             │
│  - Usage tracking                       │
└─────────────────────────────────────────┘
```

## Obvious Field Learning System

**Added:** 2026-01-30

For common fields (name, email, university, GPA, etc.), the system learns from user corrections:

### How It Works

1. **Preprocessing Check** (field-generation.server.ts):
   ```
   Field: "First Name" → Vector search for verified entries (verified: true)
   ↓
   Find high-similarity match (>0.85 threshold)
   ↓
   Return: "John Smith" (from previously confirmed value)
   ```

2. **Fallback Extraction**:
   - If no confirmed value, search general knowledge base
   - Extract using regex patterns (email, GPA, university, etc.)
   - Still "flaky" but only as fallback

3. **Learning from Corrections**:
   - User confirms "John Smith" via chat
   - Saved as `verified: true` with embedding
   - Future "First Name" fields find it via vector similarity

### Why Vector Similarity?

Instead of exact string matching on field labels:
- ✅ "First Name" finds "first name" → "John Smith"
- ✅ "Your Name" finds "first name" → "John Smith"
- ✅ "Email Address" finds "email" → "user@example.com"

Uses existing `GlobalKnowledge` table with `verified: true` flag - no separate type needed.

### Field Types Learned

- Names: first name, last name, full name
- Contact: email, phone, address
- Education: university, college, major
- Academic: GPA, year, grade level

## Usage

### Running the Pipeline

```bash
# Extract knowledge from a user's essays
npx tsx scripts/import-essays-to-knowledge.ts <user-email>

# Example
npx tsx scripts/import-essays-to-knowledge.ts test@mobile.test
```

### Environment Variables Required

```bash
OPENAI_API_KEY=sk-...  # For GPT-4o-mini and embeddings
DATABASE_URL=postgresql://...  # For PostgreSQL storage
```

## Extraction Process

### Step 1: Essay Reading

The script fetches all essays for the given user:

```typescript
const user = await prisma.user.findUnique({
  where: { email: userEmail },
  include: {
    essays: {
      orderBy: { createdAt: "desc" },
    },
  },
});
```

**Important**: Essay content is stored in the `body` field, not `essay` field.

### Step 2: LLM Extraction

Each essay is sent to GPT-4o-mini with a structured prompt:

```typescript
const prompt = `
You are analyzing a scholarship essay to extract knowledge about the applicant.

ESSAY PROMPT:
${essay.essayPrompt}

ESSAY RESPONSE:
${essay.body || essay.essay}

Extract the following types of knowledge:
1. type: "experience", "skill", "achievement", "value", or "goal"
2. category: A grouping (e.g., "leadership", "community_service", "academic")
3. title: A concise title
4. content: Full details with context
5. confidence: How certain you are this is accurate (0.1-1.0)

IMPORTANT:
- Extract SPECIFIC facts, not generalizations
- Include numbers, dates, roles, and details
- For experiences: what they did, where, when, impact
- For skills: specific technical or soft skills demonstrated
- For achievements: awards, recognition, metrics
- For values: what matters to them, principles
- For goals: aspirations, future plans
`;
```

The LLM returns JSON with extracted knowledge items.

### Step 3: Embedding Generation

Each knowledge item is converted to a 1536-dimensional vector:

```typescript
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: `${item.title}: ${item.content}`,
});
```

The embedding captures semantic meaning for similarity search.

### Step 4: Database Storage

Knowledge is stored with a two-step process to handle CUID generation:

```typescript
// Step 1: Create record with Prisma (auto-generates CUID)
const knowledge = await prisma.globalKnowledge.create({
  data: {
    userId: user.id,
    type: item.type,
    category: item.category,
    title: item.title,
    content: item.content,
    source: "essay",
    sourceEssay: item.sourceEssay,
    confidence: item.confidence,
    verified: false,
    useCount: 0,
  },
});

// Step 2: Update embedding separately using raw SQL
await prisma.$executeRaw`
  UPDATE "GlobalKnowledge"
  SET embedding = ${JSON.stringify(embedding)}::vector(1536)
  WHERE id = ${knowledge.id}
`;
```

**Why Two Steps?**
- Prisma's CUID generation only works through ORM
- pgvector embeddings require raw SQL
- This pattern ensures both are properly handled

## Knowledge Types

| Type | Description | Example Categories |
|------|-------------|-------------------|
| `experience` | Activities, jobs, volunteer work | leadership, community_service, academic |
| `skill` | Technical or soft skills | technical, communication, teamwork |
| `achievement` | Awards, recognition, metrics | academic, competition, impact |
| `value` | Principles, what matters | social_justice, community, family |
| `goal` | Aspirations, future plans | career, education, impact |

## API Endpoints

### Knowledge Management

```typescript
// GET /api/knowledge?type=experience&verified=false
// List user's knowledge with optional filtering
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const knowledge = await prisma.globalKnowledge.findMany({
    where: { userId },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
  });
  return json({ knowledge });
};

// POST /api/knowledge
// Add new knowledge item (manual entry)
export const action = async ({ request }: ActionFunctionArgs) => {
  const { type, category, title, content, confidence } = await request.json();
  // Generates embedding automatically
  const knowledge = await prisma.globalKnowledge.create({
    data: { userId, type, category, title, content, confidence, source: "manual_entry" },
  });
  return json({ knowledge });
};

// PUT /api/knowledge
// Update knowledge item (verification during interview)
export const action = async ({ request }: ActionFunctionArgs) => {
  const { id, verified, confidence } = await request.json();
  const knowledge = await prisma.globalKnowledge.update({
    where: { id },
    data: { verified, confidence },
  });
  return json({ knowledge });
};

// DELETE /api/knowledge?id=<id>
// Remove knowledge item
export const action = async ({ request }: ActionFunctionArgs) => {
  const id = new URL(request.url).searchParams.get("id");
  await prisma.globalKnowledge.delete({ where: { id } });
  return json({ success: true });
};
```

### Semantic Search

```typescript
// GET /api/knowledge/search?q=<query>&type=experience&limit=10
// Search for similar knowledge using pgvector
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const query = new URL(request.url).searchParams.get("q");

  // Generate embedding for query
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  // Vector similarity search using pgvector
  const results = await prisma.$queryRaw`
    SELECT id, type, title, content, confidence,
           (embedding <#> ${embedding}::vector) AS similarity
    FROM "GlobalKnowledge"
    WHERE userId = ${userId}
      AND embedding IS NOT NULL
    ORDER BY (embedding <#> ${embedding}::vector) ASC
    LIMIT ${limit}
  `;

  return json({ results });
};
```

### Auto-Build Application Context

```typescript
// POST /api/knowledge/search
// Body: { applicationId, scholarshipId }
// Auto-builds ApplicationContext for each scholarship section
export const action = async ({ request }: ActionFunctionArgs) => {
  const { applicationId, scholarshipId } = await request.json();

  // Get scholarship application sections
  const sections = application.scrapedScholarship.applicationSections;

  // For each section:
  for (const section of sections) {
    // Semantic search for relevant knowledge
    const similarKnowledge = await prisma.$queryRaw`
      SELECT id, type, title, content
      FROM "GlobalKnowledge"
      WHERE userId = ${userId}
      ORDER BY (embedding <#> ${embedding}::vector) ASC
      LIMIT 5
    `;

    // Create ApplicationContext record
    await prisma.applicationContext.create({
      data: {
        userId,
        applicationId,
        sectionId: section.id,
        questionSummary: section.question,
        referencedGlobalKnowledge: similarKnowledge.map(k => k.id),
      },
    });
  }

  return json({ applicationId, context });
};
```

## Database Schema

### GlobalKnowledge

```prisma
model GlobalKnowledge {
  id          String   @id @default(cuid())
  userId      String
  type        String   // "experience", "skill", "achievement", "value", "goal"
  category    String?  // "leadership", "community_service", "academic"
  title       String   // "Food bank volunteer coordinator"
  content     String   @db.Text  // Full details with context
  source      String?  // "essay", "interview", "manual_entry"
  sourceEssay String?  // If from essay, which one
  confidence  Float    @default(0.5)  // How confirmed is this? 0-1
  verified    Boolean  @default(false)  // User explicitly confirmed
  embedding   Unsupported("vector(1536)")?  // For semantic search
  useCount    Int      @default(0)
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id])

  @@index([userId, type])
  @@index([userId, category])
  @@index([userId, confidence])
  @@index([userId, verified])
}
```

### ApplicationContext

```prisma
model ApplicationContext {
  id              String   @id @default(cuid())
  userId          String
  applicationId   String
  sectionId       String
  sectionType     String
  questionSummary String   @db.Text
  responseDraft   String?  @db.Text
  referencedGlobalKnowledge String[]  // IDs from GlobalKnowledge
  referencedOtherSections   String[]  // Other section IDs
  themes          String[]
  tone            String?
  status          String   @default("draft")
  userFeedback    String?  @db.Text

  user            User         @relation(fields: [userId], references: [id])
  application     Application  @relation(fields: [applicationId], references: [id])

  @@unique([applicationId, sectionId])
}
```

## Current Production Stats

As of 2026-01-27, the `test@mobile.test` account has:

- **72 essays** processed
- **1,690 knowledge items** extracted
- Distribution:
  - 720 experiences
  - 321 goals
  - 287 achievements
  - 191 values
  - 157 skills
  - 10 academics
  - 4 contact_information items

## Performance Considerations

### Embedding Generation Cost

- **Model**: `text-embedding-3-small`
- **Cost**: ~$0.00002 per 1K tokens
- **Typical essay**: ~500 words = ~750 tokens
- **72 essays** with ~23 items each = ~$0.02 total

### LLM Extraction Cost

- **Model**: `gpt-4o-mini`
- **Cost**: ~$0.15 per 1M input tokens, $0.60 per 1M output tokens
- **Typical extraction**: ~2K input tokens, ~500 output tokens
- **72 essays** = ~$0.05 total

### Optimization Opportunities

1. **Batch Processing**: Process multiple essays in parallel
2. **Caching**: Cache embeddings for repeated text
3. **Incremental Updates**: Only process new/changed essays
4. **Deduplication**: Merge similar knowledge items

## Future Enhancements

### 1. Multi-Source Support

Currently only supports essay extraction. Future sources:

- Resume/CV parsing
- Interview transcripts
- Manual knowledge entry
- Browser activity (extension)
- Document uploads (PDF, DOCX)

### 2. Confidence Scoring

Implement ML-based confidence scoring:

- Cross-reference with verified items
- Detect conflicting information
- Track verification rate over time

### 3. Knowledge Graph

Build relationships between knowledge items:

- "Food bank volunteer" → "Leadership" skill
- "Dean's List" → "Academic excellence" value
- "AI research" → "Machine learning engineer" goal

### 4. Temporal Tracking

Track when knowledge was learned/acquired:

```prisma
model GlobalKnowledge {
  // ... existing fields
  startDate    DateTime?  // When did this start?
  endDate      DateTime?  // When did this end?
  timeline     Json?      // Key events/milestones
}
```

### 5. Automatic Updates

Re-run extraction when:

- New essay uploaded
- User verifies/corrects knowledge
- Confidence threshold met
- Application context references missing info

## Troubleshooting

### Issue: "gen_random_uuid() generates UUIDs but schema expects CUIDs"

**Solution**: Always use Prisma ORM for creation, then UPDATE with embedding via raw SQL.

```typescript
// WRONG
await prisma.$executeRaw`
  INSERT INTO "GlobalKnowledge" (id, ...)
  VALUES (gen_random_uuid(), ...)
`;

// RIGHT
const knowledge = await prisma.globalKnowledge.create({ data: {...} });
await prisma.$executeRaw`
  UPDATE "GlobalKnowledge"
  SET embedding = ${embedding}::vector(1536)
  WHERE id = ${knowledge.id}
`;
```

### Issue: Essay content is empty

**Solution**: Check the `body` field, not `essay` field.

```typescript
// WRONG
const content = essay.essay;

// RIGHT
const content = essay.body || essay.essay;
```

### Issue: Embedding column not found

**Solution**: Ensure pgvector extension is installed:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Issue: Vector similarity not working

**Solution**: Check that embeddings are properly stored as `vector(1536)` type:

```sql
SELECT id, title, embedding FROM "GlobalKnowledge" WHERE embedding IS NOT NULL LIMIT 1;
```

## Related Files

- `scripts/import-essays-to-knowledge.ts` - Main extraction script
- `app/routes/api.knowledge.tsx` - Knowledge CRUD API
- `app/routes/api.knowledge.search.tsx` - Semantic search API
- `app/routes/api.applications.$id.context.tsx` - Application context API
- `app/lib/rag.server.ts` - RAG query pipeline
- `app/lib/pgvector.server.ts` - pgvector integration
- `prisma/schema.prisma` - Database schema

## See Also

- [Knowledge Base and Interview System Implementation Plan](./plans/2025-01-26-knowledge-base-and-interview-system.md)
- [Two-Phase Application Flow](../docs/two-phase-application-flow.md)
