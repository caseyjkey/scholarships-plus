# Scholarships Plus - Next Steps for Completion

This document provides detailed guidance for completing the remaining work on the Scholarships Plus implementation.

---

## Immediate Prerequisites (30 minutes)

### 1. Start Database & Apply Migration

```bash
# Check if Postgres container is running
docker ps

# Start if needed
docker start <your-postgres-container-name>

# Verify database is accessible
npx tsx scripts/check-db.ts

# Apply the migration
npx prisma migrate dev --name add-scholarship-rag-schema

# Verify Prisma client is generated
npx prisma generate
```

### 2. Configure API Keys

Get API keys from:
- **GLM 4.7**: https://open.bigmodel.cn/ (Zhipu AI)
- **Pinecone**: https://www.pinecone.io/

Add to `.env`:
```bash
GLM_API_KEY="your_key_here"
PINECONE_API_KEY="your_key_here"
```

### 3. Test Backend

```bash
# Start dev server
npm run dev

# Test health check
curl http://localhost:3000/healthcheck

# Test scholarship browse
curl http://localhost:3000/scholarships
```

---

## Remaining Work: Chat UI Components (4 files, ~3-4 hours)

### File 1: app/components/chat-interface.tsx (90 minutes)

**Purpose:** Main chat UI component with message history, input, and sources sidebar.

**Key Features:**
- Display message history
- Input field with send button
- Agent status indicator
- Sources sidebar showing cited essays
- Auto-scroll to latest message

**Implementation Outline:**

```tsx
import { useState, useRef, useEffect } from "react";
import type { Message } from "~/types/chat";
import { ChatMessage } from "./chat-message";

interface ChatInterfaceProps {
  applicationId: string;
  scholarshipId: string;
}

export function ChatInterface({ applicationId, scholarshipId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          scholarshipId,
          message: input,
          history: messages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Chat request failed");
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content,
        sources: data.sources,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setAgentStatus(data.agentStatus || "");
    } catch (error) {
      console.error("Chat error:", error);
      // Show error message to user
    } finally {
      setIsLoading(false);
    }
  };

  // Render UI with:
  // - Message list area (scrollable)
  // - Input field + Send button
  // - Sources sidebar (for messages with sources)
  // - Agent status indicator

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Chat Main */}
      <div className="lg:col-span-2">
        {/* Messages + Input */}
      </div>

      {/* Sidebar: Agent Status + Sources */}
      <div className="space-y-4">
        {/* Agent status card */}
        {/* Sources list */}
      </div>
    </div>
  );
}
```

**Reference:** See plan at `docs/plans/2025-01-22-scholarships-plus-implementation.md` lines 697-841

---

### File 2: app/components/chat-message.tsx (45 minutes)

**Purpose:** Render individual chat messages with citation badges.

**Key Features:**
- Different styling for user vs assistant
- Parse citation markers ([1], [2], etc.) from content
- Render CitationBadge for each citation
- Show timestamp

**Implementation Outline:**

```tsx
import type { Message } from "~/types/chat";
import { CitationBadge } from "./citation-badge";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Parse content for citations like [1], [2]
  const parts = message.content.split(/\[(\d+)\]/);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
        isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
      }`}>
        {/* Render content with citation badges */}
        <div className="prose prose-sm">
          {parts.map((part, i) => {
            if (i % 2 === 1) {
              // This is a citation number
              const sourceIndex = parseInt(part) - 1;
              return (
                <CitationBadge
                  key={i}
                  number={part}
                  source={message.sources?.[sourceIndex]}
                />
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </div>

        {/* Timestamp */}
        <div className={`text-xs mt-1 ${isUser ? "text-blue-100" : "text-gray-500"}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
```

**Reference:** Plan lines 844-902

---

### File 3: app/components/citation-badge.tsx (30 minutes)

**Purpose:** Hover tooltip showing source details for citations.

**Key Features:**
- Superscript number badge
- Hover tooltip with:
  - Source type icon (📄 for essay, 💬 for conversation)
  - Source title
  - Content excerpt
  - Awarded status (if applicable)
  - Relevance score
  - "View full →" link

**Implementation Outline:**

```tsx
import { useState } from "react";
import type { Source } from "~/types/chat";

interface CitationBadgeProps {
  number: string;
  source: Source;
}

export function CitationBadge({ number, source }: CitationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span className="relative">
      <sup
        className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold
                   text-blue-500 bg-blue-100 rounded-full cursor-pointer
                   hover:bg-blue-200 transition-colors"
        onClick={() => setShowTooltip(!showTooltip)}
      >
        {number}
      </sup>

      {showTooltip && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowTooltip(false)}
          />

          {/* Tooltip */}
          <div className="absolute z-20 bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border p-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">
                {source.type === "essay" ? "📄" : "💬"}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm">{source.title}</h4>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {source.excerpt}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs">
                  {source.awarded && (
                    <span className="text-yellow-600">🏆 Awarded</span>
                  )}
                  <span className="text-gray-500">
                    {source.relevance}% match
                  </span>
                </div>
                <a
                  href={`/essays/${source.id}`}
                  className="block mt-2 text-blue-500 hover:underline text-xs"
                >
                  View full →
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
```

**Reference:** Plan lines 904-971

---

### File 4: app/components/essay-lightbox.tsx (45 minutes)

**Purpose:** Modal overlay for viewing full essay content.

**Key Features:**
- Full-screen modal overlay
- Essay content display
- Close button (✕)
- Close on Escape key
- Prevent body scroll when open
- Navigate back when closed

**Implementation Outline:**

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface EssayLightboxProps {
  essayId: string;
}

export function EssayLightbox({ essayId }: EssayLightboxProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        navigate("../");
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">Essay View</h2>
          <button onClick={() => navigate("../")}>✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Load and display essay content */}
          <EssayContent essayId={essayId} />
        </div>
      </div>
    </div>
  );
}

// Helper component to load essay content
function EssayContent({ essayId }: { essayId: string }) {
  // TODO: Load essay from API or use loader data
  return <div>Essay content for {essayId}</div>;
}
```

**Reference:** Plan lines 973-1027

---

## Integration Steps

### Step 1: Update scholarships.$id.apply.tsx

Replace the placeholder content in `app/routes/scholarships.$id.apply.tsx` with the actual ChatInterface component:

```tsx
import { ChatInterface } from "~/components/chat-interface";

// In the component, replace the placeholder div with:
<ChatInterface
  applicationId={application.id}
  scholarshipId={scholarship.id}
/>
```

### Step 2: Create Essay Viewing Route

Create `app/routes/essays.$essayId.view.tsx` for the essay lightbox:

```tsx
import { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireUserId } from "~/session.server";
import { getEssay } from "~/models/essay.server";
import { EssayLightbox } from "~/components/essay-lightbox";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const essay = await getEssay({ id: params.essayId!, userId });
  return json({ essay });
};

export default function EssayViewPage() {
  const { essay } = useLoaderData();
  return <EssayLightbox essayId={essay.id} />;
}
```

---

## Testing Checklist

After completing the chat UI components:

### Backend Tests
- [ ] POST `/api/chat` returns response with sources
- [ ] API handles missing GLM_API_KEY gracefully
- [ ] API handles missing PINECONE_API_KEY gracefully
- [ ] Conversation state is saved

### Frontend Tests
- [ ] Chat interface renders without errors
- [ ] Messages display correctly (user vs assistant styling)
- [ ] Citation badges appear in assistant messages
- [ ] Citation tooltips show correct source info
- [ ] Essay lightbox opens and closes correctly
- [ ] Sources sidebar updates with new messages

### End-to-End Tests
- [ ] User can send message and receive AI response
- [ ] Response includes citations from user's past essays
- [ ] Clicking citation shows tooltip with source details
- [ ] "View full" link opens essay lightbox
- [ ] Agent status updates during processing

---

## Time Estimate for Completion

| File | Time | Complexity |
|------|------|------------|
| chat-interface.tsx | 90 min | High (state management) |
| chat-message.tsx | 45 min | Medium |
| citation-badge.tsx | 30 min | Low |
| essay-lightbox.tsx | 45 min | Medium |
| Integration + Testing | 30 min | Medium |
| **Total** | **4 hours** | |

---

## Code Patterns to Follow

### Import Statements
```tsx
import { useState, useRef, useEffect } from "react";
import { useLoaderData } from "@remix-run/react";
import type { Message, Source } from "~/types/chat";
```

### Server-Side Imports
```tsx
import { requireUserId } from "~/session.server";
import { json } from "@remix-run/node";
import { prisma } from "~/db.server";
```

### Styling
- Use Tailwind CSS classes (already configured)
- Follow existing component patterns from `essays.new.tsx`
- Use responsive classes: `grid-cols-1 lg:grid-cols-3`

### Error Handling
```tsx
try {
  // API call
} catch (error) {
  console.error("Error:", error);
  // Show user-friendly error message
}
```

---

## Helpful Resources

### Plan Reference
Full implementation plan: `docs/plans/2025-01-22-scholarships-plus-implementation.md`

### Type Definitions
All types defined in: `app/types/chat.ts`

### Existing Patterns
- Form handling: `app/routes/essays.new.tsx`
- Loader/action pattern: `app/routes/scholarships.$id.tsx`
- Component patterns: `app/components/essay-uploader.tsx`

---

## Questions to Address During Implementation

1. **Essay Loading**: Should essay content for lightbox come from a new API endpoint or be passed through route loader?
2. **Conversation Persistence**: Should conversation be saved to database on every message or batched?
3. **Real-time Updates**: Use polling or WebSocket for agent status updates?
4. **Mobile Responsiveness**: Ensure chat interface works well on mobile screens.
5. **Accessibility**: Add ARIA labels for screen readers, keyboard navigation.

---

## Summary

You've completed ~75% of Phase 1. The remaining 4 chat UI components should take 3-4 hours to complete. Once done, you'll have a fully functional RAG-powered scholarship application system!

**Estimated Time to 100% Phase 1 Completion: 4 hours**
