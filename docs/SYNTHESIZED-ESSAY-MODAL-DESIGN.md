# Synthesized Essay History Modal Design

## Overview

The history modal allows students to compare their current AI-synthesized response with past responses from prior applications and previously synthesized responses that were accepted.

## Layout Structure

The modal has a **three-column layout**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Synthesized Response    │   Comparison View   │   Response List    │
│                          │                     │                     │
│  [Synthesized content]   │  [Selected past]    │  - Prior App 1     │
│  with citation¹ symbols  │  response for       │  - Prior App 2     │
│                          │  comparison         │  - Synthesized #1  │
│  Source citations at     │                     │  - Synthesized #2  │
│  bottom of content       │                     │  - ...             │
│                          │                     │                     │
│        ┌─────────┐       │                     │                     │
│        │  ✨     │       │                     │                     │
│        │ Accept  │       │                     │                     │
│        └─────────┘       │                     │                     │
│      (centered)          │                     │                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Left Column: Synthesized Response (60% width)

### Purpose
Shows the current AI-synthesized response that the student can accept.

### Features
- **Content**: The synthesized essay/response for this field
- **Citation Symbols**: Superscript numbers (¹, ², ³) linking to source citations
- **Source Citations**: List at bottom showing which prior response each part came from
- **Accept Button**: Centered at bottom with sparkle icon

### Example
```
First Name Response:
I am passionate about environmental science because
of my volunteer work at local parks¹ and my biology
research on wetland ecosystems². These experiences
taught me that conservation requires both community
action and scientific understanding.

Sources:
¹ "Volunteer at Metro Parks" - Coca-Cola Scholars 2024
² "Wetland Research Project" - AISES 2023

     ┌──────────────────┐
     │  ✨  Accept      │
     └──────────────────┘
```

## Center Column: Comparison View (25% width)

### Purpose
Shows a selected past response for side-by-side comparison with the synthesized version.

### Features
- **Selected from**: The list in the right column
- **Context**: Shows which application/year the response is from
- **Content**: Full text of the selected past response
- **Styling**: Subtly different background to distinguish from synthesized

### Interaction
- Clicking an item in the right column updates this view
- Allows student to see what they said before vs. the new synthesis

## Right Column: Response List (15% width)

### Purpose
Lists all available past responses that can be viewed in the comparison column.

### Response Types

1. **Prior Applications** (labeled with scholarship name and year)
   - Responses from previous scholarship applications
   - Format: `[Scholarship Name] [Year]`

2. **Synthesized History** (labeled as synthesized)
   - Previously synthesized responses that were accepted by the user
   - These become part of the history when the user accepts a new synthesized response
   - Format: `Synthesized #[n]` or by date

### Example List Items
```
📋 Prior Applications:
  • Coca-Cola Scholars 2024
  • AISES 2023
  • Gates Millennium 2022

📋 Synthesized History:
  • Synthesized #1 (Jan 15)
  • Synthesized #2 (Jan 20)
```

### Interaction
- Clicking a list item updates the comparison view (center column)
- Selected item is highlighted
- Scrollable if list is long

## User Flow

### Opening the Modal
1. User clicks history button (📋) next to a sparkle icon
2. Modal opens with:
   - Current synthesized response in left column (fetched from API)
   - Most recent prior application response in center column
   - Full list of available responses in right column

### Comparing Responses
1. User clicks different items in the right column
2. Center column updates to show the selected response
3. User can compare what they said before vs. the new synthesis

### Accepting the Synthesized Response
1. User clicks "✨ Accept" button
2. Synthesized response is:
   - Autofilled into the form field
   - Saved to knowledge base as accepted response
   - Added to synthesized history (will appear in future lists)
3. Modal closes
4. Confetti/sparkle animation plays

### Closing Without Accepting
1. User clicks X in top-right or backdrop
2. Modal closes
3. No changes made

## API Integration

### Endpoints

**GET /api/synthesized/:fieldId**
- Returns current synthesized response for the field
- Includes citations with source IDs

**GET /api/prior-responses/:fieldId**
- Returns list of all prior responses for this field type
- Includes: response ID, scholarship name, year, content

**POST /api/synthesized/:fieldId/accept**
- Accepts the current synthesized response
- Saves to knowledge base
- Adds to synthesized history

### Response Format

```json
{
  "synthesized": {
    "content": "I am passionate about...",
    "citations": [
      { "index": 1, "sourceId": "prior-123", "text": "Volunteer at Metro Parks" },
      { "index": 2, "sourceId": "prior-456", "text": "Wetland Research Project" }
    ]
  },
  "priorResponses": [
    {
      "id": "prior-123",
      "scholarship": "Coca-Cola Scholars",
      "year": "2024",
      "content": "My volunteer work at local parks..."
    },
    {
      "id": "prior-456",
      "scholarship": "AISES",
      "year": "2023",
      "content": "My biology research focused on..."
    }
  ]
}
```

## Visual Design

### Colors
- **Modal Background**: White (#ffffff)
- **Left Column (Synthesized)**: White with blue accent borders
- **Center Column (Comparison)**: Light gray background (#f9fafb)
- **Right Column (List)**: Light gray background (#f9fafb)
- **Accept Button**: Blue gradient (#3b82f6 → #2563eb)

### Typography
- **Headings**: System UI font, 16px, semibold
- **Content**: System UI font, 14px, normal
- **Citations**: Superscript, 12px, blue (#3b82f6)

### Spacing
- **Padding**: 20px between columns
- **Gap**: 16px between sections
- **Button**: 48px width, 44px height

## Accessibility

- Keyboard navigation (Tab, Enter, Escape)
- ARIA labels for all interactive elements
- Focus indicators on all buttons
- Screen reader announcements for modal state changes

## File References

- **Main Integration**: `chrome-extension/synthesis-integration.js`
- **Modal Component**: `chrome-extension/history-modal.js`
- **Styling**: `chrome-extension/sparkle.css`
- **Backend Routes**: `app/routes/api.synthesized.*.tsx`
