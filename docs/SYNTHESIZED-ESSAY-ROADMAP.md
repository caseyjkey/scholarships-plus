# Section 8: Implementation Roadmap

## Overview

**Estimated Total Time:** 20-30 hours
**Recommended Order:** Backend foundations → Core synthesis → UI overlay

---

## Phase 1: Data Model & Infrastructure (~4-6 hours)

### Task 1.1: Add PersonaProfile Table
- [ ] Add `PersonaProfile` model to Prisma schema
- [ ] Run `prisma migrate dev`
- [ ] Add indexes for efficient queries

### Task 1.2: Extend Existing Models
- [ ] Add `synthesized_response` to GlobalKnowledge type enum
- [ ] Add `source` field to ApplicationContext (chat/synthesized/imported)
- [ ] Add `styleUsed` JSON field to ApplicationContext
- [ ] Add `metadata` JSON field to GlobalKnowledge for tracking field/scholarship context

### Task 1.3: Create SharedReference Table (future)
- [ ] Add `SharedReference` model to Prisma schema
- [ ] Add vector column for similarity search
- [ ] Run migration

---

## Phase 2: Persona Profile Generation (~4-6 hours)

### Task 2.1: Create Profile Generator Service
- [ ] Create `app/lib/persona-generation.server.ts`
- [ ] Implement `generatePersonaProfile(userId, essays)`
- [ ] Sample 10-15 representative essays
- [ ] Extract writing style patterns (tone, voice, complexity)
- [ ] Extract key facts from GlobalKnowledge
- [ ] Extract quick facts from verified obvious fields

### Task 2.2: Create Background Job Trigger
- [ ] Create `app/routes/api.persona.generate.tsx`
- [ ] POST endpoint to trigger profile generation
- [ ] Set status to "generating" with progress tracking
- [ ] Queue background job for async processing

### Task 2.3: Create Progress Polling Endpoint
- [ ] Create `app/routes/api.persona.progress.tsx`
- [ ] GET endpoint for progress status
- [ ] Return status, progress percentage, startedAt

### Task 2.4: Trigger on Essay Import
- [ ] Modify `app/routes/essays.upload.tsx`
- [ ] After successful import, trigger persona generation
- [ ] Show user "Building your profile..." message

---

## Phase 3: Synthesis Engine (~6-8 hours)

### Task 3.1: Create Synthesis Service
- [ ] Create `app/lib/synthesis.server.ts`
- [ ] Implement `generateSynthesis(request)` function
- [ ] Load PersonaProfile for user
- [ ] Vector search top 5-10 relevant experiences
- [ ] Determine prompt type (career, academic, leadership, etc.)
- [ ] Select appropriate writing style from examples
- [ ] Generate synthesis via LLM with persona + retrieved experiences
- [ ] Return response with source citations

### Task 3.2: Create Synthesis API Endpoint
- [ ] Create `app/routes/api.synthesize.tsx`
- [ ] POST endpoint accepting fieldLabel, essayPrompt, scholarshipTitle, wordLimit
- [ ] Check persona profile readiness (return 202 if not ready)
- [ ] Call synthesis service
- [ ] Save synthesized response to GlobalKnowledge
- [ ] Find past responses for history panel
- [ ] Return synthesized + sources + pastResponses

### Task 3.3: Create Regenerate Endpoint
- [ ] Create `app/routes/api.synthesize.regenerate.tsx`
- [ ] POST endpoint for style overrides
- [ ] Move old version to "past_synthesis" type
- [ ] Generate new response with style overrides
- [ ] Save as new "synthesized_response"
- [ ] Return new response

### Task 3.4: Prompt Type Classifier
- [ ] Create `app/lib/prompt-classifier.server.ts`
- [ ] Classify prompts into types (career, academic, leadership, personal, etc.)
- [ ] Use GPT-4o-mini for classification
- [ ] Cache results for similar prompts

---

## Phase 4: History API (~2-3 hours)

### Task 4.1: Create History Endpoint
- [ ] Create `app/routes/api.history.$fieldId.tsx`
- [ ] GET endpoint for field history
- [ ] Fetch current synthesized response
- [ ] Fetch past responses (essays, past_synthesis)
- [ ] Group by year (last year vs older)
- [ ] Return structured history data

### Task 4.2: Accept Endpoint
- [ ] Create `app/routes/api.history.accept.tsx`
- [ ] POST endpoint to accept synthesized response
- [ ] Autofill field value
- [ ] Save to ApplicationContext (verified: true)
- [ ] Trigger burst animation (extension-side)
- [ ] Return success

---

## Phase 5: Extension UI (~4-6 hours)

### Task 5.1: History Button
- [ ] Add history button icon (📋) next to sparkle on each field
- [ ] Position consistent with existing sparkle placement
- [ ] Show only when field is detected

### Task 5.2: History Modal
- [ ] Create `chrome-extension/history-modal.js`
- [ ] Three-panel layout: Synthesized | Last Year | Older
- [ ] Accept button (big green) on synthesized panel
- [ ] Style settings button (⚙️) on synthesized panel
- [ ] Close button (×) in modal header
- [ ] Responsive sizing

### Task 5.3: Style Settings Modal
- [ ] Create `chrome-extension/style-settings.js`
- [ ] Controls: Tone (radio), Voice (radio), Complexity (slider 1-10), Focus (radio)
- [ ] "Apply & Regenerate" button
- [ ] "Cancel" button
- [ ] Save preferences to user profile

### Task 5.4: Progress Banner
- [ ] Create `chrome-extension/progress-banner.js`
- [ ] Show when persona profile not ready
- [ ] Display progress bar and estimated time
- [ ] "Skip to Chat" option
- [ ] Auto-refresh when complete
- [ ] Dismissible (×)

### Task 5.5: History Button Integration
- [ ] Wire history button click to API
- [ ] Load history data from `/api/history/:fieldId`
- [ ] Display modal with fetched data
- [ ] Handle "no past responses" case
- [ ] Handle "profile not ready" case with banner

### Task 5.6: Accept Action
- [ ] Wire Accept button to `/api/history/accept`
- [ ] Autofill field with synthesized response
- [ ] Turn sparkle grey (field filled)
- [ ] Close modal
- [ ] Trigger burst animation

---

## Phase 6: Integration & Polish (~2-4 hours)

### Task 6.1: Preprocessing Integration
- [ ] Modify preprocessing to include synthesis generation
- [ ] Generate synthesized responses for all essay fields
- [ ] Cache results for instant display
- [ ] Turn sparkles gold when ready

### Task 6.2: Chat Integration
- [ ] When user refines via chat and accepts proposal:
  - [ ] Move old synthesized to history
  - [ ] Save new proposal as current synthesized
  - [ ] Update knowledge base if new facts learned

### Task 6.3: Error Handling
- [ ] Handle synthesis failures gracefully
- [ ] Retry logic (up to 3 times)
- [ ] Fallback to chat-only mode
- [ ] Show user-friendly error messages

### Task 6.4: Word Limit Handling
- [ ] Detect word limit from field
- [ ] Pass to synthesis service
- [ ] Auto-regenerate if exceeded
- [ ] Or intelligently trim with warning

### Task 6.5: Edge Cases
- [ ] No past essays → helpful upload message
- [ ] No persona profile → show progress banner
- [ ] Conflicting facts → use verified priority
- [ ] Award badges for winning applications

---

## Phase 7: Testing & QA (~2-3 hours)

### Task 7.1: Unit Tests
- [ ] Test persona profile generation
- [ ] Test synthesis engine
- [ ] Test prompt classifier
- [ ] Test vector search integration

### Task 7.2: Integration Tests
- [ ] Test full synthesis flow
- [ ] Test history API endpoints
- [ ] Test regenerate with style overrides
- [ ] Test accept action

### Task 7.3: Manual Testing Checklist
- [ ] Import essays → profile generates in background
- [ ] Visit application → banner shows if profile not ready
- [ ] History button opens → shows synthesized + past responses
- [ ] Accept synthesized → autofills field, sparkle turns grey
- [ ] Click ⚙️ → style settings appear
- [ ] Adjust style → response regenerates
- [ ] Old version moves to sidebar
- [ ] Word limit exceeded → response trimmed or regenerated
- [ ] No past essays → helpful upload message shown

---

## Phase 8: Future Enhancements (Optional)

### Task 8.1: Shared Reference Pool
- [ ] Create opt-in settings UI
- [ ] Extract patterns from award-winning apps
- [ ] Implement similarity search for shared references
- [ ] Use as guidance for other users' agents

### Task 8.2: Vector Database Improvements
- [ ] Index all past responses for similarity search
- [ ] Present top suggestions as clickable options
- [ ] User can tap suggestion → AI makes proposal

### Task 8.3: Iterative Refinement
- [ ] "Make it more professional" → refine proposal
- [ ] "Add leadership experience" → integrate new angle
- [ ] Maintain conversation context across refinements

---

## Dependencies & Prerequisites

- [ ] Existing knowledge base infrastructure (GlobalKnowledge)
- [ ] Existing vector search capability (app/lib/rag.server.ts)
- [ ] Existing AI chat infrastructure
- [ ] Existing field detection and preprocessing
- [ ] Prisma ORM set up
- [ ] Chrome extension content script infrastructure

---

## Success Criteria

- [ ] Persona profiles generate successfully from essay import
- [ ] Synthesized responses are high-quality and in user's voice
- [ ] History modal displays correctly with all three panels
- [ ] Style overrides work and regenerate responses
- [ ] Accept action autofills fields correctly
- [ ] Progress banner shows when profile not ready
- [ ] Errors are handled gracefully with helpful messages
- [ ] Word limits are respected
- [ ] Award-winning applications are highlighted
- [ ] Performance: synthesis completes in <30 seconds for typical essays
