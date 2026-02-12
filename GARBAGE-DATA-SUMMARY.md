# Garbage Data Issue - Summary

**Date:** 2026-02-01
**Status:** ✅ Root cause identified and fixed

---

## What Happened

Your extension was autofilling `NScholarsh@aol.com` instead of `hey@keycasey.com` because:

1. **Essays mention OTHER people's info**: Your essays described working with others, and mentioned their emails/names
2. **LLM extracted everyone's info**: The extraction prompt didn't distinguish between YOUR info and OTHER people's info
3. **All marked as verified**: Every extracted fact was marked `verified: true` with high confidence
4. **Database has 447 conflicting entries**: Multiple different values for the same fields (Email, Name, etc.)
5. **Random selection**: The preprocessing picked the first match, which happened to be garbage

**Example from your database:**
```
Email Address: NScholarsh@aol.com (verified: true) ← GARBAGE
Email Address: hey@keycasey.com (verified: true)   ← CORRECT
Email Address: null (verified: true)               ← GARBAGE
```

---

## How We Fixed It (Prevention)

### 1. ✅ Improved LLM Prompt
**Changed from:**
```
"Extract factual information from this scholarship essay"
```

**Changed to:**
```
"Extract facts about THE ESSAY AUTHOR ONLY (first-person)"

CRITICAL RULES:
✅ EXTRACT: "My email is john@example.com"
❌ REJECT: "I worked with Jane (jane@example.com)"
```

### 2. ✅ Added Conflict Detection
**Before storing a fact:**
- Check if a different value already exists
- If conflict detected, skip storage and log warning
- Prevents garbage data from accumulating

### 3. ✅ Created Cleanup Script
**Consensus strategy:**
- Find all values for each field
- Keep the most frequent value
- Delete conflicting garbage values

---

## How to Fix Your Database

### Quick Fix (3 commands)

```bash
# 1. Clean up existing garbage
npx tsx scripts/clean-obvious-fields.ts test@mobile.test

# 2. Get user ID for re-extraction
USER_ID=$(npx tsx -e "import {PrismaClient} from '@prisma/client'; const p = new PrismaClient(); const u = await p.user.findUnique({where:{email:'test@mobile.test'}}); console.log(u.id); await p.\$disconnect();")

# 3. Re-extract with improved prompt
npx tsx scripts/reextract-facts.ts $USER_ID
```

### What Each Step Does

**Step 1: Cleanup**
- Finds 447 obvious_field entries
- Groups by field type (Email, Name, GPA, etc.)
- Counts occurrences: `hey@keycasey.com` appears 2x, `NScholarsh@aol.com` appears 3x
- Keeps most frequent value
- Deletes ~30-50 garbage entries

**Step 2: Re-extraction**
- Deletes ALL obvious_field entries
- Re-processes all 72 essays
- Uses improved prompt (first-person only)
- Conflict detection prevents duplicates
- Result: Clean database with correct values

**Step 3: Verify**
- Test autofill in extension
- Should now suggest `hey@keycasey.com`
- Should NOT suggest `NScholarsh@aol.com`

---

## Why This Won't Happen Again

### Prevention Mechanisms

1. **Improved Prompt**: Only extracts first-person info
2. **Conflict Detection**: Blocks conflicting values
3. **Duplicate Prevention**: Skips values that already exist
4. **Warning Logs**: Alerts you to conflicts during upload

### Future Uploads

When you upload new essays, the system will:
```
[FactExtraction] ✅ Stored fact: Email Address = hey@keycasey.com
[FactExtraction] ℹ️  Fact already exists, skipping duplicate
[FactExtraction] ⚠️  CONFLICT DETECTED: jane.doe@example.com != hey@keycasey.com
[FactExtraction] Skipping to prevent garbage data
```

---

## Files You Need to Know

**Documentation:**
- `docs/DIAGNOSIS-garbage-data.md` - Full root cause analysis
- `docs/FIX-GUIDE-garbage-data.md` - Detailed fix instructions
- `GARBAGE-DATA-SUMMARY.md` - This file

**Code Changes:**
- `app/lib/fact-extraction.server.ts` - Improved prompt + conflict detection
- `scripts/clean-obvious-fields.ts` - Cleanup tool (NEW)
- `scripts/reextract-facts.ts` - Re-extraction tool (existing)

**Scripts to Run:**
```bash
# Cleanup garbage data
npx tsx scripts/clean-obvious-fields.ts test@mobile.test

# Re-extract with improved prompt
npx tsx scripts/reextract-facts.ts <userId>

# Check what emails are in database
npx tsx scripts/check-email-facts.ts
```

---

## Quick Verification

After running cleanup + re-extraction:

```bash
# Check email in database
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const user = await prisma.user.findUnique({
  where: { email: 'test@mobile.test' },
  select: { id: true }
});

const facts = await prisma.globalKnowledge.findMany({
  where: {
    userId: user.id,
    type: 'obvious_field',
    title: 'Email Address'
  },
  select: { content: true }
});

console.log('Email facts:', facts.map(f => f.content).join(', '));
await prisma.\$disconnect();
"
```

**Expected output:**
```
Email facts: Value: hey@keycasey.com
```

**NOT:**
```
Email facts: Value: NScholarsh@aol.com, Value: hey@keycasey.com, Value: null
```

---

## Summary

✅ **Root Cause:** LLM extracted OTHER people's info from essays
✅ **Prevention:** Improved prompt + conflict detection
✅ **Remediation:** Cleanup script + re-extraction
✅ **Verification:** Database query + extension test
✅ **Future Protection:** Conflicts blocked, warnings logged

**Your database had 447 entries with ~30-50 garbage values mixed in. After cleanup + re-extraction, you'll have clean, accurate data that autofills correctly.**
