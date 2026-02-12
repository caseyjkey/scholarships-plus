# Fix Guide: Cleaning Up Garbage Data

**Date:** 2026-02-01
**Issue:** Extension autofilling with incorrect data
**Status:** ✅ Prevention implemented, cleanup ready

---

## What We Fixed

### 1. ✅ Improved LLM Prompt (Prevention)
**File:** `app/lib/fact-extraction.server.ts:121-170`

**Changes:**
- Now explicitly extracts ONLY first-person information
- Rejects information about other people mentioned in essays
- Provides clear examples of what to extract vs reject
- Prevents garbage data from being extracted in the first place

**Example:**
```
✅ EXTRACT: "My email is casey@example.com" → casey@example.com
❌ REJECT: "I worked with Jane (jane@example.com)" → null
```

### 2. ✅ Conflict Detection (Prevention)
**File:** `app/lib/fact-extraction.server.ts:56-95`

**Changes:**
- Before storing a fact, checks if a different value already exists
- Skips storing conflicting values to prevent pollution
- Logs warnings when conflicts are detected
- Prevents accumulation of garbage data

**Example:**
```
⚠️  CONFLICT DETECTED for "Email Address":
   Existing values: hey@keycasey.com
   New value: jane.doe@example.com
   Skipping to prevent garbage data.
```

### 3. ✅ Cleanup Script (Remediation)
**File:** `scripts/clean-obvious-fields.ts`

**Features:**
- Uses consensus strategy (most frequent value wins)
- Deletes conflicting garbage values
- Safe confirmation before deletion
- Supports lookup by email or userId

---

## Step-by-Step Fix

### Step 1: Clean Up Existing Garbage Data

```bash
# Clean up garbage data for test@mobile.test user
npx tsx scripts/clean-obvious-fields.ts test@mobile.test
```

**What this does:**
1. Finds all obvious_field entries for the user
2. Groups by field type (Email, First Name, etc.)
3. Counts occurrences of each value
4. Keeps the most frequent value (consensus)
5. Deletes all other conflicting values

**Example output:**
```
🧹 Cleaning obvious fields for user: cmkt37oky0001l1vmyfrn0rnc

Found 447 obvious_field entries

✅ Email Address: Consensus value is "hey@keycasey.com" (2/4 occurrences)
   🗑️  Deleting: "NScholarsh@aol.com" (essay:cmktcct05001zlujm4w1cft8z)
   🗑️  Deleting: "null" (essay:cmktcct400022lujmfzxuivoe)

✅ First Name: Consensus value is "Casey" (15/15 occurrences)

📊 Summary:
   Fields to keep: 8
   Entries to delete: 32

⚠️  About to delete 32 entries. Continue? (y/N)
```

Type `y` and press Enter to confirm deletion.

### Step 2: Re-extract Facts with Improved Prompt

```bash
# Re-extract all facts using the improved prompt
npx tsx scripts/reextract-facts.ts cmkt37oky0001l1vmyfrn0rnc
```

**What this does:**
1. Deletes ALL obvious_field entries for the user
2. Re-processes all 72 essays with the improved prompt
3. Extracts facts using new first-person-only logic
4. Skips conflicting values (conflict detection enabled)

**Expected output:**
```
[FactExtraction] Starting fact extraction for essay cmkt37oky...
[FactExtraction] Extracted 5 facts from essay
[FactExtraction] Facts to store: First Name=Casey, Email Address=hey@keycasey.com, ...
[FactExtraction] ✅ Stored fact: First Name = Casey
[FactExtraction] ℹ️  Fact "First Name = Casey" already exists, skipping duplicate
[FactExtraction] ✅ Stored fact: Email Address = hey@keycasey.com
[FactExtraction] ✅ Completed fact extraction: 2/5 stored (3 duplicates)
```

### Step 3: Verify the Fix

Test the autofill to confirm it's working correctly:

#### Option A: Direct Database Query
```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const user = await prisma.user.findUnique({
  where: { email: 'test@mobile.test' },
  select: { id: true }
});

const email = await prisma.globalKnowledge.findFirst({
  where: {
    userId: user.id,
    type: 'obvious_field',
    title: 'Email Address',
    verified: true
  },
  select: { content: true }
});

console.log('Email in database:', email?.content);
await prisma.\$disconnect();
"
```

**Expected output:**
```
Email in database: Value: hey@keycasey.com
```

#### Option B: Test with Extension
1. Load Chrome extension
2. Navigate to a scholarship application form
3. Click sparkle icon on email field
4. Verify it suggests `hey@keycasey.com`, NOT `NScholarsh@aol.com`

### Step 4: Check for Conflicts

If new essays are uploaded, check the logs for conflicts:

```bash
# Watch logs during essay upload
tail -f logs/fact-extraction.log

# Look for lines like:
# ⚠️  CONFLICT DETECTED for "Email Address"
```

If conflicts appear, investigate:
1. Check the essay content - does it mention other people?
2. Verify the improved prompt is working
3. Run cleanup script again if needed

---

## Prevention Going Forward

### For New Essay Uploads

The improved extraction will now:
1. **Only extract first-person facts** ("My email is...")
2. **Skip other people's info** ("I worked with Jane at jane@...")
3. **Detect conflicts** before storing
4. **Log warnings** when conflicts are detected

### Manual Verification (Future Enhancement)

Consider adding a UI step after essay upload:

```
✅ We found these facts in your essay:

  First Name: Casey          [✓ Correct] [✗ Edit]
  Email: hey@keycasey.com    [✓ Correct] [✗ Edit]

  [Save Facts]
```

This allows users to confirm/correct facts before they're marked as verified.

---

## Testing the Fix

### Test Case 1: Essay with Other People

Create a test essay:
```
I am Casey Key (hey@keycasey.com). My GPA is 3.8.
I worked with Jane Doe (jane.doe@example.com) on a community project.
My mentor Dr. Smith (smith@university.edu) provided guidance.
```

Run extraction:
```bash
npx tsx scripts/test-single-essay.ts test@mobile.test "test-essay-content"
```

**Expected:**
- ✅ Extracts: Casey, hey@keycasey.com, 3.8
- ❌ Does NOT extract: Jane, jane.doe@example.com, Dr. Smith, smith@university.edu

### Test Case 2: Conflicting Data

If extraction somehow extracts a conflicting value:

**Expected:**
```
⚠️  CONFLICT DETECTED for "Email Address":
   Existing values: hey@keycasey.com
   New value: jane.doe@example.com
   Skipping to prevent garbage data.
```

The new value should NOT be stored.

---

## Troubleshooting

### Issue: Cleanup script finds no garbage data

**Cause:** All values are unique (no duplicates)
**Solution:** Manually review the values and delete incorrect ones:

```bash
# List all email entries
npx tsx scripts/check-email-facts.ts

# Manually delete incorrect entries
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
await prisma.globalKnowledge.delete({ where: { id: 'fact-xxx-yyy-zzz' } });
await prisma.\$disconnect();
"
```

### Issue: Re-extraction still produces garbage data

**Cause:** LLM is still extracting other people's info
**Solution:**
1. Check the essay content - is it ambiguous?
2. Update the prompt with more specific examples
3. Consider increasing temperature to 0.0 for stricter extraction

### Issue: Legitimate facts are being marked as conflicts

**Cause:** Person changed their email/university
**Solution:**
1. Delete the old value manually
2. Re-run extraction for that essay
3. Or update the fact manually in the database

---

## Summary

| Step | Command | Purpose |
|------|---------|---------|
| 1. Clean | `npx tsx scripts/clean-obvious-fields.ts test@mobile.test` | Remove garbage data |
| 2. Re-extract | `npx tsx scripts/reextract-facts.ts <userId>` | Re-process with improved prompt |
| 3. Verify | Database query or extension test | Confirm fix worked |
| 4. Monitor | Watch logs during uploads | Catch new conflicts early |

**Result:**
- ✅ Garbage data removed
- ✅ Improved extraction prevents future pollution
- ✅ Conflict detection catches edge cases
- ✅ Autofill returns correct values

---

## Files Modified

- ✅ `app/lib/fact-extraction.server.ts` - Improved prompt + conflict detection
- ✅ `scripts/clean-obvious-fields.ts` - New cleanup script
- ✅ `docs/DIAGNOSIS-garbage-data.md` - Root cause analysis
- ✅ `docs/FIX-GUIDE-garbage-data.md` - This guide

---

## Next Steps

1. Run cleanup script
2. Re-extract facts
3. Verify autofill works
4. Consider adding manual verification UI (future)
5. Monitor logs for conflicts during new uploads
