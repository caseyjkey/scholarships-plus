# Testing Guide: Synthesized Essay Generation Feature

**Version:** 1.0.0
**Date:** 2026-02-02
**Status:** Ready for Testing

---

## Overview

This document provides comprehensive testing instructions for the Synthesized Essay Generation feature. All 6 phases have been implemented and are ready for manual testing.

---

## Prerequisites

### Test Account Setup

1. **Create or use test user:**
   - Email: `test@mobile.test`
   - Password: (set during registration)
   - Or create new account via `/register`

2. **Required Data:**
   - At least 3 uploaded essays (for persona generation)
   - Mix of awarded and non-awarded essays (recommended)
   - Essays with 200+ words each

### Environment Setup

1. **Start dev server:**
   ```bash
   npm run dev
   ```
   Server should run on:
   - HTTP: http://localhost:3030
   - HTTPS: https://localhost:3443

2. **Load extension in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `chrome-extension/` directory
   - Verify version shows **1.0.0**

3. **Navigate to demo page:**
   - Open http://localhost:3030/demo
   - Login with test account

---

## Phase 1: Data Model Tests

### 1.1 Database Schema Verification

```sql
-- Connect to database
docker exec continuous-claude-postgres psql -U claude -d continuous_claude

-- Check PersonaProfile table exists
\d "PersonaProfile"

-- Check GlobalKnowledge has new types
SELECT DISTINCT type FROM "GlobalKnowledge";

-- Should include: synthesized_response, past_synthesis, obvious_field

-- Check ApplicationContext has new fields
\d "ApplicationContext"

-- Should include: source, styleUsed
```

**Expected Results:**
- ✅ PersonaProfile table exists with columns: id, userId, status, progress, writingStyle, keyFacts, quickFacts
- ✅ GlobalKnowledge.type includes: synthesized_response, past_synthesis
- ✅ GlobalKnowledge.metadata column exists
- ✅ ApplicationContext.source exists (default: "chat")
- ✅ ApplicationContext.styleUsed exists (JSON, nullable)

### 1.2 Data Migration Verification

```bash
# Check if migration ran successfully
npm run db:push

# Verify no errors
```

---

## Phase 2: Persona Profile Generation Tests

### 2.1 Manual Essay Upload Test

**Steps:**
1. Navigate to `/essays/upload`
2. Upload a test essay (PDF/DOCX/TXT)
3. Set "Was Awarded" checkbox appropriately
4. Click "Upload Essay"

**Expected Results:**
- ✅ Essay uploads successfully
- ✅ Fact extraction runs in background
- ✅ Persona generation starts in background
- ✅ Console logs: "Persona generation started for user..."

### 2.2 Persona Generation Progress

**Steps:**
1. After uploading essay, check browser console
2. Wait 30-60 seconds
3. Check PersonaProfile table

```sql
SELECT status, progress, "sourceEssayCount", "totalWords"
FROM "PersonaProfile"
WHERE "userId" = 'your_user_id';
```

**Expected Results:**
- ✅ Status changes: generating → ready
- ✅ Progress updates: 10% → 30% → 90% → 100%
- ✅ sourceEssayCount ≥ 3
- ✅ totalWords reflects total essay content

### 2.3 Progress API Endpoint

**Steps:**
1. Open browser DevTools
2. Run in console:
   ```javascript
   fetch('https://localhost:3443/api/persona/progress', {
     headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
   }).then(r => r.json()).then(console.log)
   ```

**Expected Results:**
- ✅ Returns: `{ status, progress, startedAt, completedAt, errorMessage }`
- ✅ Status is one of: not_started, generating, ready, failed

### 2.4 Minimum Essay Count Validation

**Steps:**
1. Create new user with no essays
2. Try to generate persona via API

**Expected Results:**
- ✅ Returns error: "Insufficient essays (found X, minimum 3 required)"
- ✅ Status set to "failed" with error message

---

## Phase 3: Synthesis Engine Tests

### 3.1 Prompt Classification

**Steps:**
1. Open browser console
2. Test classification:
   ```javascript
   fetch('https://localhost:3443/api/synthesize', {
     method: 'POST',
     headers: {
       'Authorization': 'Bearer YOUR_TOKEN',
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       fieldId: 'test_career',
       fieldLabel: 'Career Goals',
       essayPrompt: 'Describe your career aspirations and how this scholarship will help you achieve them.',
       scholarshipTitle: 'Test Scholarship'
     })
   }).then(r => r.json()).then(console.log)
   ```

**Expected Results:**
- ✅ Returns promptType: "career" (or similar)
- ✅ Returns confidence score (0-1)
- ✅ Returns synthesized content
- ✅ Returns sources array with citations

### 3.2 Synthesis Generation

**Steps:**
1. Ensure persona profile is ready
2. Visit `/demo` page
3. Find an essay field with sparkle icon
4. Click the sparkle icon
5. Wait for synthesis to complete

**Expected Results:**
- ✅ Modal opens with essay options
- ✅ Synthesis generates in user's voice
- ✅ Response cites past essays with [1], [2] notation
- ✅ Word count is reasonable (200-500 words)
- ✅ Content is original (not copy-pasted)

### 3.3 Style Override Regeneration

**Steps:**
1. Generate initial synthesis
2. Click ⚙️ settings button
3. Adjust style (e.g., change tone to "formal")
4. Click "Apply & Regenerate"

**Expected Results:**
- ✅ Old synthesis moves to history
- ✅ New synthesis reflects style change
- ✅ Response feels more formal
- ✅ Metadata shows `overrides: true`

### 3.4 Vector Search Integration

**Steps:**
1. Check synthesis sources
2. Verify they come from user's essays

**Expected Results:**
- ✅ Sources reference actual user essays
- ✅ Awarded essays prioritized
- ✅ Similarity scores are relevant (>0.3)

---

## Phase 4: History API Tests

### 4.1 Field History Endpoint

**Steps:**
1. Open browser console
2. Fetch history for a field:
   ```javascript
   fetch('https://localhost:3443/api/history/career_aspirations', {
     headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
   }).then(r => r.json()).then(console.log)
   ```

**Expected Results:**
- ✅ Returns: `{ fieldId, fieldLabel, panels, hasContent }`
- ✅ Panels: `{ synthesized, lastYear, older }`
- ✅ Each panel has content, sources, styleUsed

### 4.2 History with No Content

**Steps:**
1. Fetch history for new field
2. Verify response structure

**Expected Results:**
- ✅ `hasContent: false`
- ✅ Panels may be empty arrays
- ✅ No errors thrown

### 4.3 Accept Endpoint

**Steps:**
1. Generate synthesis for a field
2. Call accept API:
   ```javascript
   fetch('https://localhost:3443/api/history/accept', {
     method: 'POST',
     headers: {
       'Authorization': 'Bearer YOUR_TOKEN',
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       synthesisId: 'SYNTHESIS_ID',
       fieldId: 'career_aspirations',
       scholarshipId: 'SCHOLARSHIP_ID'
     })
   }).then(r => r.json()).then(console.log)
   ```

**Expected Results:**
- ✅ Returns: `{ success: true, fieldMapping, synthesis }`
- ✅ FieldMapping.approvedValue is set
- ✅ FieldMapping.approved is true
- ✅ ApplicationContext created/updated

---

## Phase 5: Extension UI Tests

### 5.1 History Modal Rendering

**Steps:**
1. Load extension
2. Navigate to scholarship page
3. Click 📋 history button on any field

**Expected Results:**
- ✅ Modal opens with three panels
- ✅ Synthesized panel: "✨ AI Response"
- ✅ Last Year panel: "📅 Last Year"
- ✅ Older panel: "📚 Older"
- ✅ Close button (×) works
- ✅ Click outside modal closes it

### 5.2 Style Settings Modal

**Steps:**
1. Open history modal
2. Click ⚙️ settings button

**Expected Results:**
- ✅ Style settings modal opens
- ✅ Tone radio options: inspirational, pragmatic, personal, formal, conversational
- ✅ Voice radio options: first-person narrative, confident, humble, enthusiastic
- ✅ Complexity slider: 1-10
- ✅ Focus radio options: story-driven, achievement-oriented, community-focused, academic
- ✅ "Apply & Regenerate" button works
- ✅ "Cancel" button works

### 5.3 Progress Banner

**Steps:**
1. Log in as user with no persona profile
2. Navigate to scholarship page
3. Wait for banner to appear

**Expected Results:**
- ✅ Banner appears at bottom of screen
- ✅ Purple gradient background
- ✅ Title: "✨ Building Your Writing Profile"
- ✅ Progress bar fills from 0% to 100%
- ✅ Percentage updates
- ✅ "Skip to Chat" link works
- ✅ Close button (×) works
- ✅ Banner dismisses when profile is ready

---

## Phase 6: Integration Tests

### 6.1 History Button Display

**Steps:**
1. Load extension on any page
2. Wait for sparkles to appear
3. Check for history buttons

**Expected Results:**
- ✅ 📋 button appears next to each ✨ sparkle
- ✅ History button has opacity 0.6
- ✅ Hover: opacity 1, scale(1.1)
- ✅ Click opens history modal

### 6.2 Autofill Flow

**Steps:**
1. Generate synthesis for a field
2. Click "✓ Use This" button
3. Check field value

**Expected Results:**
- ✅ Field is filled with synthesized response
- ✅ Sparkle turns gray (filled state)
- ✅ Burst animation appears at sparkle location
- ✅ 12 particles animate outward
- ✅ Particles disappear after 0.6s

### 6.3 Module Loading

**Steps:**
1. Open browser console
2. Check for module load messages

**Expected Results:**
- ✅ Console: "[Synthesis Integration] Loaded: history-modal.js"
- ✅ Console: "[Synthesis Integration] Loaded: style-settings.js"
- ✅ Console: "[Synthesis Integration] Loaded: progress-banner.js"
- ✅ Console: "[Synthesis Integration] All modules loaded"
- ✅ `window.HistoryModal` exists
- ✅ `window.StyleSettingsModal` exists
- ✅ `window.ProgressBanner` exists
- ✅ `window.SynthesisIntegration` exists

### 6.4 API Integration

**Steps:**
1. Open DevTools Network tab
2. Trigger various actions
3. Check API calls

**Expected Results:**
- ✅ GET `/api/persona/progress` called on page load
- ✅ GET `/api/history/:fieldId` called when history button clicked
- ✅ POST `/api/history/accept` called when accepting synthesis
- ✅ POST `/api/synthesize/regenerate` called when applying style changes
- ✅ All calls include `Authorization: Bearer TOKEN` header

---

## End-to-End Test Scenarios

### Scenario 1: New User Onboarding

**Steps:**
1. Create new account
2. Upload first essay
3. Check persona generation status
4. Upload second essay
5. Upload third essay
6. Wait for persona generation
7. Visit scholarship application
8. Generate first synthesis

**Expected Results:**
- ✅ First 2 uploads: "Building your profile..." message
- ✅ Third upload triggers persona generation
- ✅ Progress banner shows 0% → 100%
- ✅ Banner dismisses when ready
- ✅ Can generate synthesis after profile ready

### Scenario 2: Awarded Essay Priority

**Steps:**
1. Upload 3+ essays
2. Mark some as "awarded"
3. Generate persona
4. Check persona sources

**Expected Results:**
- ✅ Awarded essays prioritized in sampling
- ✅ ~75% awarded, ~25% others in sample
- ✅ Synthesis uses awarded content preferentially

### Scenario 3: Style Iteration

**Steps:**
1. Generate initial synthesis
2. Note the tone and voice
3. Open style settings
4. Change tone: conversational → formal
5. Change complexity: 5 → 8
6. Apply & regenerate
7. Compare responses

**Expected Results:**
- ✅ New response feels more formal
- ✅ New response uses more sophisticated vocabulary
- ✅ Old response in "Last Year" panel
- ✅ Both responses accessible in history

### Scenario 4: Word Limit Handling

**Steps:**
1. Find field with word limit (e.g., "500 words max")
2. Generate synthesis
3. Check word count

**Expected Results:**
- ✅ Response under or near word limit
- ✅ If over, response trimmed or regenerated
- ✅ Word count displayed in metadata

### Scenario 5: Error Recovery

**Steps:**
1. Try to generate with no essays
2. Try to generate with < 3 essays
3. Try to accept with invalid synthesis ID

**Expected Results:**
- ✅ Helpful error messages
- ✅ No crashes or console errors
- ✅ User can recover by uploading more essays

---

## Regression Tests

### Existing Feature Verification

Ensure existing features still work:

- ✅ Chat still works (not synthesis)
- ✅ Obvious field autofill (first name, email, etc.)
- ✅ Sparkle icon states (empty → ready → filled)
- ✅ Conversation modal
- ✅ Field extraction
- ✅ Vector search for chat

---

## Performance Tests

### Response Times

| Operation | Target | Actual |
|-----------|--------|--------|
| Persona generation | < 60s | ___ |
| Synthesis generation | < 30s | ___ |
| History API call | < 1s | ___ |
| Accept API call | < 500ms | ___ |
| Progress poll | < 200ms | ___ |

### Database Queries

```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM "PersonaProfile"
WHERE "userId" = 'test_user_id';

EXPLAIN ANALYZE
SELECT * FROM "GlobalKnowledge"
WHERE "userId" = 'test_user_id'
  AND type = 'synthesized_response'
ORDER BY "createdAt" DESC
LIMIT 50;
```

---

## Browser Compatibility

### Tested Browsers

- ✅ Chrome 120+ (primary target)
- ⏳ Edge 120+ (Chromium-based)
- ⏳ Firefox 120+ (needs testing)
- ⏳ Safari 17+ (needs testing)

---

## Test Data Setup

### Sample Essays for Testing

Create test essays with different characteristics:

1. **Career-focused essay** (awarded: true)
2. **Community service essay** (awarded: false)
3. **Academic interest essay** (awarded: true)
4. **Leadership experience essay** (awarded: false)
5. **Personal challenge essay** (awarded: true)

### Sample Scholarship Application

Use `/demo` page for testing which includes:
- 21 fields with sparkle icons
- Mix of field types (text, textarea, select)
- Essay prompts with various word limits

---

## Test Checklist Summary

### Phase 1: Data Model
- [ ] PersonaProfile table exists
- [ ] GlobalKnowledge has new types
- [ ] ApplicationContext has new fields

### Phase 2: Persona Generation
- [ ] Essay upload triggers generation
- [ ] Progress updates correctly
- [ ] Minimum 3 essays enforced
- [ ] Persona writes to database

### Phase 3: Synthesis Engine
- [ ] Prompt classification works
- [ ] Synthesis generates content
- [ ] Style overrides work
- [ ] Sources are cited correctly

### Phase 4: History API
- [ ] GET /api/history/:fieldId works
- [ ] POST /api/history/accept works
- [ ] FieldMapping updates correctly
- [ ] ApplicationContext updates correctly

### Phase 5: Extension UI
- [ ] History modal renders correctly
- [ ] Style settings modal works
- [ ] Progress banner shows/hides
- [ ] All buttons responsive

### Phase 6: Integration
- [ ] History buttons appear next to sparkles
- [ ] Autofill works correctly
- [ ] Burst animation shows
- [ ] API calls authenticated

### End-to-End
- [ ] New user can complete full flow
- [ ] Existing user can generate synthesis
- [ ] Style iteration works
- [ ] Error handling graceful

---

## Bug Reporting Template

If you find issues, report with:

```
**Phase:** X.X
**Scenario:** Steps to reproduce
**Expected:** What should happen
**Actual:** What actually happened
**Browser:** Chrome version
**Console Errors:** Copy from DevTools Console
**Network Tab:** Failed API calls (status, response)
**User ID:** From database
**Reproducibility:** Always / Sometimes / Once
```

---

## Test Execution Log

Use this table to track testing progress:

| Date | Tester | Phase | Result | Notes |
|------|--------|-------|--------|-------|
| 2026-02-02 | ___ | 1 | ⏳ | Pending |
| 2026-02-02 | ___ | 2 | ⏳ | Pending |
| 2026-02-02 | ___ | 3 | ⏳ | Pending |
| 2026-02-02 | ___ | 4 | ⏳ | Pending |
| 2026-02-02 | ___ | 5 | ⏳ | Pending |
| 2026-02-02 | ___ | 6 | ⏳ | Pending |
| 2026-02-02 | ___ | E2E | ⏳ | Pending |

---

## Sign-Off Criteria

Feature is ready for production when:

- ✅ All 6 phases pass manual tests
- ✅ All end-to-end scenarios pass
- ✅ No critical bugs found
- ✅ Performance targets met
- ✅ Error handling graceful
- ✅ Documentation complete

---

## Resume

To continue this workflow later:
```
/build resume thoughts/shared/handoffs/build-20260202-synthesized-essay/
```
