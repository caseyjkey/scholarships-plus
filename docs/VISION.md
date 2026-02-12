# Scholarships Plus - Vision Document

**Created:** 2026-02-02
**Status:** Active Development
**Version:** 1.0

---

## Vision Overview

Scholarships Plus is an AI-powered scholarship application assistant that helps students reuse and improve their prior applications instead of starting from scratch each year.

---

## The Problem (Your Old Flow)

Last year, you manually:
1. Copied prior year's responses from Google Drive
2. Pasted each response into ChatGPT
3. Explained what changed since the prior submission
4. Iterated to refine the response
5. Repeated for every field, every scholarship

This was tedious and didn't leverage the collective wisdom from all your past applications.

---

## The Solution (Your Vision)

A unified system that:
1. **Imports** all prior applications into a searchable knowledge base
2. **Discovers** scholarships via web scraping with due dates
3. **Autofills** obvious fields (name, email, GPA) using the knowledge base
4. **Generates** essay responses by referencing similar past essays
5. **Refines** responses via chat about what's changed since prior submissions
6. **Archives** completed applications back to Google Drive for future years
7. **Shares** award-winning application patterns (opt-in) to help other users succeed

---

## Core Features

### 1. Knowledge Base & Import
- Upload prior scholarship applications (PDFs, docs)
- Automatic extraction of fields and essays
- Vector similarity search for finding similar past responses
- Verified vs. unverified facts tracking

### 2. Obvious Field Autofill
- Auto-detect form fields on scholarship websites
- Pre-fill with verified facts from knowledge base
- Grey sparkle = already filled
- Gold sparkle = response ready to use

### 3. AI Chat Assistant
- Click grey sparkle → open AI chat
- Discuss what to write for each field
- AI proposes response based on knowledge base
- Accept → autofills field

### 4. Synthesized Essay Generation (Planned)
- **Persona Profile**: Pre-computed writing style and key experiences
- **Synthesis Engine**: Generate original responses combining persona + retrieved experiences
- **History Modal**: Compare synthesized response with past years side-by-side
- **Style Controls**: Adjust tone, voice, complexity via settings (⚙️)

### 5. Shared Reference Pool (Future, Opt-in)
- Users can opt-in to share award-winning application patterns
- Used as reference for other users' agents (not direct sharing)
- Privacy-first: patterns extracted, not raw content

---

## Feature Status & TODO

### ✅ Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Knowledge base import | ✅ Done | `app/routes/essays.upload.tsx` |
| Vector search (RAG) | ✅ Done | `app/lib/rag.server.ts` |
| Obvious field preprocessing | ✅ Done | `app/lib/field-generation.server.ts` |
| Chrome extension field detection | ✅ Done | `chrome-extension/content-v037.js` |
| Sparkle icons on fields | ✅ Done | Grey/gold state indication |
| AI chat for field assistance | ✅ Done | `app/routes/api.extension.chat.tsx` |
| Autofill from chat proposals | ✅ Done | Extension-side integration |
| Demo page | ✅ Done | `/demo` for testing |
| Extension auth | ✅ Done | JWT-based auth |

### 🚧 In Progress

| Feature | Status | Notes |
|---------|--------|-------|
| AI chat agent responsiveness | 🚧 Debugging | Agent not responding correctly |
| Burst animation | 🚧 Fix needed | Animation not triggering |

### 📋 Planned (Synthesized Essay Generation)

| Feature | Phase | Priority |
|---------|-------|----------|
| PersonaProfile table | Phase 1 | High |
| Persona generation service | Phase 2 | High |
| Synthesis engine | Phase 3 | High |
| History modal UI | Phase 5 | High |
| Style settings modal | Phase 5 | Medium |
| Progress banner | Phase 5 | Medium |
| History API endpoints | Phase 4 | High |
| Regenerate with style | Phase 3 | Medium |

### 🔮 Future Enhancements

| Feature | Priority |
|---------|----------|
| Shared reference pool | Low |
| Vector suggestions | Low |
| Iterative refinement | Low |

---

## Implementation Checklist (Synthesized Essay Generation)

### Phase 1: Data Model & Infrastructure (~4-6 hours)

- [ ] Add `PersonaProfile` model to Prisma schema
- [ ] Run `prisma migrate dev`
- [ ] Add indexes for efficient queries
- [ ] Add `synthesized_response` to GlobalKnowledge type enum
- [ ] Add `source` field to ApplicationContext (chat/synthesized/imported)
- [ ] Add `styleUsed` JSON field to ApplicationContext
- [ ] Add `metadata` JSON field to GlobalKnowledge
- [ ] Add `SharedReference` model (future)

### Phase 2: Persona Profile Generation (~4-6 hours)

- [ ] Create `app/lib/persona-generation.server.ts`
- [ ] Implement `generatePersonaProfile(userId, essays)`
- [ ] Sample 10-15 representative essays
- [ ] Extract writing style patterns (tone, voice, complexity)
- [ ] Extract key facts from GlobalKnowledge
- [ ] Extract quick facts from verified obvious fields
- [ ] Create `app/routes/api.persona.generate.tsx`
- [ ] Create `app/routes/api.persona.progress.tsx`
- [ ] Modify `app/routes/essays.upload.tsx` to trigger generation

### Phase 3: Synthesis Engine (~6-8 hours)

- [ ] Create `app/lib/synthesis.server.ts`
- [ ] Implement `generateSynthesis(request)` function
- [ ] Create `app/routes/api.synthesize.tsx`
- [ ] Create `app/routes/api.synthesize.regenerate.tsx`
- [ ] Create `app/lib/prompt-classifier.server.ts`

### Phase 4: History API (~2-3 hours)

- [ ] Create `app/routes/api.history.$fieldId.tsx`
- [ ] Create `app/routes/api.history.accept.tsx`

### Phase 5: Extension UI (~4-6 hours)

- [ ] Add history button icon (📋) next to sparkle
- [ ] Create `chrome-extension/history-modal.js`
- [ ] Create `chrome-extension/style-settings.js`
- [ ] Create `chrome-extension/progress-banner.js`
- [ ] Wire history button to API
- [ ] Implement accept action

### Phase 6: Integration & Polish (~2-4 hours)

- [ ] Integrate synthesis into preprocessing
- [ ] Integrate chat refinement with history
- [ ] Add error handling and retry logic
- [ ] Implement word limit handling
- [ ] Handle edge cases

### Phase 7: Testing & QA (~2-3 hours)

- [ ] Write unit tests for persona generation
- [ ] Write unit tests for synthesis engine
- [ ] Write integration tests for API endpoints
- [ ] Manual testing checklist

---

## Technical Stack

### Backend
- **Framework**: Remix (Node.js/TypeScript)
- **Database**: PostgreSQL + Prisma ORM
- **Vector Search**: Custom RAG implementation
- **AI**: OpenAI API (GPT-4o-mini, GPT-5-nano planned)

### Frontend
- **Framework**: Remix + React
- **Styling**: Tailwind CSS
- **Icons**: Unicode emojis

### Chrome Extension
- **Manifest V3**
- **Content Script**: Field detection and UI injection
- **Background Script**: Auth state management
- **Messaging**: Chrome runtime messaging API

---

## Development Priorities

### Immediate (This Week)
1. Fix AI chat agent responsiveness
2. Fix burst animation
3. Add more essay sections to demo page
4. Document current implementation status

### Short-term (Next 2 Weeks)
1. Begin Phase 1: Data Model & Infrastructure
2. Create PersonaProfile table
3. Set up synthesis API endpoints

### Medium-term (Next Month)
1. Complete synthesis engine
2. Build history modal UI
3. Integrate with preprocessing

### Long-term (Next Quarter)
1. Style settings modal
2. Shared reference pool
3. Iterative refinement

---

## Success Metrics

### User Experience
- [ ] < 30 seconds to generate synthesized essay
- [ ] < 5 seconds to autofill obvious field
- [ ] < 10 seconds to load history modal
- [ ] 95%+ satisfaction with generated responses

### Technical
- [ ] < 1 second vector search response
- [ ] < 5 second API response for chat
- [ ] 99.9% uptime for API endpoints
- [ ] Zero data loss for knowledge base

### Business
- [ ] Users save 2+ hours per application
- [ ] 50%+ increase in applications submitted
- [ ] Positive feedback on AI suggestions

---

## Open Questions

1. **Cost**: GPT-5-nano pricing per generation?
2. **Privacy**: How to anonymize shared references?
3. **Quality**: How to measure synthesized response quality?
4. **Storage**: Where to store completed applications?

---

## Related Documents

- [Implementation Roadmap](./SYNTHESIZED-ESSAY-ROADMAP.md)
- [Synthesized Essay Genesis](./SYNTHESIZED-ESSAY-GENESIS.md)
- [Knowledge Base Architecture](./KNOWLEDGE-BASE-LEARNING-ARCHITECTURE.md)
- [Learning System Summary](./LEARNING-SYSTEM-SUMMARY.md)
- [Chrome Extension Testing Guide](./extension-testing-guide.md)
