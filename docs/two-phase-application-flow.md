# Two-Phase Application Flow Architecture

## Overview

Browser-use agents cannot easily interact with students in real-time during execution. Instead of trying to make the agent pause to ask questions, we use a **two-phase approach**:

1. **Phase 1: Question Discovery & Answer Preparation** - Student prepares all answers beforehand
2. **Phase 2: Automated Submission** - Agent fills and submits using prepared answers

## Why This Approach?

### Problem: Interactive Agents
Browser-use agents execute autonomously:
- They don't support pausing mid-task to ask questions
- Implementing bidirectional communication would require complex WebSocket infrastructure
- State management becomes fragile and error-prone

### Solution: Two-Phase Flow
By separating preparation from submission:
- Student sees all questions upfront
- RAG suggests answers from their profile
- Student reviews and edits each answer
- Agent simply fills pre-approved answers (no human interaction needed)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 1: PREPARE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Admin runs detailed scraper                                            │
│     ├── Captures all application questions                                 │
│     ├── Extracts requirements (GPA, enrollment, etc.)                      │
│     ├── Gets dropdown options, word limits, etc.                           │
│     └── Saves to ScrapedScholarship.applicationSections                    │
│                                                                             │
│  2. Student views scholarship application                                  │
│     ├── Sees all questions organized by section                            │
│     ├── RAG suggests answers from their profile                            │
│     ├── Reviews and edits each answer                                      │
│     └── Saves prepared answers to Application.answers                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PHASE 2: SUBMIT                                   │
├─────────────────────────────────────────────────────────────────────────────┤
                                                                             │
│  3. Student clicks "Submit Application"                                    │
│     ├── Backend loads student's PortalSession                              │
│     ├── Backend loads prepared Application.answers                        │
│     └── Spawns browser-use agent with prepared data                        │
│                                                                             │
│  4. Agent executes (autonomous, no student interaction)                    │
│     ├── Loads OASIS session from database                                  │
│     ├── Navigates to application                                           │
│     ├── Fills each field with prepared answer                             │
│     ├── Uploads documents from answers                                     │
│     └── Submits application                                                │
│                                                                             │
│  5. Backend updates Application.status = "submitted"                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Models

### ScrapedScholarship
```typescript
{
  id: string,
  title: string,
  description: string,
  requirements: {
    gpa_min: number,
    enrollment_status: string,
    class_level: string[],
    tribal_enrollment_required: boolean,
    referral_count: number,
    transcript_required: boolean,
    essay_required: boolean,
    // ...
  },
  // NEW: Application questions captured during scrape
  applicationSections: [
    {
      name: "Personal Information",
      questions: [
        {
          id: "first_name",
          label: "First Name",
          type: "text",
          required: true,
          options: null
        },
        {
          id: "state",
          label: "State of Residence",
          type: "dropdown",
          required: true,
          options: ["Arizona", "New Mexico", ...]
        },
        {
          id: "essay_career",
          label: "Describe your career goals...",
          type: "textarea",
          required: true,
          word_limit: 500
        }
      ]
    },
    {
      name: "Academic Information",
      questions: [...]
    },
    {
      name: "Essays",
      questions: [...]
    }
  ]
}
```

### Application (Student's Prepared Answers)
```typescript
{
  id: string,
  userId: string,
  scrapedScholarshipId: string,
  status: "draft" | "prepared" | "submitting" | "submitted" | "error",
  answers: {
    // Prepared answers organized by question ID
    first_name: "John",
    email: "john@example.com",
    state: "Arizona",
    gpa: "3.8",
    major: "Computer Science",
    essay_career: "I plan to pursue a career in software development...",
    // File uploads are references to Google Drive
    transcript_file_id: "1a2b3c4d...",
    // ...
  },
  submittedAt: DateTime | null,
  submittedBy: "agent" | "manual",
  error: string | null
}
```

## Implementation Components

### 1. Detailed Scraper (`scripts/scrape-oasis-detailed.py`)

**Purpose**: Capture ALL application questions from OASIS portal

**Input**: Saved OASIS session ID

**Output**: JSON with application sections and questions

**Key Features**:
- Navigates through ALL application sections
- Extracts every question/field
- Captures dropdown options exactly as listed
- Notes word/character limits
- Marks required vs optional fields

```bash
# Scrape all scholarships with questions
python3 scripts/scrape-oasis-detailed.py \
  --session-id SESSION_ID \
  --output data/aises_cobell/detailed_with_questions.json

# Scrape single scholarship
python3 scripts/scrape-oasis-detailed.py \
  --session-id SESSION_ID \
  --scholarship "Cobell Undergraduate Scholarship" \
  --output data/aises_cobell/cobell_undergraduate.json
```

### 2. Import Script (`scripts/import-aises-cobell.ts`)

**Purpose**: Import scraped data with questions to database

**Input**: JSON files from scraper

**Output**: Database records in ScrapedScholarship table

**Key Features**:
- Handles old format (no questions) and new format
- Stores application_sections in JSON field
- Upserts by sourceUrl (updates existing if re-scraped)

```bash
npx tsx scripts/import-aises-cobell.ts
```

### 3. Application Preparation UI (NEW - To Build)

**Route**: `/scholarships/:id/prepare` or integrated into scholarship detail page

**Purpose**: Let students prepare answers before submission

**Features**:
- Display all questions organized by section
- Show which are required vs optional
- RAG suggests answers from student profile
- Student edits each answer
- Save draft/continue later
- Validate before allowing submission
- Show preview of all answers

**UI Components**:
- `<ApplicationQuestionList>` - Lists all questions by section
- `<ApplicationQuestionEditor>` - Single question editor with RAG suggestions
- `<ApplicationAnswersPreview>` - Shows all prepared answers before submission
- `<SubmitApplicationButton>` - Triggers Phase 2 (agent submission)

### 4. Agent Submission Script (`scripts/complete-application.py`)

**Purpose**: Fill and submit application using prepared answers

**Input**:
- Session ID (for OASIS login)
- Scholarship title
- Prepared answers JSON

**Output**: Success/error status

**Key Features**:
- Loads session from database
- Loads prepared answers
- Navigates application sections
- Fills each field with prepared answer
- Uploads files (from Google Drive)
- Submits application
- Reports status back to backend

```bash
# This would be called from backend, not directly
python3 scripts/complete-application.py \
  --session-id SESSION_ID \
  --scholarship "Cobell Undergraduate Scholarship" \
  --answers-url https://app.com/api/applications/ID/answers
```

## Backend API Endpoints

### GET /api/scholarships/:id/questions
Return application sections and questions for a scholarship

```typescript
{
  sections: [
    {
      name: "Personal Information",
      questions: [{ id, label, type, required, options, word_limit }]
    }
  ]
}
```

### POST /api/applications/prepare
Save or update prepared answers

```typescript
// Request
{
  scrapedScholarshipId: string,
  answers: {
    first_name: "John",
    email: "john@example.com",
    // ...
  }
}

// Response
{
  applicationId: string,
  status: "prepared"
}
```

### GET /api/applications/:id/answers
Get prepared answers for a student application

```typescript
{
  answers: { /* prepared answers */ },
  ragSuggestions: {
    essay_career: "Based on your profile, you might want to mention...",
    // ...
  }
}
```

### POST /api/applications/:id/submit
Trigger agent submission

```typescript
// Request
{
  applicationId: string
}

// Response
{
  jobId: string,  // ScrapeJob for tracking progress
  status: "queued"
}
```

## User Flow

### For Admin (One-time Setup)
1. Log into OASIS via session capture
2. Run detailed scraper to capture all questions
3. Import to database
4. Verify questions are captured correctly

### For Student (Repeated per Scholarship)
1. Browse scholarships
2. Click "Apply" on a scholarship
3. See application questions organized by section
4. For each question:
   - View RAG suggestion from profile
   - Edit or replace with own answer
   - See validation (required fields, word counts)
5. Review all answers in preview
6. Click "Submit Application"
7. See progress as agent fills form
8. Get notified when submitted

## Error Handling

### Phase 1 Errors
- **Missing questions**: Show message "Questions not yet captured, contact admin"
- **RAG failure**: Allow manual entry without suggestions
- **Validation errors**: Show inline, prevent submission

### Phase 2 Errors
- **Session expired**: Prompt student to reconnect OASIS account
- **Agent timeout**: Retry with exponential backoff
- **Form changed**: Alert admin to re-scrape questions
- **Network error**: Save progress, allow retry

## Security Considerations

1. **Answer storage**: Encrypt sensitive PII in Application.answers
2. **Session isolation**: Each student uses their own OASIS session
3. **File access**: Only access files student has uploaded to Google Drive
4. **Audit logging**: Log all agent actions for troubleshooting

## Next Steps

1. ✅ Update scraper to capture application questions
2. ✅ Add database schema for application_sections
3. ✅ Update import script
4. ⏳ Build application preparation UI
5. ⏳ Update completion script to use prepared answers
6. ⏳ Integrate OASIS session capture into app
7. ⏳ Test end-to-end flow

## Testing

### Manual Testing Flow
```bash
# 1. Extract OASIS session
python3 scripts/extract-oasis-session.py

# 2. Scrape detailed questions (single scholarship)
python3 scripts/scrape-oasis-detailed.py \
  --session-id SESSION_ID \
  --scholarship "Cobell Undergraduate Scholarship" \
  --output test_scholarship.json

# 3. Import to database
npx tsx scripts/import-aises-cobell.ts

# 4. Verify questions in DB
psql -d scholarshipsplus_db -c \
  "SELECT title, application_sections FROM \"ScrapedScholarship\" WHERE title LIKE '%Cobell%';"

# 5. Test application preparation (via UI once built)

# 6. Test agent submission
python3 scripts/complete-application.py \
  --session-id SESSION_ID \
  --scholarship "Cobell Undergraduate Scholarship" \
  --answers test_answers.json
```
