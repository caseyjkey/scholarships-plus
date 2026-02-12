# Knowledge Base Learning Architecture

**Created:** 2026-02-01
**Status:** Active with Improvement Opportunities

---

## Overview

The knowledge base has a **continuous learning system** that improves from user interactions. When users correct or confirm values through the extension chat, those corrections are stored and used for future autofills.

---

## Current Learning Flow

### 1. Initial Knowledge Extraction (Essay Upload)

```
User uploads essay
    ↓
extractAndStoreFacts() → LLM extracts facts
    ↓
Stored in GlobalKnowledge
    - type: "obvious_field"
    - verified: false (initially)
    - confidence: 0.9
    - source: "essay:xxx"
```

### 2. Field Autofill (Extension)

```
User clicks sparkle on field
    ↓
preprocessObviousField() → Vector search for verified facts
    ↓
Returns value if found (verified: true)
    ↓
Otherwise falls back to essay chunk search + AI generation
```

### 3. User Confirmation (Chat Interaction) ✅ LEARNING HAPPENS HERE

```
User chats with AI about field
    ↓
AI proposes value (canPropose: true)
    ↓
User clicks "✨ Sounds good!"
    ↓
saveConfirmedObviousField() is called
    ↓
Updates/Creates GlobalKnowledge entry:
    - type: "obvious_field"
    - verified: TRUE
    - confidence: 1.0
    - source: "user_confirmed"
    - embedding: generated for vector search
```

**Code Reference:** `app/routes/api.extension.chat.tsx:173-188`

---

## What Gets Learned

### ✅ Currently Learned (Obvious Fields)

When users confirm values via chat, the system learns:

| Field Type | Examples | Storage |
|------------|----------|---------|
| Names | First Name, Last Name | GlobalKnowledge (obvious_field) |
| Contact | Email, Phone | GlobalKnowledge (obvious_field) |
| Education | University, Major, GPA | GlobalKnowledge (obvious_field) |
| Location | City, State | GlobalKnowledge (obvious_field) |

**Implementation:** `field-generation.server.ts:584-661`

```typescript
export async function saveConfirmedObviousField(
  userId: string,
  fieldKey: string,
  fieldLabel: string,
  value: string
): Promise<void> {
  // Saves to GlobalKnowledge with:
  // - verified: true
  // - confidence: 1.0
  // - source: "user_confirmed"
  // - embedding: generated for future similarity search
}
```

### ❌ NOT Currently Learned (Essay Responses)

**LIMITATION:** Long-form essay responses are NOT saved back to the knowledge base.

Example scenario:
```
1. User: "Tell me about my leadership experience"
2. AI: Searches knowledge base, crafts 200-word response
3. User: "Make it more specific about my role as club president"
4. AI: Refines response with better details
5. User: Accepts and uses the response
❌ PROBLEM: This refined response is NOT saved to knowledge base
❌ RESULT: Next time user needs similar content, AI starts from scratch
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    ESSAY UPLOAD FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Essay Upload → extractAndStoreFacts()                      │
│         ↓                                                   │
│  OpenAI GPT-4o-mini extracts facts                         │
│         ↓                                                   │
│  ┌─────────────────────────────────────┐                   │
│  │    GlobalKnowledge Storage          │                   │
│  │  - type: "obvious_field"            │                   │
│  │  - verified: false                  │                   │
│  │  - confidence: 0.9                  │                   │
│  │  - source: "essay:xxx"              │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 AUTOFILL REQUEST FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User clicks sparkle icon                                   │
│         ↓                                                   │
│  preprocessObviousField()                                   │
│         ↓                                                   │
│  Vector search for verified=true facts                      │
│         ↓                                                   │
│  ┌─────────────────────────────────┐                       │
│  │ Found?                          │                       │
│  │  YES → Return verified value    │───┐                   │
│  │  NO  → Fall back to AI gen      │   │                   │
│  └─────────────────────────────────┘   │                   │
│                                         │                   │
│         ┌───────────────────────────────┘                   │
│         ↓                                                   │
│  Opens AI chat for user interaction                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              USER CONFIRMATION FLOW (LEARNING)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User chats with AI                                         │
│         ↓                                                   │
│  AI proposes value (canPropose: true)                       │
│         ↓                                                   │
│  User clicks "✨ Sounds good!"                              │
│         ↓                                                   │
│  saveConfirmedObviousField() called                         │
│         ↓                                                   │
│  ┌─────────────────────────────────────┐                   │
│  │  Update GlobalKnowledge:            │                   │
│  │  - verified: TRUE                   │                   │
│  │  - confidence: 1.0                  │                   │
│  │  - source: "user_confirmed"         │                   │
│  │  - embedding: generated             │                   │
│  └─────────────────────────────────────┘                   │
│         ↓                                                   │
│  ✅ LEARNED! Future autofills use this value               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Gaps and Improvement Opportunities

### Gap 1: Essay Responses Not Learned

**Problem:**
- User crafts perfect essay response via chat
- Response is used for application
- Response is NOT saved to knowledge base
- Next similar question requires starting from scratch

**Impact:**
- Wasted effort (user re-explains same experiences)
- Inconsistent responses across applications
- AI doesn't improve from user preferences

**Proposed Solution:**

Add essay response learning:

```typescript
// When user accepts essay response in chat
export async function saveConfirmedEssayResponse(
  userId: string,
  prompt: string,
  response: string,
  metadata: {
    scholarshipId: string,
    fieldLabel: string,
    wordCount?: number,
    tone?: string,
    themes?: string[]
  }
): Promise<void> {
  // Store in GlobalKnowledge with:
  // - type: "essay_response"
  // - category: extract from prompt (e.g., "leadership", "community_service")
  // - title: summarize prompt
  // - content: full response
  // - verified: true
  // - source: "user_confirmed_chat"
  // - embedding: for similarity search
}
```

**Benefits:**
- Similar prompts find existing responses
- AI can adapt/combine previous responses
- User builds library of proven responses

### Gap 2: No Multi-Turn Chat Learning

**Problem:**
- User has 5-turn conversation to perfect response
- Only final response stored
- Intermediate corrections and user preferences lost

**Example:**
```
Turn 1: "Tell me about leadership"
Turn 2: "Focus on my role as club president"
Turn 3: "Add specific metrics - we grew membership by 50%"
Turn 4: "Make it more personal and less formal"
Turn 5: "Perfect!" ✅

Current: Only stores final response
Lost: User prefers personal tone, wants metrics, focuses on president role
```

**Proposed Solution:**

Track conversation metadata:

```typescript
interface ChatLearnings {
  userId: string;
  fieldType: string;
  corrections: Array<{
    what: string; // "tone", "detail_level", "focus", "length"
    from: string;
    to: string;
  }>;
  preferences: {
    tone?: "formal" | "personal" | "conversational";
    detailLevel?: "brief" | "detailed" | "extensive";
    includeMetrics?: boolean;
    includePersonalStories?: boolean;
  };
}
```

Store as metadata in GlobalKnowledge to inform future responses.

### Gap 3: No Cross-Application Learning

**Problem:**
- User perfects response for Scholarship A
- Similar question in Scholarship B starts from scratch
- AI doesn't recognize "leadership essay" pattern

**Proposed Solution:**

Add essay response tagging and similarity search:

```typescript
// When autofilling essay field
const similarResponses = await searchGlobalKnowledge(
  userId,
  essayPrompt,
  { type: "essay_response", verified: true },
  limit: 3
);

if (similarResponses.length > 0) {
  // Offer to adapt previous response
  return {
    suggestions: similarResponses.map(r => ({
      title: r.title,
      preview: r.content.substring(0, 100),
      similarity: r.similarity,
      usedFor: r.metadata.scholarshipName
    })),
    canAdapt: true
  };
}
```

### Gap 4: No Confidence Updating from Usage

**Problem:**
- User consistently accepts certain autofill values
- Confidence score stays static
- No signal that certain facts are more reliable

**Proposed Solution:**

Track usage and update confidence:

```typescript
// When user accepts autofill without changes
await prisma.globalKnowledge.update({
  where: { id: factId },
  data: {
    useCount: { increment: 1 },
    lastUsedAt: new Date(),
    confidence: Math.min(1.0, confidence + 0.05), // Increase confidence
  }
});

// When user rejects/changes autofill
await prisma.globalKnowledge.update({
  where: { id: factId },
  data: {
    confidence: Math.max(0.5, confidence - 0.1), // Decrease confidence
  }
});
```

### Gap 5: No Temporal Tracking

**Problem:**
- User's GPA changes (3.5 → 3.8 → 3.9)
- System treats all as conflicts
- No understanding of "current" vs "past" values

**Proposed Solution:**

Add temporal metadata:

```typescript
interface GlobalKnowledge {
  // ... existing fields
  validFrom?: Date;
  validUntil?: Date;
  isCurrent: boolean;
  replacedBy?: string; // ID of newer entry
}
```

When new value confirmed:
```typescript
// Mark old GPA as historical
await prisma.globalKnowledge.update({
  where: { id: oldGpaId },
  data: {
    isCurrent: false,
    validUntil: new Date(),
    replacedBy: newGpaId
  }
});

// Create new GPA as current
await prisma.globalKnowledge.create({
  data: {
    // ...
    isCurrent: true,
    validFrom: new Date()
  }
});
```

---

## Proposed Enhancements

### Enhancement 1: Save Confirmed Essay Responses

**Implementation Steps:**

1. **Extend saveConfirmedObviousField to handle essays**

```typescript
// File: app/lib/field-generation.server.ts

export async function saveConfirmedResponse(
  userId: string,
  fieldLabel: string,
  value: string,
  metadata: {
    fieldType: "text" | "textarea" | "select";
    scholarshipId: string;
    prompt?: string;
    wordCount?: number;
  }
): Promise<void> {
  const isEssay = metadata.fieldType === "textarea" && value.length > 200;

  if (isEssay) {
    // Store as essay response
    const knowledge = await prisma.globalKnowledge.create({
      data: {
        userId,
        type: "essay_response",
        category: extractCategory(fieldLabel), // "leadership", "goals", etc.
        title: fieldLabel,
        content: value,
        verified: true,
        confidence: 1.0,
        source: "user_confirmed_chat",
        metadata: JSON.stringify(metadata),
      }
    });

    // Generate embedding
    const embedding = await generateEmbedding(`${fieldLabel}: ${value}`);
    await prisma.$executeRaw`
      UPDATE "GlobalKnowledge"
      SET embedding = ${JSON.stringify(embedding)}::vector(1536)
      WHERE id = ${knowledge.id}
    `;
  } else {
    // Use existing obvious field logic
    await saveConfirmedObviousField(userId, fieldKey, fieldLabel, value);
  }
}
```

2. **Update chat endpoint to call this function**

```typescript
// File: app/routes/api.extension.chat.tsx

// After user accepts proposal (line 173)
if (aiResult.canPropose && userAccepted) {
  await saveConfirmedResponse(userId, fieldLabel, aiResult.response, {
    fieldType,
    scholarshipId,
    prompt: essayPrompt,
    wordCount: aiResult.response.split(' ').length
  });
}
```

3. **Add essay response search to autofill**

```typescript
// File: app/lib/field-generation.server.ts

async function searchForSimilarEssays(
  userId: string,
  essayPrompt: string
): Promise<Array<{ content: string; similarity: number; usedFor: string }>> {
  const embedding = await generateEmbedding(essayPrompt);

  const results = await prisma.$queryRaw`
    SELECT content, metadata,
           (embedding <#> ${JSON.stringify(embedding)}::vector) AS similarity
    FROM "GlobalKnowledge"
    WHERE "userId" = ${userId}
      AND type = 'essay_response'
      AND verified = true
    ORDER BY (embedding <#> ${JSON.stringify(embedding)}::vector) ASC
    LIMIT 3
  `;

  return results;
}
```

### Enhancement 2: Preference Learning

**Track user preferences from chat interactions:**

```typescript
interface UserPreferences {
  userId: string;
  writingStyle: {
    tone: "formal" | "conversational" | "personal";
    detailLevel: "concise" | "balanced" | "detailed";
    useFirstPerson: boolean;
    includeMetrics: boolean;
  };
  responsePatterns: {
    startsWithAnecdote: boolean;
    includesCallToAction: boolean;
    prefersShortParagraphs: boolean;
  };
  learnedFrom: Date;
  confidence: number; // Increases with more confirmations
}
```

**Store in database:**

```prisma
model UserPreferences {
  id              String   @id @default(cuid())
  userId          String   @unique
  writingStyle    Json
  responsePatterns Json
  learnedFrom     DateTime @default(now())
  confidence      Float    @default(0.5)
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Use in AI prompts:**

```typescript
// When generating response, include learned preferences
const userPrefs = await prisma.userPreferences.findUnique({
  where: { userId }
});

const prompt = `
Generate a response with these preferences:
- Tone: ${userPrefs.writingStyle.tone}
- Detail level: ${userPrefs.writingStyle.detailLevel}
- Use metrics: ${userPrefs.writingStyle.includeMetrics ? 'yes' : 'no'}

User's input: ${userMessage}
`;
```

### Enhancement 3: Feedback Signals

**Track user acceptance/rejection:**

```typescript
interface ResponseFeedback {
  responseId: string; // GlobalKnowledge ID
  action: "accepted" | "rejected" | "modified";
  modifications?: string[]; // What changed
  timestamp: Date;
}
```

**Adjust confidence based on feedback:**

```typescript
async function updateConfidenceFromFeedback(
  knowledgeId: string,
  action: "accepted" | "rejected"
) {
  const knowledge = await prisma.globalKnowledge.findUnique({
    where: { id: knowledgeId }
  });

  const delta = action === "accepted" ? 0.05 : -0.10;
  const newConfidence = Math.max(0.5, Math.min(1.0, knowledge.confidence + delta));

  await prisma.globalKnowledge.update({
    where: { id: knowledgeId },
    data: {
      confidence: newConfidence,
      useCount: action === "accepted" ? { increment: 1 } : knowledge.useCount
    }
  });
}
```

---

## Implementation Priority

### High Priority (Implement First)

1. ✅ **Save confirmed essay responses** (Enhancement 1)
   - Most user value
   - Prevents re-work
   - Relatively simple to implement

2. ✅ **Feedback signals** (Enhancement 3)
   - Improves confidence scoring
   - Low implementation cost
   - High quality improvement

### Medium Priority

3. **Preference learning** (Enhancement 2)
   - Better personalization
   - Requires more data collection
   - Benefit increases over time

4. **Temporal tracking** (Gap 5)
   - Handles changing values correctly
   - Schema migration required
   - Important for accuracy

### Low Priority

5. **Multi-turn learning** (Gap 2)
   - Nice to have
   - Complex to implement
   - Marginal benefit

---

## Success Metrics

Track these to measure learning effectiveness:

```typescript
interface LearningMetrics {
  // Knowledge growth
  totalFacts: number;
  verifiedFacts: number;
  userConfirmedFacts: number;
  essayResponses: number;

  // Usage patterns
  autofillAcceptanceRate: number; // % accepted without changes
  chatIterationsAvg: number; // Avg turns to perfect response
  reusedResponsesCount: number; // Similar essays found and used

  // Quality signals
  avgConfidence: number;
  conflictRate: number; // Conflicts detected per 100 facts
  userSatisfactionScore?: number; // If collecting feedback
}
```

**Dashboard query:**

```typescript
const metrics = await prisma.globalKnowledge.aggregate({
  where: { userId },
  _count: true,
  _avg: { confidence: true },
  _count: {
    where: { verified: true }
  }
});
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('saveConfirmedResponse', () => {
  it('should save obvious field with verified=true', async () => {
    await saveConfirmedResponse(userId, 'Email', 'test@example.com', {...});
    const fact = await prisma.globalKnowledge.findFirst({
      where: { userId, title: 'Email' }
    });
    expect(fact.verified).toBe(true);
    expect(fact.confidence).toBe(1.0);
  });

  it('should save essay response with embeddings', async () => {
    const longResponse = 'A'.repeat(300); // Essay-length
    await saveConfirmedResponse(userId, 'Leadership Essay', longResponse, {...});
    const essay = await prisma.globalKnowledge.findFirst({
      where: { userId, type: 'essay_response' }
    });
    expect(essay).toBeDefined();
    expect(essay.embedding).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe('Learning Flow E2E', () => {
  it('should learn from chat and use in next autofill', async () => {
    // 1. User chats and confirms value
    await chatAPI.post('/api/extension/chat', {
      message: 'My email is test@example.com',
      fieldName: 'email'
    });

    // 2. Simulate user acceptance
    await chatAPI.post('/api/extension/confirm', {
      fieldName: 'email',
      value: 'test@example.com'
    });

    // 3. Request autofill for same field
    const response = await autofillAPI.post('/api/extension/autofill', {
      fieldName: 'email_address'
    });

    // 4. Should return learned value
    expect(response.data.value).toBe('test@example.com');
    expect(response.data.source).toBe('user_confirmed');
  });
});
```

---

## Monitoring and Debugging

### Logging

```typescript
console.log('[Learning] Saved confirmed response', {
  userId,
  fieldLabel,
  valueLength: value.length,
  type: isEssay ? 'essay' : 'obvious_field',
  source: 'user_confirmed'
});
```

### Debugging Queries

```sql
-- Check learning activity
SELECT
  DATE(created_at) as date,
  type,
  COUNT(*) as facts_learned,
  AVG(confidence) as avg_confidence
FROM "GlobalKnowledge"
WHERE source = 'user_confirmed'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), type
ORDER BY date DESC;

-- Find most reused responses
SELECT
  title,
  content,
  use_count,
  confidence
FROM "GlobalKnowledge"
WHERE type = 'essay_response'
  AND verified = true
ORDER BY use_count DESC
LIMIT 10;
```

---

## Future Vision

### Phase 1: Current (✅ Implemented)
- Learn obvious field values from chat confirmations
- Store with high confidence and verified flag
- Use for future autofills

### Phase 2: Essay Learning (🔨 Proposed)
- Save confirmed essay responses
- Search and suggest similar past responses
- Adapt responses for new contexts

### Phase 3: Preference Learning (🔮 Future)
- Track user writing style preferences
- Personalize AI responses
- Improve over time with usage

### Phase 4: Intelligent Adaptation (🔮 Future)
- Automatically adapt past essays to new prompts
- Combine multiple past responses intelligently
- Suggest improvements based on success patterns

---

## Related Documentation

- [Knowledge Extraction Pipeline](./knowledge-extraction-pipeline.md)
- [Garbage Data Diagnosis](./DIAGNOSIS-garbage-data.md)
- [Fix Guide](./FIX-GUIDE-garbage-data.md)
- [Database Schema](../prisma/schema.prisma)

---

## Questions?

This architecture enables continuous improvement of the knowledge base through user interactions. The more users interact with the chat and confirm values, the smarter the autofill becomes.

For implementation questions or to propose additional enhancements, see the [Implementation Priority](#implementation-priority) section above.
