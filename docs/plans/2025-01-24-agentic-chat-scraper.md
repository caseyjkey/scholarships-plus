# Scholarships Plus - Agentic Chat & Scholarship Scraper Plan

**Date**: 2025-01-24
**Priority**: HIGH - Scholarship Scraper with Embedded Login is now the main focus
**Status**: RAG system complete, moving to agentic features

---

## Part 1: Scholarship Scraper with Embedded Login (HIGH PRIORITY)

### Overview
A user-guided scraping experience where users log into scholarship portals directly within the app (via browser extension or bookmarklet), then the system automatically extracts scholarship data.

### Key Design Principle
**No stored credentials** - Users log in manually for security and to handle 2FA/captchas naturally.

---

### Architecture Options

#### Option A: Browser Extension (Recommended)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Web App        │     │  Browser        │     │  Database       │
│  (Remix)        │◀───▶│  Extension      │────▶│  (Scholarship)  │
│                 │     │  (scraping)     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Pros:**
- Seamless UX - user already on the scholarship portal
- Can scrape automatically after login
- Handles 2FA/captchas naturally
- No iframe/security issues

**Cons:**
- Requires extension installation
- Chrome/Edge only (initially)

---

#### Option B: Bookmarklet
```
User clicks bookmark while logged into portal → JS extracts data → Sends to our API
```

**Pros:**
- No extension needed
- Works in any browser
- Simple to implement

**Cons:**
- Manual action required (click bookmark)
- Less seamless

---

#### Option C: In-App Guided Flow with Puppeteer
```
┌─────────────────┐
│  Web App        │
│  ┌───────────┐  │
│  │ Puppeteer │  │ ← User sees embedded browser
│  │ (headless)│  │   Logs in manually through proxy
│  └───────────┘  │
└─────────────────┘
```

**Pros:**
- All in one app
- Can screenshot/verify scraping

**Cons:**
- Complex setup
- Bandwidth intensive
- May trigger bot detection

---

### Recommended Approach: Browser Extension

Build a Chrome/Edge extension that:
1. Detects when user is on a supported scholarship portal
2. Shows a popup: "Scholarships Plus: Extract scholarships?"
3. User clicks "Extract"
4. Extension scrapes the page and sends to our API
5. Dashboard updates in real-time

---

### Browser Extension Implementation

#### Extension Structure

```
extension/
├── manifest.json          # Extension config
├── background.js          # Service worker (detects pages)
├── content/
│   ├── nativeforward.js   # Native Forward scraper
│   ├── aises.js          # AISES scraper
│   └── cobell.js         # Cobell scraper
├── popup/
│   ├── html/
│   │   └── popup.html     # Popup UI
│   └── js/
│       └── popup.js       # Popup logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

#### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Scholarships Plus Scraper",
  "version": "1.0.0",
  "description": "Extract scholarship data from portals",
  "permissions": [
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://scholars.nativeforward.org/*",
    "https://www.aises.org/*",
    "https://cobellscholar.org/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup/html/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://scholars.nativeforward.org/*"],
      "js": ["content/nativeforward.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.aises.org/*"],
      "js": ["content/aises.js"],
      "run_at": "document_idle"
    }
  ]
}
```

---

#### content/nativeforward.js

```javascript
// Scholarships Plus - Native Forward Scraper

(function() {
  'use strict';

  // Check if we're on the scholarships page
  if (!window.location.pathname.includes('scholarships')) {
    return;
  }

  // Extract scholarship data from the page
  function extractScholarships() {
    const scholarships = [];

    // Selector depends on the actual page structure
    const cards = document.querySelectorAll('.scholarship-card, .opportunity-card, [class*="scholarship"]');

    cards.forEach(card => {
      const title = card.querySelector('h3, h4, .title')?.textContent?.trim();
      const description = card.querySelector('.description, .summary')?.textContent?.trim();
      const amount = card.querySelector('.amount, .award')?.textContent?.trim();
      const deadline = card.querySelector('.deadline, .due-date')?.textContent?.trim();

      if (title) {
        scholarships.push({
          title,
          description,
          amount,
          deadline,
          source: 'nativeforward',
          sourceUrl: window.location.href,
          scrapedAt: new Date().toISOString()
        });
      }
    });

    return scholarships;
  }

  // Send data to our API
  async function sendToAPI(scholarships) {
    const response = await fetch('http://localhost:3030/api/scrape/extension', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'nativeforward',
        scholarships
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Scholarships Plus: Saved', result.saved, 'scholarships');
      return result;
    }
  }

  // Create floating action button
  function createActionButton() {
    const button = document.createElement('div');
    button.id = 'scholarships-plus-extract';
    button.innerHTML = `
      <button style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        padding: 12px 20px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      ">
        📚 Extract Scholarships
      </button>
    `;

    button.querySelector('button').addEventListener('click', async () => {
      button.querySelector('button').textContent = '⏳ Extracting...';
      button.querySelector('button').disabled = true;

      try {
        const scholarships = extractScholarships();
        const result = await sendToAPI(scholarships);

        button.querySelector('button').textContent = `✅ Saved ${result.saved} scholarships`;
        button.querySelector('button').style.background = '#10b981';

        setTimeout(() => {
          button.remove();
        }, 3000);
      } catch (error) {
        console.error('Scholarships Plus error:', error);
        button.querySelector('button').textContent = '❌ Error - Try Again';
        button.querySelector('button').style.background = '#ef4444';
        button.querySelector('button').disabled = false;
      }
    });

    document.body.appendChild(button);
  }

  // Initialize when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createActionButton);
  } else {
    createActionButton();
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extract') {
      const scholarships = extractScholarships();
      sendToAPI(scholarships).then(sendResponse);
      return true; // Keep message channel open for async response
    }
  });
})();
```

---

#### popup/html/popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 350px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    h1 {
      font-size: 18px;
      margin: 0 0 16px 0;
    }
    .site-status {
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .site-status.supported {
      background: #dcfce7;
      border: 1px solid #86efac;
    }
    .site-status.not-supported {
      background: #fef3c7;
      border: 1px solid #fde047;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled {
      background: #94a3b8;
      cursor: not-allowed;
    }
    .status {
      font-size: 12px;
      color: #64748b;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <h1>📚 Scholarships Plus</h1>

  <div id="status" class="site-status not-supported">
    Navigating to supported site...
  </div>

  <button id="extractBtn" disabled>
    Extract Scholarships
  </button>

  <div id="result" class="status"></div>

  <script src="popup.js"></script>
</body>
</html>
```

---

#### popup/js/popup.js

```javascript
// Update popup based on current tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const url = new URL(tab.url);

  const supportedSites = {
    'scholars.nativeforward.org': {
      name: 'Native Forward Scholars',
      icon: '🎓'
    },
    'www.aises.org': {
      name: 'AISES',
      icon: '🔬'
    },
    'cobellscholar.org': {
      name: 'Cobell Scholarship',
      icon: '💰'
    }
  };

  const site = supportedSites[url.hostname];
  const statusDiv = document.getElementById('status');
  const extractBtn = document.getElementById('extractBtn');

  if (site) {
    statusDiv.className = 'site-status supported';
    statusDiv.textContent = `${site.icon} ${site.name} - Ready to extract`;
    extractBtn.disabled = false;

    extractBtn.addEventListener('click', async () => {
      extractBtn.textContent = '⏳ Extracting...';
      extractBtn.disabled = true;

      try {
        // Send message to content script
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });

        document.getElementById('result').textContent =
          `✅ Successfully saved ${response.saved} scholarships!`;
        extractBtn.textContent = 'Done!';
      } catch (error) {
        document.getElementById('result').textContent = `❌ Error: ${error.message}`;
        extractBtn.disabled = false;
        extractBtn.textContent = 'Try Again';
      }
    });
  } else {
    statusDiv.className = 'site-status not-supported';
    statusDiv.textContent = '❌ This site is not supported yet.';
    extractBtn.textContent = 'Not Supported';
  }
});
```

---

### Target Sites (Initial)
1. **Native Forward Scholars** (https://scholars.nativeforward.org)
2. **AISES** (American Indian Science and Engineering Society)
3. **Cobell Scholarship** (https://cobellscholar.org)
4. More sites added as users request them

---

### Implementation Steps

#### Step 1: Extension Foundation (1 day)

- [ ] Create extension folder structure
- [ ] Set up manifest.json
- [ ] Create popup UI
- [ ] Basic content script injection
- [ ] Test on a supported site

#### Step 2: Scraping Logic (2-3 days)

- [ ] Implement Native Forward scraper
- [ ] Implement AISES scraper
- [ ] Implement Cobell scraper
- [ ] Handle edge cases (empty pages, errors)
- [ ] Test data extraction accuracy

#### Step 3: API Integration (1 day)

- [ ] Create `/api/scrape/extension` endpoint
- [ ] Handle authentication (link to user account)
- [ ] Store scholarships in database
- [ ] Return success/error responses

#### Step 4: Dashboard (1 day)

- [ ] Show scraping status in-app
- [ ] List extracted scholarships
- [ ] Allow users to trigger scrape from app
- [ ] Show last scraped time

---

#### Step 2: API Endpoint for Extension

**File: `app/routes/api.scrape.extension.tsx`**
```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

interface ExtensionScrapeRequest {
  source: string;
  scholarships: Array<{
    title: string;
    description?: string;
    amount?: string;
    deadline?: string;
    sourceUrl: string;
    scrapedAt: string;
  }>;
}

export async function action({ request }: ActionFunctionArgs) {
  // For extension, we might use a different auth method
  // (API key or simple token since extensions can't easily do cookies)

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body: ExtensionScrapeRequest = await request.json();

    let saved = 0;
    let updated = 0;

    for (const scholarship of body.scholarships) {
      // Try to find existing scholarship by source URL
      const existing = await prisma.scholarship.findFirst({
        where: {
          sourceUrl: scholarship.sourceUrl
        }
      });

      if (existing) {
        // Update existing
        await prisma.scholarship.update({
          where: { id: existing.id },
          data: {
            title: scholarship.title,
            description: scholarship.description,
            amount: scholarship.amount ? parseFloat(scholarship.amount.replace(/[^0-9.]/g, '')) : null,
            deadline: scholarship.deadline ? new Date(scholarship.deadline) : null,
          }
        });
        updated++;
      } else {
        // Create new
        await prisma.scholarship.create({
          data: {
            title: scholarship.title,
            description: scholarship.description || '',
            amount: scholarship.amount ? parseFloat(scholarship.amount.replace(/[^0-9.]/g, '')) : null,
            deadline: scholarship.deadline ? new Date(scholarship.deadline) : null,
            source: body.source,
            sourceUrl: scholarship.sourceUrl,
            requirements: {}, // Will be enhanced later
          }
        });
        saved++;
      }
    }

    return json({
      success: true,
      saved,
      updated,
      total: body.scholarships.length
    });
  } catch (error) {
    console.error('Scraping error:', error);
    return json(
      { error: 'Failed to save scholarships', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

---

### User Flow

1. **Initial Setup**
   - User installs extension from Chrome Web Store
   - User logs into Scholarships Plus app
   - App generates a pairing code or API token
   - User enters token in extension settings (links extension to their account)

2. **Daily/Weekly Usage**
   - User navigates to Native Forward Scholars (or other portal)
   - Extension shows popup: "Extract scholarships?"
   - User clicks "Extract"
   - Extension scrapes and sends to app
   - Dashboard updates automatically

3. **In-App Dashboard**
   - Shows list of all scholarships
   - Indicates source (Native Forward, AISES, etc.)
   - Shows last scraped time
   - "Refresh" button re-triggers extension scraping
   ```typescript
   export interface ScrapedScholarship {
     source: string; // e.g., "nativeforward"
     sourceUrl: string;
     title: string;
     description: string;
     amount?: string;
     deadline: Date;
     requirements: string[];
     eligibility?: string;
     scrapedAt: Date;
   }

   export abstract class BaseScraper {
     abstract login(credentials: { username: string; password: string }): Promise<void>;
     abstract scrapeScholarships(): Promise<ScrapedScholarship[]>;

     protected async pageWait(ms: number) {
       return new Promise(resolve => setTimeout(resolve, ms));
     }
   }
   ```

2. **`app/lib/scrapers/nativeforward-scraper.ts`** - Native Forward specific
   ```typescript
   import puppeteer from 'puppeteer';
   import { BaseScraper, ScrapedScholarship } from './base-scraper';

   export class NativeForwardScraper extends BaseScraper {
     private browser?: Browser;
     private page?: Page;

     async login(credentials) {
       this.browser = await puppeteer.launch({ headless: false });
       this.page = await this.browser.newPage();

       // Navigate to login
       await this.page.goto('https://scholars.nativeforward.org/login');

       // Fill credentials
       await this.page.type('#email', credentials.username);
       await this.page.type('#password', credentials.password);
       await this.page.click('button[type="submit"]');

       // Wait for navigation
       await this.page.waitForNavigation();
     }

     async scrapeScholarships(): Promise<ScrapedScholarship[]> {
       // Navigate to scholarships page
       await this.page.goto('https://scholars.nativeforward.org/scholarships');
       await this.pageWait(2000);

       // Extract scholarship listings
       const scholarships = await this.page.evaluate(() => {
         const items = document.querySelectorAll('.scholarship-card');
         return Array.from(items).map(card => ({
           title: card.querySelector('.title')?.textContent,
           description: card.querySelector('.description')?.textContent,
           amount: card.querySelector('.amount')?.textContent,
           deadline: card.querySelector('.deadline')?.textContent,
           requirements: Array.from(card.querySelectorAll('.requirement'))
             .map(r => r.textContent)
         }));
       });

       return scholarships.map(s => ({
         ...s,
         source: 'nativeforward',
         sourceUrl: 'https://scholars.nativeforward.org',
         scrapedAt: new Date()
       }));
     }

     async close() {
       await this.browser?.close();
     }
   }
   ```

3. **`app/lib/scrapers/index.ts`** - Scraper registry
   ```typescript
   import { NativeForwardScraper } from './nativeforward-scraper';

   export const SCRAPERS = {
     nativeforward: NativeForwardScraper,
     // Add more scrapers here
   };

   export async function scrapeAllSites(credentials: Record<string, any>) {
     const results = [];

     for (const [site, ScraperClass] of Object.entries(SCRAPERS)) {
       if (credentials[site]) {
         const scraper = new ScraperClass();
         try {
           await scraper.login(credentials[site]);
           const scholarships = await scraper.scrapeScholarships();
           results.push(...scholarships);
         } catch (error) {
           console.error(`Failed to scrape ${site}:`, error);
         } finally {
           await scraper.close();
         }
       }
     }

     return results;
   }
   ```

---

#### Step 2: Credentials Storage

**Add to `prisma/schema.prisma`:**
```prisma
model ScraperCredential {
  id         String   @id @default(cuid())
  userId     String
  site       String   // nativeforward, aises, etc.
  username   String
  password   String   // encrypted
  lastUsed   DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, site])
  @@index([userId])
}
```

**Update User model:**
```prisma
model User {
  // ... existing fields
  scraperCredentials ScraperCredential[]
}
```

---

#### Step 3: Scraping Job Scheduler

**File: `app/lib/scrapers/scheduler.ts`**
```typescript
import { scrapeAllSites } from './index';
import { prisma } from '~/db.server';

export async function runScrapingJob(userId: string) {
  // Get user's scraper credentials
  const credentials = await prisma.scraperCredential.findMany({
    where: { userId }
  });

  const credsMap = Object.fromEntries(
    credentials.map(c => [c.site, { username: c.username, password: c.password }])
  );

  // Run scrapers
  const scholarships = await scrapeAllSites(credsMap);

  // Store in database
  for (const scholarship of scholarships) {
    await prisma.scholarship.upsert({
      where: {
        sourceUrl_source: {
          sourceUrl: scholarship.sourceUrl,
          source: scholarship.source
        }
      },
      update: {
        title: scholarship.title,
        description: scholarship.description,
        amount: scholarship.amount,
        deadline: scholarship.deadline,
        requirements: scholarship.requirements,
      },
      create: {
        title: scholarship.title,
        description: scholarship.description,
        amount: scholarship.amount,
        deadline: scholarship.deadline,
        requirements: scholarship.requirements,
        source: scholarship.source,
        sourceUrl: scholarship.sourceUrl,
      }
    });
  }

  return { scraped: scholarships.length };
}
```

---

#### Step 4: API Endpoint

**File: `app/routes/api.scrape.tsx`**
```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { runScrapingJob } from "~/lib/scrapers/scheduler";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  if (request.method === "POST") {
    const result = await runScrapingJob(userId);
    return json({ success: true, ...result });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
```

---

#### Step 5: Dashboard UI

**File: `app/routes/scholarships.dashboard.tsx`**
```typescript
import { LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const scholarships = await prisma.scholarship.findMany({
    where: {
      source: { in: ['nativeforward', 'aises', 'cobell'] }
    },
    orderBy: { deadline: 'asc' },
    take: 50
  });

  return json({ scholarships });
}

export default function ScholarshipDashboard() {
  const { scholarships } = useLoaderData();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Scholarship Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium">Total Scholarships</h3>
          <p className="text-3xl font-bold">{scholarships.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium">Urgent (Due in 7 days)</h3>
          <p className="text-3xl font-bold text-red-600">
            {scholarships.filter(s => {
              const daysUntil = (new Date(s.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
              return daysUntil <= 7;
            }).length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium">This Month</h3>
          <p className="text-3xl font-bold text-blue-600">
            {scholarships.filter(s => {
              const deadline = new Date(s.deadline);
              const now = new Date();
              return deadline.getMonth() === now.getMonth() && deadline.getFullYear() === now.getFullYear();
            }).length}
          </p>
        </div>
      </div>

      {/* Scraping Controls */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-medium mb-2">Update Scholarships</h2>
        <p className="text-sm text-gray-600 mb-4">
          Scrape scholarship portals for the latest opportunities
        </p>
        <form method="post" action="/api/scrape">
          <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            Scrape All Portals
          </button>
        </form>
      </div>

      {/* Scholarships Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scholarship</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deadline</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {scholarships.map(scholarship => (
              <tr key={scholarship.id}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{scholarship.title}</div>
                  <div className="text-sm text-gray-500">{scholarship.organization}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {scholarship.amount ? `$${scholarship.amount}` : 'N/A'}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    new Date(scholarship.deadline) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {new Date(scholarship.deadline).toLocaleDateString()}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {scholarship.source}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Link to={`/scholarships/${scholarship.id}/apply`} className="text-blue-500 hover:text-blue-700">
                    Apply →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### Dependencies to Install

```bash
# Browser automation
npm install puppeteer

# Type definitions
npm install -D @types/puppeteer

# Encryption for credentials
npm install crypto-js
```

---

### Phase 1: MVP Scraper (1-2 days)

- [ ] Set up Puppeteer infrastructure
- [ ] Implement Native Forward scraper
- [ ] Create credentials storage
- [ ] Build basic dashboard
- [ ] Manual testing of scraping flow

---

### Phase 2: Additional Scrapers (1 week each)

- [ ] AISES scraper
- [ ] Cobell scraper
- [ ] General aggregators

---

### Phase 3: Automation

- [ ] Background job scheduling (cron or similar)
- [ ] Incremental updates (only new/changed scholarships)
- [ ] Email notifications for new scholarships
- [ ] Deadline reminders

---

## Part 2: Agentic Chat Interface

### Overview (Simplified MVP)

A conversational interface that:
1. Asks which scholarship the user is applying to
2. Searches for similar past essays using RAG
3. Suggests relevant content from past essays
4. Asks for missing information

**Note**: The full vision (agent navigating scholarship portal, filling forms) comes AFTER the scraper is working.

---

### Implementation

#### File: `app/routes/api.chat.agentic.tsx`

```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { searchRelevantChunks, formatChunksForPrompt } from "~/lib/embeddings.server";

interface ChatRequest {
  message: string;
  scholarshipId?: string;
  context?: {
    step: 'gathering' | 'drafting' | 'refining';
    scholarshipName?: string;
    similarEssays?: string[];
  };
}

// Simple state machine for conversation flow
const CONVERSATION_FLOW = {
  START: {
    prompt: "What scholarship are you applying to? Please share the name or a link.",
    next: 'CHECKING_SIMILARITY'
  },
  CHECKING_SIMILARITY: {
    action: async (scholarshipName: string, userId: string) => {
      // Search for similar essays
      const chunks = await searchRelevantChunks(userId, scholarshipName, 5);

      if (chunks.length > 0) {
        const essays = [...new Set(chunks.map(c => c.metadata.essayTitle))];
        return {
          message: `I found ${essays.length} similar essays you've written: ${essays.join(', ')}. Would you like me to use content from these as a starting point?`,
          similarEssays: essays,
          chunks
        };
      }

      return {
        message: `I don't see any similar essays in your collection. Let's start from scratch. What's the main essay prompt or question for this scholarship?`,
        similarEssays: [],
        chunks: []
      };
    },
    next: 'GATHERING_INFO'
  },
  GATHERING_INFO: {
    prompt: "I'll help you gather the information. What's the main topic or theme they want you to address?",
    next: 'DRAFTING'
  }
};

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { message, context }: ChatRequest = await request.json();

  // Simple flow: if no scholarship name, ask for it
  if (!context?.scholarshipName) {
    return json({
      message: "What scholarship are you applying to? Please share the name.",
      context: { step: 'gathering' as const }
    });
  }

  // Check for similar essays
  const chunks = await searchRelevantChunks(userId, context.scholarshipName, 5);

  if (chunks.length > 0 && !context.similarEssays) {
    const essays = [...new Set(chunks.map(c => c.metadata.essayTitle))];
    return json({
      message: `I found ${essays.length} similar essays you've written:\n\n${essays.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nWould you like me to use content from these as a starting point? (yes/no)`,
      context: {
        ...context,
        similarEssays: essays,
        chunks: chunks.map(c => ({ id: c.id, content: c.content, essay: c.metadata.essayTitle }))
      }
    });
  }

  // Generate response based on context
  // This is a simple version - full version would call LLM
  return json({
    message: "Got it. Let me know what specific aspect you'd like help with, and I can suggest relevant content from your past essays.",
    context
  });
}
```

---

#### File: `app/routes/applications.new.tsx`

New route for agentic chat:

```typescript
import { useState } from "react";
import { useFetcher } from "@remix-run/react";

export default function NewApplicationPage() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'Hi! I\'ll help you apply for a scholarship. What scholarship are you applying to?' }
  ]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState<any>({});
  const fetcher = useFetcher();

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");

    fetcher.submit(
      { message: input, context },
      { method: "post", action: "/api/chat/agentic" }
    );
  };

  // Update messages when fetcher returns
  if (fetcher.data && fetcher.state === "idle") {
    setMessages(prev => [...prev, { role: 'assistant', content: fetcher.data.message }]);
    setContext(fetcher.data.context || {});
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Scholarship Application Assistant</h1>

      {/* Chat messages */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4 h-96 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`mb-4 ${msg.role === 'user' ? 'text-right' : ''}`}>
            <span className={`inline-block px-4 py-2 rounded-lg ${
              msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-900'
            }`}>
              {msg.content}
            </span>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-lg"
          placeholder="Type your message..."
          disabled={fetcher.state !== "idle"}
        />
        <button
          type="submit"
          disabled={fetcher.state !== "idle"}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

---

## Development Priority

1. **Phase 1: Scholarship Scraper MVP** (1-2 days)
   - Set up Puppeteer
   - Native Forward scraper
   - Basic dashboard
   - Test scraping flow

2. **Phase 2: Agentic Chat MVP** (1 day)
   - Simple chat interface
   - Scholarship name detection
   - Similar essay search
   - Basic flow

3. **Phase 3: Integration** (1-2 days)
   - Connect chat to scraped scholarships
   - "Apply" button from dashboard → opens chat for that scholarship
   - Use LLM for better responses

4. **Phase 4: Advanced Features** (future)
   - Agent navigates scholarship portal
   - Auto-fills known information
   - Multi-step form handling

---

## Next Steps

1. Install Puppeteer and dependencies
2. Create base scraper infrastructure
3. Implement Native Forward scraper
4. Build dashboard UI
5. Test scraping flow manually
6. Add agentic chat on top
