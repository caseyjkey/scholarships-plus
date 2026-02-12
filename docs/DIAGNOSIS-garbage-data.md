# Diagnosis: Garbage Data in Autofill System

**Date:** 2026-02-01
**Issue:** Extension autofilling fields with incorrect data (e.g., `NScholarsh@aol.com` instead of `hey@keycasey.com`)
**Status:** Root cause identified

---

## Problem Summary

The autofill system is returning garbage data like `NScholarsh@aol.com` for email fields instead of the user's actual email `hey@keycasey.com`.

## Root Cause

### 1. Ambiguous Fact Extraction Prompt

**Location:** `app/lib/fact-extraction.server.ts:121-152`

The LLM prompt extracts facts from essays but **doesn't distinguish between**:
- Facts ABOUT the essay author (the user)
- Facts ABOUT other people mentioned in the essay
- Example data or references in the essay

**Current prompt:**
```
You are a structured data extraction system. Extract factual information
from this scholarship application essay.
```

**The problem:** Essays often mention other people:
- "I volunteered with Jane Doe (jane.doe@example.com) at the food bank"
- "My mentor, Dr. Smith at NScholarsh@aol.com, helped me..."
- Example applications or scholarship descriptions copied into essays

The LLM extracts these emails as if they belong to the user!

### 2. All Extracted Facts Marked as Verified

**Location:** `app/lib/fact-extraction.server.ts:80`

```typescript
verified: true, // Facts extracted from user's own essays are considered verified
```

**The problem:** This assumes ALL extracted facts are about the user, which is FALSE.

Result: Database has 447 obvious_field entries, including:
```
Email Address: NScholarsh@aol.com (verified: true, confidence: 0.95)
Email Address: hey@keycasey.com (verified: true, confidence: 0.95)
Email Address: null (verified: true, confidence: 0.95)
```

### 3. No Conflict Resolution Strategy

**Location:** `app/lib/field-generation.server.ts:108-116`

The preprocessing logic does exact title match and returns the FIRST match ordered by confidence DESC. Since all have the same confidence (0.95), it's essentially random which one gets returned.

### 4. Database Evidence

Query results show 3+ different emails all marked as verified:

```sql
Type: obvious_field, Title: Email Address
Content: Value: NScholarsh@aol.com
Verified: true | Confidence: 0.95
Source: essay:cmktcct05001zlujm4w1cft8z

Type: obvious_field, Title: Email Address
Content: Value: hey@keycasey.com
Verified: true | Confidence: 0.95
Source: essay:cmktccsyf001xlujmhkb0n299

Type: obvious_field, Title: Email Address
Content: Value: null
Verified: true | Confidence: 0.95
Source: essay:cmktcct400022lujmfzxuivoe
```

---

## How It Happened

1. **Essay Upload:** User uploads 72 essays via Google Drive
2. **Fact Extraction:** `extractAndStoreFacts()` runs on each essay
3. **LLM Extraction:** GPT-4o-mini extracts "facts" from essay text
4. **Ambiguous Data:** Essays mention OTHER people's emails/info
5. **False Verification:** All extracted facts marked as `verified: true`
6. **Database Pollution:** 447 obvious_field entries, many conflicting
7. **Random Selection:** Preprocessing picks first match (happens to be garbage)

---

## Why It Will Happen Again

Without fixes, this will continue happening because:

1. **Every essay upload** extracts facts and marks them as verified
2. **No distinction** between user's info and other people's info
3. **No deduplication** - conflicting facts just accumulate
4. **No manual verification** - facts are auto-verified on extraction

---

## Solutions

### Immediate Fix (Stop the Bleeding)

1. **Delete garbage data:**
   ```bash
   npx tsx scripts/clean-obvious-fields.ts
   ```
   - Keep only facts that appear in MULTIPLE essays (consensus)
   - OR manually verify and keep only correct facts

2. **Re-extract with improved prompt:**
   ```bash
   npx tsx scripts/reextract-facts.ts test@mobile.test
   ```

### Short-term Fix (Prevent Recurrence)

**Improve LLM Prompt** to distinguish user info from other people:

```typescript
const prompt = `You are extracting facts about THE ESSAY AUTHOR ONLY.

ESSAY TEXT:
"""
${truncatedText}
"""

Extract ONLY information about the person who WROTE this essay.

CRITICAL RULES:
1. Extract ONLY first-person information ("I", "my", "me")
2. DO NOT extract information about other people mentioned
3. DO NOT extract example data, references, or quotes
4. Use null if information is not clearly about the author
5. If multiple emails/phones appear, extract the one in first-person context

Examples:
✅ "My email is john@example.com" → extract john@example.com
❌ "I worked with Jane (jane@example.com)" → DO NOT extract jane@example.com
✅ "I am a Computer Science major" → extract Computer Science
❌ "My mentor majored in Biology" → DO NOT extract Biology

Return JSON:
{
  "firstName": "first name of ESSAY AUTHOR or null",
  "lastName": "last name of ESSAY AUTHOR or null",
  "email": "email of ESSAY AUTHOR or null",
  ...
}`;
```

### Mid-term Fix (Conflict Resolution)

**Add deduplication logic:**

```typescript
// After extraction, check for conflicts
const existingEmail = await prisma.globalKnowledge.findFirst({
  where: {
    userId,
    type: "obvious_field",
    title: "Email Address",
    verified: true
  }
});

if (existingEmail && existingEmail.content !== `Value: ${newEmail}`) {
  // Conflict detected! Use consensus strategy:
  // 1. Count occurrences of each value across essays
  // 2. Keep the one that appears most frequently
  // 3. Mark others as verified: false
  // 4. OR flag for manual review
}
```

### Long-term Fix (Manual Verification)

**Add verification UI:**

1. After essay upload, show extracted facts to user
2. User confirms/corrects each fact
3. Only user-confirmed facts marked as verified: true
4. Auto-extracted facts marked as verified: false (suggestions)

**Example flow:**
```
✅ We found these facts in your essay:

  First Name: Casey ✓ Correct | ✗ Wrong
  Email: NScholarsh@aol.com ✓ Correct | ✗ Wrong

  [If wrong, enter correct value: ____________]
```

---

## Prevention Checklist

- [ ] Improve LLM prompt to extract only first-person info
- [ ] Add conflict detection and resolution
- [ ] Implement consensus strategy (most frequent = correct)
- [ ] Add manual verification UI
- [ ] Run cleanup script to remove garbage data
- [ ] Re-extract facts with improved prompt
- [ ] Test with essays that mention other people
- [ ] Add logging to track extraction conflicts

---

## Files to Modify

1. **`app/lib/fact-extraction.server.ts`**
   - Improve `extractFactsWithLLM()` prompt (lines 121-152)
   - Add conflict detection logic
   - Implement consensus strategy

2. **`app/lib/field-generation.server.ts`**
   - Add conflict resolution to `preprocessObviousField()` (lines 108-116)
   - Prefer facts with higher occurrence count

3. **`scripts/clean-obvious-fields.ts`** (NEW)
   - Script to clean garbage data
   - Keep only consensus facts

4. **`scripts/reextract-facts.ts`**
   - Update to use improved extraction

5. **`app/routes/essays.upload.tsx`** (FUTURE)
   - Add fact verification UI after upload

---

## Testing Plan

1. **Create test essay with ambiguous data:**
   ```
   I am Casey Key (hey@keycasey.com). My GPA is 3.8.
   I worked with Jane Doe (jane.doe@example.com) on the project.
   My mentor Dr. Smith (smith@university.edu) helped me.
   ```

2. **Run extraction:**
   ```bash
   npx tsx scripts/test-fact-extraction.ts
   ```

3. **Verify results:**
   - Should extract: Casey, hey@keycasey.com, 3.8
   - Should NOT extract: Jane, jane.doe@example.com, smith@university.edu

4. **Test autofill:**
   - Email field should return `hey@keycasey.com`
   - Should NOT return `jane.doe@example.com`

---

## Next Steps

1. ✅ Diagnosis complete
2. ⏳ Write improved prompt
3. ⏳ Create cleanup script
4. ⏳ Test improved extraction
5. ⏳ Re-extract all facts for test@mobile.test
6. ⏳ Verify autofill returns correct data
7. ⏳ Add manual verification UI (future)
