# Scholarships Plus - Implementation Plan

**Date**: 2025-01-22
**Goal**: AI-driven scholarship application portal for Indigenous students
**Target Launch**: Before scholarship season (applications typically open January-April)

---

## Executive Summary

Build a conversational scholarship application engine that uses RAG (Retrieval-Augmented Generation) to help students apply for scholarships with personalized, authentic responses. The system indexes past essays and conversations, then uses an AI agent to guide students through new applications while cross-referencing their previous work.

**Core Differentiator**: The agent doesn't make things up - it uses the student's actual writing and achievements, only asking for updates when things have changed.

---

## Phases Overview

| Phase | Focus | Duration | Dependencies |
|-------|-------|----------|--------------|
| 1 | RAG + AI Agent | MVP foundation | None |
| 2 | References System | Social proof | Phase 1 |
| 3 | Scholarship Discovery | Content pipeline | Phase 1 |
| 4 | Infrastructure | Production deployment | Phase 1-3 |

---

## Local Development Setup

### Shared Postgres Instance

This application shares a Postgres instance with other apps on your EC2. Each app uses its own dedicated database.

**Connection Details:**
- **Host**: localhost
- **Port**: 5432
- **Default credentials**: postgres / postgres
- **This app's database**: `scholarships_plus` (dedicated DB, not shared)

**Database URL:**
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scholarships_plus"
```

**.env.example (update this):**
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scholarships_plus"
SESSION_SECRET="super-duper-s3cret"
GLM_API_KEY="your_glm_key_here"
PINECONE_API_KEY="your_pinecone_key_here"
```

### Creating the Dedicated Database

```bash
# Connect to the shared Postgres instance
psql -U postgres -h localhost -p 5432 -d postgres

# Create the dedicated database for this app
CREATE DATABASE scholarships_plus;

# Verify
\l scholarships_plus

# Exit
\q
```

### Package.json Scripts (Bun-based)

Update your `package.json` scripts to use Bun instead of npm:

```json
{
  "scripts": {
    "dev": "bun run dev:remix",
    "dev:remix": "bunx remix dev --manual -c \"node --require ./mocks --watch-path ./build/server.js --watch ./build/server.js\"",
    "dev:server": "cross-env NODE_ENV=development bun run build:server -- --watch",
    "build": "npm-run-all --sequential build:*",
    "build:remix": "remix build",
    "build:server": "esbuild --platform=node --format=cjs ./server.ts --outdir=build --bundle --external:fsevents",
    "setup": "bun run prisma:check && prisma generate && prisma migrate deploy && prisma db seed",
    "prisma:check": "bun run scripts/check-db.ts",
    "start": "cross-env NODE_ENV=production node ./build/server.js",
    "docker": "docker compose up -d"
  }
}
```

### Database Health Check Script

Create `scripts/check-db.ts` to verify Postgres is running before migrations:

```typescript
// scripts/check-db.ts
import { Client } from 'pg';

async function checkDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'scholarships_plus'
  });

  try {
    await client.connect();
    console.log('✅ Database is running on port 5432');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database is not running on port 5432');
    console.error('Please start the Postgres Docker container:');
    console.error('  docker ps                    # Check if running');
    console.error('  docker start <container>     # Start if stopped');
    process.exit(1);
  }
}

checkDatabase();
```

### Dev Workflow

```bash
# 1. Start Postgres (you do this manually for now)
docker ps  # Verify your Postgres container is running

# 2. Create the dedicated database (one-time setup)
psql -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE scholarships_plus;"

# 3. Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# 4. Install dependencies and setup
bun install
bun run setup

# 5. Start development server
bun run dev
```

**Note**: For now, you start the Postgres container manually. Future enhancement could automate this with a script that checks `docker ps` and starts the container if needed.

---

## Phase 1: Core RAG + AI Agent (MVP)

### Objectives

- Bulk essay upload with drag-drop and cloud provider integration
- Vector embedding pipeline with Pinecone
- Chat interface with source citations
- Per-scholarship conversations (pausable/resumable)
- Scholarship browsing interface

### 1.1 Database Schema Changes

**File**: `prisma/schema.prisma`

Add the following models:

```prisma
// Scholarship opportunities
model Scholarship {
  id            String   @id @default(cuid())
  title         String
  organization  String?
  description   String   @db.Text
  amount        Decimal?
  deadline      DateTime
  requirements  Json     // { essays: [], transcripts: boolean, references: number }
  source        String   // "mailing-list", "manual-entry", "scrape"
  sourceUrl     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  applications  Application[]

  @@index([deadline])
}

// Per-student, per-scholarship application
model Application {
  id              String    @id @default(cuid())
  userId          String
  scholarshipId   String
  status          String    @default("not-started") // "not-started", "in-progress", "submitted", "awarded", "rejected"
  step            Int       @default(1) // 1=browse, 2=agent, 3=review, 4=submit
  submittedAt     DateTime?
  awardedAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user            User      @relation(fields: [userId], references: [id])
  scholarship     Scholarship @relation(fields: [scholarshipId], references: [id])
  conversations   Conversation[]
  references      ReferenceRequest[]

  @@unique([userId, scholarshipId])
  @@index([userId, status])
}

// Per-application chat session
model Conversation {
  id              String   @id @default(cuid())
  applicationId   String
  scholarshipId   String
  messages        Json     // [{ role: "user|assistant", content: "...", sources: [], timestamp: "..."}]
  currentStep     String?
  contextSnapshot Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  application     Application @relation(fields: [applicationId], references: [id])
  vectorId        String?

  @@index([applicationId])
}

// Reference requests for applications
model ReferenceRequest {
  id              String   @id @default(cuid())
  applicationId   String
  refererEmail    String
  refererName     String?
  permalinkToken  String   @unique
  status          String   @default("pending") // "pending", "viewed", "submitted", "complete"
  letterContent   String?  @db.Text
  submittedAt     DateTime?
  lastViewedAt    DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  application     Application @relation(fields: [applicationId], references: [id])

  @@index([refererEmail, status])
}

// Student profile for RAG enrichment
model StudentProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  currentGoals    String?  @db.Text
  recentUpdates   String?  @db.Text
  background      String?  @db.Text
  vectorId        String?

  user            User     @relation(fields: [userId], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// Essay similarity tracking
model EssaySimilarity {
  id            String   @id @default(cuid())
  essayId       String
  similarToId   String
  score         Float
  reason        String?
  computedAt    DateTime @default(now())

  essay         Essay    @relation("SimilarityFrom", fields: [essayId], references: [id])
  similarTo     Essay    @relation("SimilarityTo", fields: [similarToId], references: [id])

  @@unique([essayId, similarToId])
  @@index([essayId])
}
```

**Extend existing Essay model:**

```prisma
model Essay {
  // ... existing fields ...

  wasAwarded            Boolean?
  vectorId              String?
  lastSimilarityCheck   DateTime?
  similaritiesFrom      EssaySimilarity[] @relation("SimilarityFrom")
  similaritiesTo        EssaySimilarity[] @relation("SimilarityTo")
}
```

**Migration:**

```bash
npx prisma migrate dev --name add-scholarship-rag-schema
```

---

### 1.2 Pinecone Integration

**Files to create:**

```
app/lib/
├── pinecone.server.ts       # Pinecone client setup
├── embeddings.server.ts     # GLM 4.7 embedding wrapper
├── rag.server.ts            # RAG query pipeline
└── similarity.server.ts     # Background job for computing similarities
```

**`app/lib/pinecone.server.ts`:**

```typescript
import { Pinecone, PineconeRecord } from '@pinecone-database/pinecone';

let client: Pinecone | null = null;

export function getPinecone() {
  if (!client) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY is not set');
    }
    client = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }
  return client;
}

export async function getOrCreateIndex(userId: string) {
  const pinecone = getPinecone();
  const indexName = `scholarships-plus-${userId}`;

  const indexes = await pinecone.listIndexes();
  const existing = indexes.indexes?.find(i => i.name === indexName);

  if (existing) {
    return pinecone.index(indexName);
  }

  // Create new index for user
  await pinecone.createIndex({
    name: indexName,
    dimension: 1024, // GLM 4.7 embedding dimension
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1'
      }
    }
  });

  return pinecone.index(indexName);
}
```

**`app/lib/embeddings.server.ts`:**

```typescript
import { getPinecone } from './pinecone.server';

interface EmbedContentOptions {
  type: 'essay' | 'conversation' | 'profile';
  userId: string;
  contentId: string;
  content: string;
  metadata: {
    awarded?: boolean;
    date?: string;
    scholarshipId?: string;
    [key: string]: any;
  };
}

export async function embedContent(options: EmbedContentOptions): Promise<string> {
  // 1. Generate embedding via GLM 4.7
  const embedding = await generateEmbedding(options.content);

  // 2. Store in Pinecone
  const index = await getOrCreateIndex(options.userId);
  const vectorId = `${options.type}-${options.contentId}`;

  await index.upert([{
    id: vectorId,
    values: embedding,
    metadata: {
      type: options.type,
      content: options.content.slice(0, 1000), // First 1KB for preview
      ...options.metadata
    }
  }]);

  return vectorId;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'embedding-2',
      input: text
    })
  });

  const data = await response.json();
  return data.data[0].embedding;
}

export async function searchRelevantContent(
  userId: string,
  query: string,
  filters: Record<string, any> = {},
  topK: number = 5
) {
  const queryEmbedding = await generateEmbedding(query);
  const index = await getOrCreateIndex(userId);

  const results = await index.query({
    vector: queryEmbedding,
    filter: filters,
    topK,
    includeMetadata: true
  });

  return results.matches?.map(match => ({
    id: match.id,
    score: match.score || 0,
    metadata: match.metadata
  })) || [];
}
```

**Environment variables (`.env`):**

```bash
PINECONE_API_KEY=your_key_here
GLM_API_KEY=your_glm_key_here
```

---

### 1.3 Essay Upload Interface

**Files to create:**

```
app/routes/
├── essays.new.tsx             # New essay form with bulk upload
└── essays.upload.tsx          # Upload endpoint (action)

app/components/
├── essay-uploader.tsx         # Drag-drop component
└── cloud-picker.tsx           # Google Drive/Dropbox picker
```

**`app/components/essay-uploader.tsx`:**

```tsx
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface EssayUploaderProps {
  onUpload: (files: File[]) => Promise<void>;
  acceptedFormats?: string[];
}

export function EssayUploader({
  onUpload,
  acceptedFormats = ['.pdf', '.doc', '.docx', '.txt']
}: EssayUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true);
    try {
      for (let i = 0; i < acceptedFiles.length; i++) {
        await onUpload([acceptedFiles[i]]);
        setProgress(((i + 1) / acceptedFiles.length) * 100);
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    }
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div>
            <div className="text-lg font-medium">Uploading... {Math.round(progress)}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-2">📄</div>
            <p className="text-lg font-medium">
              {isDragActive ? 'Drop your essays here' : 'Drag & drop essays here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to browse • PDF, DOC, DOCX, TXT
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <span className="text-sm text-gray-500">or</span>
        <CloudPicker onFilesSelected={onUpload} />
      </div>
    </div>
  );
}
```

**`app/routes/essays.upload.tsx` (action):**

```typescript
import { type ActionFunctionArgs, json } from '@remix-run/node';
import { auth } from '~/utils.server';
import { embedContent } from '~/lib/embeddings.server';
import { prisma } from '~/db.server';
import { computeSimilarities } from '~/lib/similarity.server';

export async function action({ request }: ActionFunctionArgs) {
  const userId = await auth.requireUserId(request);
  const formData = await request.formData();

  const file = formData.get('file') as File;
  const wasAwarded = formData.get('wasAwarded') === 'true';

  if (!file) {
    return json({ error: 'No file provided' }, { status: 400 });
  }

  // Extract text from file
  const text = await extractTextFromFile(file);

  // Save to database
  const essay = await prisma.essay.create({
    data: {
      userId,
      title: file.name.replace(/\.[^/.]+$/, ''),
      content: text,
      wasAwarded
    }
  });

  // Embed and store in Pinecone
  const vectorId = await embedContent({
    type: 'essay',
    userId,
    contentId: essay.id,
    content: text,
    metadata: {
      awarded: wasAwarded,
      date: new Date().toISOString()
    }
  });

  // Update essay with vectorId
  await prisma.essay.update({
    where: { id: essay.id },
    data: { vectorId }
  });

  // Compute similarities in background
  computeSimilarities(essay.id, userId).catch(console.error);

  return json({ success: true, essayId: essay.id });
}
```

---

### 1.4 Chat Interface with Citations

**Files to create:**

```
app/routes/
└── scholarships.$id.apply.tsx    # Step 2: Agent chat interface

app/components/
├── chat-interface.tsx           # Main chat UI
├── chat-message.tsx             # Message with citation badges
├── citation-tooltip.tsx          # Hover tooltip for sources
└── essay-lightbox.tsx            # Lightbox for viewing essays
```

**`app/routes/scholarships.$id.apply.tsx`:**

```tsx
import { LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { auth } from '~/utils.server';
import { prisma } from '~/db.server';
import { ChatInterface } from '~/components/chat-interface';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const userId = await auth.requireUserId(request);
  const scholarshipId = params.id;

  const scholarship = await prisma.scholarship.findUnique({
    where: { id: scholarshipId }
  });

  if (!scholarship) {
    throw new Response('Not found', { status: 404 });
  }

  // Get or create application
  let application = await prisma.application.findUnique({
    where: {
      userId_scholarshipId: {
        userId,
        scholarshipId
      }
    },
    include: {
      conversations: {
        orderBy: { updatedAt: 'desc' },
        take: 1
      }
    }
  });

  if (!application) {
    application = await prisma.application.create({
      data: {
        userId,
        scholarshipId,
        step: 2
      }
    });
  }

  return json({ scholarship, application });
}

export default function ScholarshipApply() {
  const { scholarship, application } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const essayId = searchParams.get('essay'); // For lightbox

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{scholarship.title}</h1>
              <p className="text-gray-600">Step 2 of 4: AI Application Agent</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ChatInterface
          applicationId={application.id}
          scholarshipId={scholarship.id}
        />
      </main>

      {essayId && <EssayLightbox essayId={essayId} />}
    </div>
  );
}
```

**`app/components/chat-interface.tsx`:**

```tsx
import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './chat-message';
import type { Message, Source } from '~/types/chat';

interface ChatInterfaceProps {
  applicationId: string;
  scholarshipId: string;
}

export function ChatInterface({ applicationId, scholarshipId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          scholarshipId,
          message: input,
          history: messages
        })
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        sources: data.sources,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setAgentStatus(data.agentStatus || '');
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Chat Main */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="h-[500px] overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-lg font-medium">Ready to help you apply</h3>
                <p className="text-gray-600 mt-2">
                  I'll ask you questions and use your past essays as reference.
                  Let's get started!
                </p>
              </div>
            ) : (
              messages.map(message => (
                <ChatMessage key={message.id} message={message} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && sendMessage()}
                placeholder="Type your message..."
                className="flex-1 border rounded-lg px-4 py-2"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar: Agent Status + Sources */}
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h3 className="font-medium mb-2">🤖 Agent Status</h3>
          <p className="text-sm text-gray-600">{agentStatus || 'Waiting for you...'}</p>
        </div>

        {messages.some(m => m.sources && m.sources.length > 0) && (
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="font-medium mb-2">📚 Sources</h3>
            <div className="space-y-2 text-sm">
              {messages.flatMap(m => m.sources || []).map((source, i) => (
                <div key={i} className="p-2 bg-gray-50 rounded">
                  <div className="font-medium">
                    {source.type === 'essay' ? '📄' : '💬'} {source.title}
                  </div>
                  <div className="text-gray-600 text-xs">
                    {source.date} • {source.relevance}% match
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**`app/components/chat-message.tsx`:**

```tsx
import type { Message } from '~/types/chat';
import { CitationBadge } from './citation-badge';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
        isUser
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-900'
      }`}>
        <div className="prose prose-sm">
          <MessageContent content={message.content} sources={message.sources} />
        </div>
        <div className={`text-xs mt-1 ${isUser ? 'text-blue-100' : 'text-gray-500'}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content, sources }: { content: string; sources?: Source[] }) {
  if (!sources || sources.length === 0) {
    return <p>{content}</p>;
  }

  // Split content by citation markers and render with badges
  // This is simplified - you'd parse citation positions from the LLM response
  const parts = content.split(/\[(\d+)\]/);

  return (
    <p>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // This is a citation number
          const sourceIndex = parseInt(part) - 1;
          return (
            <CitationBadge
              key={i}
              number={part}
              source={sources[sourceIndex]}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
```

**`app/components/citation-badge.tsx`:**

```tsx
import { useState } from 'react';
import type { Source } from '~/types/chat';

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
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowTooltip(false)}
          />
          <div className="absolute z-20 bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border p-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">
                {source.type === 'essay' ? '📄' : '💬'}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    // Open essay lightbox
                  }}
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

---

### 1.5 Essay Lightbox

**`app/components/essay-lightbox.tsx`:**

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

interface EssayLightboxProps {
  essayId: string;
}

export function EssayLightbox({ essayId }: EssayLightboxProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('../');
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">Essay View</h2>
          <button
            onClick={() => navigate('../')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Essay content loaded here */}
          <EssayContent essayId={essayId} />
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 2: References System

### 2.1 Reference Portal (Public-Facing)

**Files to create:**

```
app/routes/
└── reference.$token.tsx         # Public reference submission portal

app/components/
├── reference-form.tsx           # Submission form
├── past-letter-enhancer.tsx     # Past letter processing
└── student-context-card.tsx     # Shows current student info
```

**`app/routes/reference.$token.tsx`:**

```tsx
import { LoaderFunctionArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { prisma } from '~/db.server';
import { ReferenceForm } from '~/components/reference-form';

export async function loader({ params }: LoaderFunctionArgs) {
  const reference = await prisma.referenceRequest.findUnique({
    where: { permalinkToken: params.token },
    include: {
      application: {
        include: {
          user: {
            include: { profile: true }
          },
          scholarship: true
        }
      }
    }
  });

  if (!reference) {
    throw new Response('Not found', { status: 404 });
  }

  // Track view
  await prisma.referenceRequest.update({
    where: { id: reference.id },
    data: {
      lastViewedAt: new Date(),
      status: reference.status === 'pending' ? 'viewed' : reference.status
    }
  });

  // Get past references from this referer
  const pastReferences = await prisma.referenceRequest.findMany({
    where: {
      refererEmail: reference.refererEmail,
      status: 'submitted'
    },
    include: {
      application: {
        include: { user: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 3
  });

  return json({
    reference,
    student: reference.application.user,
    scholarship: reference.application.scholarship,
    profile: reference.application.user.profile,
    pastReferences
  });
}

export default function ReferencePortal() {
  const { reference, student, scholarship, profile, pastReferences } = useLoaderData();

  const daysUntilDeadline = Math.ceil(
    (new Date(scholarship.deadline) - new Date()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm">
          <header className="p-6 border-b">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔒</span>
              <h1 className="text-xl font-bold">Reference Portal</h1>
            </div>
            <p className="text-gray-600 mt-1">for {student.name}</p>
          </header>

          <div className="p-6 space-y-6">
            {/* Request Details */}
            <div>
              <h2 className="font-medium mb-3">📋 Reference Request</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">For:</dt>
                  <dd className="font-medium">{scholarship.title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Student:</dt>
                  <dd className="font-medium">{student.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Relationship:</dt>
                  <dd className="font-medium">{reference.refererName || 'Reference'}</dd>
                </div>
                <div className={`flex justify-between ${daysUntilDeadline <= 7 ? 'text-red-600' : ''}`}>
                  <dt className="text-gray-600">Deadline:</dt>
                  <dd className="font-medium">
                    {new Date(scholarship.deadline).toLocaleDateString()}
                    {daysUntilDeadline <= 7 && ` ⚠️ ${daysUntilDeadline} days remaining`}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Student Context */}
            {profile && (
              <StudentContextCard profile={profile} student={student} />
            )}

            {/* Submission Form */}
            <ReferenceForm
              referenceId={reference.id}
              pastReferences={pastReferences}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 3: Scholarship Discovery

### 3.1 Mailing List Scraper

**Files to create:**

```
app/lib/
└── scrapers/
    ├── mailing-list.server.ts   # Email digest scraper
    ├── web-scraper.server.ts    # Web page scraper
    └── parser.server.ts         # LLM-based content extraction

app/routes/
└── admin.scrape.tsx             # Admin interface for scraping
```

**`app/lib/scrapers/mailing-list.server.ts`:**

```typescript
import { simpleParser } from 'mailparser';
import { parseScholarshipContent } from './parser.server';
import { prisma } from '~/db.server';

interface ScrapedScholarship {
  title: string;
  organization?: string;
  description: string;
  amount?: number;
  deadline: Date;
  requirements: any;
  sourceUrl?: string;
}

export async function scrapeEmailDigest(emailContent: string): Promise<ScrapedScholarship[]> {
  // Use LLM to extract structured data from email
  const extracted = await parseScholarshipContent(emailContent, 'email');

  return extracted;
}

export async function saveScrapedScholarships(
  scholarships: ScrapedScholarship[],
  source: string = 'mailing-list'
) {
  const results = [];

  for (const s of scholarships) {
    // Check for duplicates
    const existing = await prisma.scholarship.findFirst({
      where: {
        title: s.title,
        deadline: s.deadline
      }
    });

    if (existing) {
      await prisma.scholarship.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() }
      });
      results.push({ status: 'updated', id: existing.id });
    } else {
      const created = await prisma.scholarship.create({
        data: {
          ...s,
          source
        }
      });
      results.push({ status: 'created', id: created.id });
    }
  }

  return results;
}
```

**`app/lib/scrapers/parser.server.ts`:**

```typescript
interface ParseOptions {
  type: 'email' | 'web' | 'text';
}

export async function parseScholarshipContent(
  content: string,
  options: ParseOptions
): Promise<any[]> {
  const prompt = `
Extract scholarship information from the following ${options.type} content.
For each scholarship found, return a JSON object with:
- title (required)
- organization
- description
- amount (if mentioned)
- deadline (in YYYY-MM-DD format)
- requirements (essays needed, transcripts, references count)
- sourceUrl (if applicable)

Content:
${content}

Return only valid JSON array.
`;

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'glm-4-flash',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  const parsed = JSON.parse(data.choices[0].message.content);

  return Array.isArray(parsed) ? parsed : [parsed];
}
```

---

## Phase 4: Infrastructure & Deployment

### 4.1 EC2 Deployment Setup

**Files to create:**

```
docker-compose.prod.yml         # Production compose file
deploy.sh                        # Deploy script
.caddy/
└── Caddyfile                   # Caddy configuration
.github/workflows/
└── deploy-ec2.yml              # GitHub Actions for auto-deploy
```

**`docker-compose.prod.yml`:**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3001:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - GLM_API_KEY=${GLM_API_KEY}
      - PINECONE_API_KEY=${PINECONE_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthcheck"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - scholarships-network

networks:
  scholarships-network:
    external: true
```

**`.caddy/Caddyfile`:**

```caddy
scholarships.yourdomain.com {
    reverse_proxy localhost:3001
}
```

**`deploy.sh`:**

```bash
#!/bin/bash
set -e

echo "📦 Pulling latest code..."
cd /var/www/scholarships-plus
git pull origin main

echo "🐳 Building Docker image..."
docker-compose -f docker-compose.prod.yml build

echo "🔄 Restarting container..."
docker-compose -f docker-compose.prod.yml up -d

echo "🗄️ Running migrations..."
docker-compose -f docker-compose.prod.yml exec -T app \
  npx prisma migrate deploy

echo "✅ Deployed!"
```

---

## Dependencies

### NPM Packages to Install

```bash
# Core dependencies
bun add @pinecone-database/pinecone
bun add react-dropzone
bun add mailparser     # For email scraping
bun add mailgun.js    # For sending emails
bun add pg            # For database health check script
bun add @types/pg     # TypeScript types for pg

# Dev dependencies
bun add -D @types/mailparser
```

**Note**: Use `bun` instead of `npm` for all package operations in this project.

### Environment Variables

```bash
# .env
# Local development: shared Postgres instance, dedicated database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scholarships_plus"

# LLM and Vector DB
GLM_API_KEY="your_glm_key"
PINECONE_API_KEY="your_pinecone_key"

# Email (Mailgun)
MAILGUN_API_KEY="your_mailgun_key"
MAILGUN_DOMAIN="mg.yourdomain.com"

# App secrets
SESSION_SECRET="random_secret_string"
```

### External Services to Set Up

1. **Pinecone**: Create account, get API key, note free tier (2GB)
2. **Z.AI / GLM 4.7**: Get API key, check pricing
3. **Mailgun**: Create account, get API key for sending emails (reference requests, notifications)
4. **Domain**: Point `scholarships.yourdomain.com` to your EC2 IP
5. **Caddy**: Already installed, just add Caddyfile

### External Service Costs (MVP)

| Service | Free Tier | You Pay | Notes |
|---------|-----------|---------|-------|
| **Pinecone** | 2GB vectors | **$0** (until exceeded) | Sufficient for ~50k essays |
| **Mailgun** | 5,000 emails/month | **$0** (until exceeded) | Reference requests, notifications |
| **GLM 4.7** | Depends on plan | Pay per token | Check Z.AI pricing |
| **Caddy SSL** | Unlimited | **$0** (Let's Encrypt) | Auto-renewed |

**Total External Services: ~$0/month** (until you exceed free tiers)

---

## Testing Strategy

### Unit Tests

```bash
# Test RAG pipeline
npm test tests/lib/rag.test.ts

# Test embedding functions
npm test tests/lib/embeddings.test.ts

# Test scrapers
npm test tests/lib/scrapers/parser.test.ts
```

### E2E Tests

```bash
# Test essay upload flow
npm run test:e2e -- tests/e2e/essay-upload.cy.ts

# Test chat interface
npm run test:e2e -- tests/e2e/chat.cy.ts

# Test reference portal
npm run test:e2e -- tests/e2e/reference.cy.ts
```

---

## Migration Path to Production (AWS)

When ready to scale from EC2 to AWS:

| Metric | Trigger | Action |
|--------|---------|--------|
| CPU usage | >70% sustained | Upgrade EC2 size |
| Response time | >2s average | Add Redis cache |
| Concurrent users | >50 | Move to ECS Fargate |
| Database load | Slow queries | Move to RDS |
| Global users | Non-US traffic | Add CloudFront CDN |
| Cost | >$100/month | Review Reserved Instances |

---

## Timeline Estimate

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| 1: RAG + Agent | DB schema, Pinecone, uploads, chat | 2-3 weeks |
| 2: References | Portal, enhancement, tracking | 1-2 weeks |
| 3: Discovery | Scrapers, parsers, admin UI | 1 week |
| 4: Deploy | EC2 setup, Caddy, monitoring | 2-3 days |

**Total: ~4-6 weeks to MVP**

---

## Next Steps

1. Set up Pinecone account and get API key
2. Set up GLM 4.7 API access
3. Run database migration
4. Start with Phase 1.1 (DB schema)
5. Build out in order, testing each component

---

**Document Version**: 1.0
**Last Updated**: 2025-01-22
