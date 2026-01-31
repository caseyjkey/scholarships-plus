# Knowledge Base and Interview System Implementation Plan

**Created:** 2025-01-26
**Status:** Phase 1 Complete, Phase 2 In Progress

## Overview

Build an AI-powered scholarship application system that:
1. Imports user's past essays to build a global knowledge base
2. Interviews users to gather application-specific answers
3. Auto-fills scholarship applications via browser extension
4. Maintains context isolation between applications while reusing global knowledge

## Architecture Decisions

### Knowledge Management
- **Hybrid Database**: PostgreSQL + pgvector for semantic search
- **Global Knowledge Base**: Shared facts, experiences, skills, achievements, values, goals
- **Application Context**: Per-application isolated responses
- **Context Isolation Rule**: Can reference same-app earlier responses ✅, cannot reference other-app content ❌

### Submission Flow Pivot
- **Original Plan**: Automated submission via browser-use
- **New Plan**: Browser extension + user-controlled submission
- **Reason**: User wants to review everything before submission
- **Extension**: Adds "sparkle" icons to form inputs, prefills from agent-gathered answers

### Interview Pattern
- Real-time chat interviewer that:
  - References past essays and previous interview answers
  - Builds knowledgebase over time (learns with each interaction)
  - References earlier responses within SAME application (cohesion)
  - Auto-builds application context from indexed essays
  - Updates global knowledge during interview for parallel app support

## Phase 1: Knowledge Base Infrastructure ✅

### Completed Tasks

- [x] **Prisma Schema for Knowledge Models**
  - Created `GlobalKnowledge` model with:
    - Types: experience, skill, achievement, value, goal
    - Vector embedding support via pgvector
    - Usage tracking (useCount, lastUsedAt)
    - Verification status
    - Source tracking (essay, interview, manual)
  - Created `ApplicationContext` model with:
    - Per-application context isolation
    - Reference tracking (globalKnowledge, other sections)
    - Themes and tone for coherence
    - Status workflow (draft → reviewed → approved → submitted)
  - Updated User and Application models with new relations

- [x] **Database Migration**
  - Added pgvector extension for vector similarity search
  - Created GlobalKnowledge and ApplicationContext tables
  - Migration: `prisma/schema.prisma`

- [x] **Essay Import Script**
  - File: `scripts/import-essays-to-knowledge.ts`
  - Extracts structured knowledge from essays using GPT-4o-mini
  - Generates embeddings using text-embedding-3-small
  - Stores in database with proper CUID generation
  - **Test Results:**
    - 72 essays processed
    - 810 knowledge items extracted
    - 1,690 total knowledge items in database
    - Distribution: 720 experiences, 321 goals, 287 achievements, 191 values, 157 skills

- [x] **Knowledge API Endpoints**
  - `GET/POST/PUT/DELETE /api/knowledge` - CRUD for knowledge base
  - `GET /api/knowledge/search` - Semantic search with pgvector
  - `POST /api/knowledge/search` - Auto-build application context
  - `GET/PUT /api/applications/:id/context` - Application context management

- [x] **CUID Generation Fix**
  - Issue: `gen_random_uuid()` generates UUIDs but schema expects CUIDs
  - Solution: Use Prisma ORM for creation (auto-generates CUID), then UPDATE with embedding via raw SQL
  - File: `scripts/import-essays-to-knowledge.ts` lines 163-184

## Phase 2: Scholarship Data Collection 🔄 (Next)

### TODO

- [ ] **Scrape Native Forward Scholarships**
  - Run: `python scripts/discover-scholarships.py` to find scholarships
  - Run: `python scripts/scrape-all-smarterselect.py` to scrape all
  - Or run: `python scripts/scrape-one-smarterselect.py <url>` for individual scholarships
  - Expected: ~50-100 scholarships with full application indexing

- [ ] **Verify Scraped Data**
  - Check that scholarships have `applicationSections` indexed
  - Ensure essay prompts and questions are captured
  - Verify file uploads are documented

- [ ] **Import Additional User Essays** (if needed)
  - Run import script for other users: `npx tsx scripts/import-essays-to-knowledge.ts <email>`
  - Verify knowledge extraction quality
  - Manually verify/correct important knowledge items

## Phase 3: Interview Interface 📋 (Future)

### TODO

- [ ] **Create Interview Chat UI**
  - Real-time chat interface component
  - Message history display
  - Knowledge citation display (showing which past essays/knowledge was referenced)
  - Draft response preview
  - User approval/editing workflow

- [ ] **Implement Interview Backend**
  - File: `app/routes/api.interview.tsx`
  - POST endpoint to handle interview messages
  - LLM integration for response generation
  - Knowledge base search integration
  - Application context building
  - Real-time knowledge updates

- [ ] **Interview Flow Logic**
  - For each application section:
    1. Semantic search for relevant global knowledge
    2. Check existing application context
    3. Generate draft response
    4. Present to user with citations
    5. Get user feedback/approval
    6. Store in ApplicationContext
    7. Update GlobalKnowledge if new facts learned

- [ ] **Parallel Application Support**
  - Share global knowledge across concurrent interviews
  - Update global knowledge in real-time as new facts confirmed
  - Maintain separate application contexts

## Phase 4: Browser Extension 🌐 (Future)

### TODO

- [ ] **Extension Architecture**
  - Manifest file for Chrome/Firefox
  - Content script for field detection
  - Background service worker for API communication
  - UI overlay for "sparkle" icons

- [ ] **Field Detection**
  - Auto-detect scholarship pages via URL matching
  - Identify form inputs (text, textarea, select)
  - Match inputs to application sections
  - Display sparkle icon on fillable fields

- [ ] **Auto-Fill Integration**
  - Fetch application context from API
  - Prefill fields with approved responses
  - User confirmation before filling
  - Handle special cases (file uploads, word limits)

- [ ] **API for Extension**
  - `GET /api/applications/:id/fill-data` - Get fill data for extension
  - POST extension updates back to application context
  - Real-time sync between web app and extension

## Phase 5: Testing & Polish ✨ (Future)

### TODO

- [ ] **Test Complete Flow**
  - Scrape scholarship
  - Build knowledge base
  - Interview for application
  - Extension fills form
  - User reviews and submits

- [ ] **Edge Cases**
  - Word limit enforcement
  - Character limit handling
  - File upload requirements
  - Duplicate prompt detection
  - Conflicting information resolution

- [ ] **Performance**
  - Optimize embedding generation (batch processing)
  - Cache frequent queries
  - Rate limiting for OpenAI API
  - Database query optimization

- [ ] **User Experience**
  - Progress indicators
  - Error handling
  - Offline support (partial)
  - Mobile responsiveness

## Database Schema Reference

### GlobalKnowledge
```prisma
model GlobalKnowledge {
  id          String   @id @default(cuid())
  userId      String
  type        String   // "experience", "skill", "achievement", "value", "goal"
  category    String?
  title       String
  content     String   @db.Text
  source      String?
  sourceEssay String?
  confidence  Float    @default(0.5)
  verified    Boolean  @default(false)
  embedding   Unsupported("vector(1536)")?
  useCount    Int      @default(0)
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

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
  referencedGlobalKnowledge String[]
  referencedOtherSections   String[]
  themes          String[]
  tone            String?
  status          String   @default("draft")
  userFeedback    String?  @db.Text
  applicationNarrative String?  @db.Text
  keyStories       Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  application     Application  @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@unique([applicationId, sectionId])
  @@index([applicationId])
  @@index([userId])
  @@index([status])
}
```

## API Endpoints Reference

### Knowledge Management
- `GET /api/knowledge` - List user's knowledge (filterable by type, category, verified)
- `POST /api/knowledge` - Add new knowledge item (generates embedding)
- `PUT /api/knowledge/:id` - Update knowledge item
- `DELETE /api/knowledge/:id` - Delete knowledge item
- `GET /api/knowledge/search?q=<query>` - Semantic search

### Application Context
- `GET /api/applications/:id/context` - Get all context for application
- `PUT /api/applications/:id/context` - Update/create context (tracks usage)
- `DELETE /api/applications/:id/context/:sectionId` - Remove context

### Context Building
- `POST /api/knowledge/search` - Auto-build context for scholarship
  - Body: `{ applicationId?, scholarshipId }`
  - Creates/updates ApplicationContext for each section
  - Performs semantic search for relevant knowledge

## Scripts Reference

- `scripts/import-essays-to-knowledge.ts <email>` - Import essays to knowledge base
- `scripts/check-essay-fields.ts` - Debug essay data structure
- `scripts/discover-scholarships.py` - Find scholarships on SmarterSelect
- `scripts/scrape-all-smarterselect.py` - Scrape all discovered scholarships
- `scripts/scrape-one-smarterselect.py <url>` - Scrape single scholarship

## Notes

- **CUID vs UUID**: Schema uses `@default(cuid())`, so always use Prisma ORM for creation, not raw SQL with `gen_random_uuid()`
- **Embedding Storage**: Prisma's `Unsupported("vector(1536)")` requires raw SQL for embedding INSERT/UPDATE
- **Essay Content**: Stored in `body` field, not `essay` field
- **Headless Browser**: Changed from `headless=True` to `headless=False` for debugging visibility
- **Browser Scraping**: Using local browser (free) instead of cloud browser (credits)

## Next Steps

1. Run scholarship scrapers to populate database
2. Build interview chat interface
3. Implement interview flow with knowledge integration
4. Develop browser extension for form filling
5. Test complete flow end-to-end
