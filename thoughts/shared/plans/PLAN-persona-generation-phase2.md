# Implementation Plan: Phase 2 - Persona Profile Generation

**Created:** 2026-02-02
**Agent:** Plan (a2b4601)
**Estimated Time:** 4-5 hours
**Phase:** 2 of 8 (Synthesized Essay Generation)

---

## Overview

Implement the persona profile generation system that analyzes user essays to extract writing style, key experiences, and quick facts for use in synthesized essay generation.

---

## Task Breakdown

### Task 1: Create Persona Generation Service
**File:** `app/lib/persona-generation.server.ts`
**Complexity:** Medium
**Dependencies:** None

**Functions to implement:**
- `generatePersonaProfile(userId, essays)` - Main analysis function
- `sampleRepresentativeEssays(userId)` - Helper to select essays

**Key implementation details:**
1. Sample 10-15 representative essays (prioritize awarded)
2. Extract writing style using `gpt-4o` with JSON mode
3. Extract key facts (experiences, achievements, values, goals)
4. Extract quick facts from existing GlobalKnowledge

---

### Task 2: Create Background Job Wrapper
**File:** `app/lib/persona-generation.server.ts` (same file)
**Complexity:** Low
**Dependencies:** Task 1

**Function to implement:**
- `generatePersonaProfileBackground(userId)` - Async background job

**Implementation pattern:**
```typescript
// Set status to "generating"
try {
  // Update progress at milestones
  // Call generatePersonaProfile()
  // Set status to "ready" with results
} catch (error) {
  // Set status to "failed" with error message
}
```

---

### Task 3: Create Generation Trigger API
**File:** `app/routes/api.persona.generate.tsx`
**Complexity:** Low
**Dependencies:** Task 2

**Endpoint:** POST `/api/persona/generate`

**Logic:**
1. Check if already generating (return 409 if yes)
2. Trigger `generatePersonaProfileBackground(userId)`
3. Return success immediately

---

### Task 4: Create Progress Polling API
**File:** `app/routes/api.persona.progress.tsx`
**Complexity:** Low
**Dependencies:** None

**Endpoint:** GET `/api/persona/progress`

**Returns:**
- status, progress, startedAt, completedAt, errorMessage

---

### Task 5: Integrate with Essay Upload
**File:** `app/routes/essays.upload.tsx` (modify)
**Complexity:** Low
**Dependencies:** Task 2

**Add after line 112:**
```typescript
generatePersonaProfileBackground(userId).catch((error) => {
  console.error("Persona generation failed (continuing anyway):", error);
});
```

---

## Implementation Order

```
Task 1 + Task 2 (same file) → Task 3 → Task 5
                              ↘
                               Task 4 (parallel)
```

**Critical path:** Task 1/2 → Task 3 → Task 5

---

## LLM Prompts

### Writing Style Analysis

Uses `gpt-4o` with temperature 0.3, JSON mode.

Extracts:
- `learned`: tone, voice, complexity, focus
- `examples`: representative quotes with context
- `overrides`: phrases to avoid/prefer

**Critical rule:** Only extract patterns appearing in 3+ essays.

### Key Facts Extraction

Structured extraction of:
- `experiences`: leadership, community_service, academic, work
- `achievements`: with impact metrics
- `values`: core values with evidence
- `goals`: short-term and long-term

**Critical rule:** First-person context only, filter out info about other people.

---

## Testing Approach

### Unit Tests
- Essay sampling with < 3 essays (should error)
- Awarded essays prioritized
- Status transitions (not_started → generating → ready)
- Duplicate generation prevention

### Integration Tests
- POST `/api/persona/generate` → returns "generating"
- GET `/api/persona/progress` → returns progress
- Upload essay → background job starts

### E2E Test
Upload essays → trigger generation → poll progress → verify ready

---

## Reference Files

- `app/lib/fact-extraction.server.ts` - LLM patterns
- `app/routes/api.extension.chat.tsx` - OpenAI calls
- `app/routes/essays.upload.tsx` - Background pattern
- `prisma/schema.prisma` - PersonaProfile model

---

## Risk Factors

- LLM prompt tuning may require iteration
- Essay sampling edge cases (very few essays)
- API failure handling needs testing

---

## Handoff

Next phase: Validate this plan with validate-agent, then implement.
