# Research: Persona Profile Generation Implementation

**Date:** 2026-02-02
**Agent:** Explore (a6cb1c5)

---

## Current Architecture Summary

### Essay Upload Flow
1. Files uploaded → Text extracted using `extractTextFromFile()`
2. Stored in `Essay` model with extracted text
3. Chunked and embedded in pgvector for semantic search
4. **Fact extraction** runs in background using LLM to extract structured facts
5. Similarity computation runs asynchronously

### Knowledge Base System
- `GlobalKnowledge` table stores extracted facts with vector embeddings
- **Fact extraction** uses OpenAI `gpt-4o-mini` with JSON mode
- **Conflict detection** prevents storing different values for same field
- **Verification system** tracks user-confirmed facts

### AI Integration
- Primary: OpenAI `gpt-4o-mini` (preferred for JSON mode)
- Fallback: GLM `glm-4.7`
- Temperature 0.1-0.3 for consistent responses

---

## Key Functions to Reuse

### 1. LLM Integration Patterns
```typescript
// From api.extension.chat.tsx
callOpenAI(messages, options) // JSON mode, error handling
callGLM(messages, options)    // Fallback
```

### 2. Knowledge Base Operations
```typescript
// From fact-extraction.server.ts
extractAndStoreFacts() // Pattern for LLM extraction
searchGlobalKnowledge() // Vector search with verification filters
```

### 3. Background Processing
```typescript
// From essays.upload.tsx - fire-and-forget pattern
generatePersonaProfileBackground(userId).catch(console.error)
```

---

## Background Processing Approach

### Recommended Pattern
```typescript
export async function generatePersonaProfileBackground(userId: string): Promise<void> {
  await prisma.personaProfile.update({
    where: { userId },
    data: { status: "generating", startedAt: new Date() }
  });

  try {
    const result = await analyzeEssaysForPersona(userId);

    await prisma.personaProfile.update({
      where: { userId },
      data: {
        status: "ready",
        completedAt: new Date(),
        writingStyle: result.writingStyle,
        keyFacts: result.keyFacts,
        quickFacts: result.quickFacts,
        progress: 100
      }
    });
  } catch (error) {
    await prisma.personaProfile.update({
      where: { userId },
      data: {
        status: "failed",
        errorMessage: error.message,
        completedAt: new Date()
      }
    });
  }
}
```

---

## OpenAI Integration for Persona Analysis

### Model Configuration
- **Model:** `gpt-4o` (better analysis than `gpt-4o-mini`)
- **Temperature:** 0.3 (balance of creativity and consistency)
- **Mode:** JSON mode for structured output

### Prompt Structure
Extract writing style, key facts, and quick facts from all user essays with strict rules to prevent garbage data, similar to the existing fact extraction system.

---

## Implementation Notes

1. **Database Ready:** `PersonaProfile` model already exists with all necessary fields ✓
2. **Trigger Points:** Add to essay upload flow (like fact extraction)
3. **Error Handling:** Follow existing patterns - log errors but don't fail main operations
4. **Progress Tracking:** Use existing status/progress fields for real-time updates
5. **Conflict Resolution:** Check for existing profiles, allow regeneration

---

## Key Files for Reference

| File | Purpose | Status |
|------|---------|--------|
| `app/lib/fact-extraction.server.ts` | LLM integration patterns | ✓ VERIFIED |
| `app/routes/essays.upload.tsx` | Background processing pattern | ✓ VERIFIED |
| `app/lib/field-generation.server.ts` | Knowledge base search | ✓ VERIFIED |
| `app/routes/api.extension.chat.tsx` | OpenAI/GLM integration | ✓ VERIFIED |
| `prisma/schema.prisma` | PersonaProfile model | ✓ VERIFIED |

---

## Next Steps

1. Create `app/lib/persona-generation.server.ts`
2. Create `app/routes/api.persona.generate.tsx`
3. Create `app/routes/api.persona.progress.tsx`
4. Modify `app/routes/essays.upload.tsx` to trigger generation
