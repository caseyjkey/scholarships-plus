# Scholarships Plus - Scholarship Scraper & Agentic Chat Plan

**Date**: 2025-01-24
**Priority:** HIGH
**Status:** RAG system complete, moving to scraper + agentic features

---

## Vision Overview

### Critical Architecture Note: Two Separate Flows

This system handles **TWO DIFFERENT USE CASES** with completely different authentication flows:

#### Flow 1: Scholarship Indexing (Developer/Admin Only)
- **Who**: Developer (admin user)
- **When**: One-time setup per portal, then periodic re-scraping
- **Purpose**: Build index of available scholarships
- **Method**: Puppeteer with visible browser, manual login, capture session
- **Storage**: Sessions stored for scheduled scraping
- **Output**: Scholarship data (name, deadline, requirements, etc.) stored in database

#### Flow 2: End-User Application Submission (Regular Users)
- **Who**: Regular Scholarships Plus users
- **When**: When user wants to submit an application
- **Purpose**: Submit completed application to portal
- **Challenge**: How to capture user's portal session without browser extension?
- **Method**: **TO BE DETERMINED** (see "Client-Side Session Capture Options" below)

---

### Phase 1: Scholarship Index (Developer Flow)

**Purpose**: Build and maintain scholarship index for agentic chat

1. **One-time setup per scholarship portal** (DEVELOPER ONLY)
   - Developer runs script locally
   - Puppeteer opens visible browser to portal
   - Developer logs in manually (handles 2FA/captchas naturally)
   - System captures session cookies
   - Future scrapes use saved session

2. **Automated Scraping**
   - Run on schedule (daily/weekly) via cron job
   - Extract: name, deadline, amount, requirements, application fields
   - Store in database for agentic chat to reference

### Phase 2: Agentic Chat (Powered by Index)

**Purpose**: Help users complete scholarship applications using RAG

1. **User selects scholarship** (from our index)
2. **Agent knows requirements** (from Phase 1 scraping)
3. **For each requirement:**
   - RAG search finds relevant info from user's past essays
   - Agent suggests content
   - User accepts/edits/rejects
4. **Submission Flow** (SEE CHALLENGE BELOW):
   - Need to capture user's portal session somehow
   - Agent submits completed application using captured session

---

## Critical Challenge: Client-Side Session Capture

### The Problem

Regular users need to submit applications to scholarship portals. The agent (Puppeteer) needs to:
1. Log into the portal on behalf of the user
2. Fill out the application form
3. Submit it

**But**: Puppeteer runs server-side. How do we get the user's portal session cookies?

### Constraint: No Browser Extension (User Preference)

User explicitly stated:
> "Hmm an extension could work, but I rather they not have to go through the trouble of installing one. It's another layer of trust that I don't want to count on. We'll keep it as last resort."

### Options Analysis

#### Option 1: Popup Window with postMessage (Recommended)

**Flow:**
1. User clicks "Start Submission" in Scholarships Plus app
2. App opens portal URL in popup window via `window.open()`
3. User logs into portal in popup (normal browser flow)
4. Portal page includes injected script (via userscript/monkey patch) that:
   - Detects successful login
   - Extracts `document.cookie`
   - Sends cookies back to parent via `window.opener.postMessage()`
5. Scholarships Plus app receives cookies, closes popup
6. App sends cookies to server, stores in `PortalSession`
7. Puppeteer uses cookies for automated submission

**Pros:**
- No browser extension required
- Users log in with their own browser (familiar UX)
- Works with 2FA, MFA, captchas naturally

**Cons:**
- Requires injecting script into portal pages (userscript/monkey patch)
- Portal might change DOM structure, breaking cookie extraction
- Security: Users might be suspicious of "installing" something

**Implementation:**
```typescript
// In popup
const injectedScript = `
  (function() {
    // Wait for successful login (detect logout button disappearing)
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[href*="login"]')) {
        // Logged in!
        const cookies = document.cookie;
        window.opener.postMessage({
          type: 'portal_session',
          cookies: cookies,
          localStorage: JSON.stringify(localStorage)
        }, '*');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })();
`;

// In main app
window.addEventListener('message', (event) => {
  if (event.data.type === 'portal_session') {
    // Send to server
    fetch('/api/scrape/save-session', {
      method: 'POST',
      body: JSON.stringify({
        portal: 'nativeforward',
        cookies: event.data.cookies,
        localStorage: event.data.localStorage
      })
    });
  }
});
```

---

#### Option 2: Direct Credentials (Simple but Least Preferred)

**Flow:**
1. App asks user for portal username/password
2. User enters credentials in Scholarships Plus form
3. Puppeteer uses credentials to log in
4. System captures and stores session

**Pros:**
- Simple implementation
- No popup/iframe complexity
- Full control over login flow

**Cons:**
- Security: Storing credentials (even temporarily)
- 2FA/MFA issues: Puppeteer can't handle 2FA easily
- User trust: "Give us your Native Forward password?" = suspicious
- Credential rotation: Password changes break system

**Verdict**: User will likely reject this due to trust concerns.

---

#### Option 3: OAuth/API Token (If Portals Support It)

**Flow:**
1. Check if portal supports OAuth 2.0 or API tokens
2. If yes, integrate OAuth flow
3. User authorizes Scholarships Plus app via standard OAuth
4. App receives access token, stores in database
5. Puppeteer/HTTP client uses token for submissions

**Pros:**
- Industry standard
- No credential storage
- Built-in revocation
- Clean security model

**Cons:**
- Most scholarship portals DON'T support OAuth
- Need to implement OAuth per portal (if they even have it)
- Still need API for programmatic submission

**Investigation Needed**: Check if Native Forward, AISES, Cobell have OAuth/APIs.

---

#### Option 4: Browser Extension (Last Resort Only)

**Flow:**
1. User installs Scholarships Plus browser extension
2. Extension detects when user is on scholarship portal
3. User logs in normally
4. Extension extracts cookies and sends to Scholarships Plus app
5. Puppeteer uses cookies for submission

**Pros:**
- Clean cookie extraction (extensions have full access)
- Works with any portal
- Can detect login status automatically

**Cons:**
- User friction: "Install this extension"
- Trust barrier: "Why does this need access to my browser?"
- Maintenance: Chrome Web Store review process, updates
- User explicitly said "last resort"

**Verdict**: Only if all other options fail.

---

### Recommended Approach: **Option 1 (Popup + postMessage) + Fallback to Option 3**

**Phase 1**: Implement Option 1 (Popup + postMessage)
- Most viable without extension
- Users log in normally in their browser
- We inject script to extract cookies post-login

**Phase 2**: Investigate Option 3 (OAuth/API)
- Research each portal's API documentation
- If any support OAuth, prioritize that portal's integration
- Could be hybrid: OAuth for some, popup for others

**Phase 3**: If Options 1 & 3 fail, consider Option 4 (Extension)
- Only as last resort
- Requires user approval/trust

---

### Phase 3: End-User Submission Flow (Using Captured Session)

1. **User completes all requirements** in agentic chat
2. **Agent has all application data** ready
3. **User clicks "Submit Application"**
4. **System triggers session capture** (Option 1, 3, or 4)
5. **Session stored in database** (`PortalSession` for this user)
6. **Puppeteer launches** with user's session cookies
7. **Puppeteer fills and submits** application form
8. **Confirmation sent to user**

---

## Architecture: Two Separate Flows

### Flow 1: Scholarship Indexing (Developer/Admin)

```
┌─────────────────────────────────────────────────────────────┐
│                 DEVELOPER MACHINE (Local)                   │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Puppeteer Scraper Script                     │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ 1. Launch visible browser                         │  │ │
│  │  │ 2. Navigate to portal login                      │  │ │
│  │  │ 3. Wait for developer to manually login          │  │ │
│  │  │ 4. Capture cookies + localStorage                │  │ │
│  │  │ 5. Scrape scholarship data                       │  │ │
│  │  │ 6. Store scholarships in database                │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 DATABASE (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Scholarships │  │   Sessions   │  │   Essays +       │  │
│  │  (scraped)   │  │ (admin only) │  │   Chunks (RAG)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Flow 2: End-User Application Submission

```
┌─────────────────────────────────────────────────────────────┐
│                   USER BROWSER                              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │ Scholarships     │         │   Popup Window          │  │
│  │ Plus App         │────────▶│   (Portal Login)        │  │
│  │                  │ postMsg │ 1. User logs in        │  │
│  │ - Agentic Chat   │◀────────│ 2. Injected script     │  │
│  │ - RAG Search     │         │    extracts cookies     │  │
│  │ - Requirements   │         │ 3. postMessage back    │  │
│  └──────────────────┘         └─────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │ cookies
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 SERVER (Node.js/Remix)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │         /api/scrape/save-session                       │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ 1. Receive cookies from popup                    │  │ │
│  │  │ 2. Store in PortalSession (per-user)             │  │ │
│  │  │ 3. Trigger Puppeteer submission                  │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Puppeteer Submission (Headless)                │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │ 1. Launch headless browser                       │  │ │
│  │  │ 2. Load user's session cookies                   │  │ │
│  │  │ 3. Navigate to application form                  │  │ │
│  │  │ 4. Fill fields with completed requirements       │  │ │
│  │  │ 5. Submit form                                   │  │ │
│  │  │ 6. Return confirmation to user                   │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Part A: Developer Flow (Scholarship Indexing)

#### Step A1: Update Database Schema

**Add to `prisma/schema.prisma`:**

```prisma
// For storing developer's admin sessions (for indexing)
model AdminPortalSession {
  id              String   @id @default(cuid())
  portal          String   // nativeforward, aises, cobell
  cookies         Json     // Stored cookies
  localStorage    Json?    // Optional localStorage data
  lastValid       DateTime @default(now())
  expiresAt       DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([portal])
  @@index([expiresAt])
}

// For storing end-user sessions (for submission)
model PortalSession {
  id              String   @id @default(cuid())
  userId          String
  portal          String   // nativeforward, aises, cobell
  cookies         Json     // Stored cookies
  localStorage    Json?    // Optional localStorage data
  lastValid       DateTime @default(now())
  expiresAt       DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, portal])
  @@index([userId, portal])
  @@index([expiresAt])
}

// For storing scraped scholarship data
model ScrapedScholarship {
  id              String   @id @default(cuid())
  portal          String   // nativeforward, aises, cobell
  title           String
  description     String   @db.Text
  amount          Float?
  deadline        DateTime
  requirements    Json     // Array of requirement strings
  applicationUrl  String
  sourceUrl       String
  scrapedAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([portal, deadline])
  @@index([deadline])
}
```

---

#### Step A2: Developer Scraper Script (Admin Mode)

**File: `scripts/scrape-scholarships.ts`** (Standalone script for developer use)

```typescript
#!/usr/bin/env npx tsx
/**
 * Scholarship Indexing Script (DEVELOPER ONLY)
 *
 * Usage:
 *   npx tsx scripts/scrape-scholarships.ts nativeforward
 *   npx tsx scripts/scrape-scholarships.ts aises
 *   npx tsx scripts/scrape-scholarships.ts cobell
 *
 * This script:
 * 1. Launches visible browser
 * 2. Waits for developer to manually log in
 * 3. Captures session cookies
 * 4. Scrapes all scholarships from portal
 * 5. Stores in database
 */

import puppeteer from 'puppeteer';
import { prisma } from '~/db.server';

interface ScrapedScholarship {
  title: string;
  description: string;
  amount?: number;
  deadline: Date;
  requirements: string[];
  applicationUrl: string;
  sourceUrl: string;
}

interface ScraperConfig {
  portal: 'nativeforward' | 'aises' | 'cobell';
  loginUrl: string;
  scholarshipsUrl: string;
  selectors: {
    scholarshipCard: string;
    title: string;
    description?: string;
    amount?: string;
    deadline?: string;
    requirements?: string;
    applicationLink?: string;
  };
}

const SCRAPER_CONFIGS: Record<string, ScraperConfig> = {
  nativeforward: {
    portal: 'nativeforward',
    loginUrl: 'https://scholars.nativeforward.org/login',
    scholarshipsUrl: 'https://scholars.nativeforward.org/scholarships',
    selectors: {
      scholarshipCard: '.scholarship-card, [class*="scholarship"]',
      title: 'h3, h4, .title',
      description: '.description, .summary',
      amount: '.amount, .award',
      deadline: '.deadline, .due-date',
      requirements: '.requirements, .criteria',
      applicationLink: 'a[href*="apply"], a[href*="application"]'
    }
  },
  aises: {
    portal: 'aises',
    loginUrl: 'https://www.aises.org/login',
    scholarshipsUrl: 'https://www.aises.org/scholarships',
    selectors: {
      scholarshipCard: '.scholarship-item, [class*="scholarship"]',
      title: 'h3, h4, .title',
      description: '.description, .summary',
      amount: '.amount, .award-amount',
      deadline: '.deadline, .due-date',
      requirements: '.requirements, .criteria'
    }
  },
  cobell: {
    portal: 'cobell',
    loginUrl: 'https://cobellscholar.org/login',
    scholarshipsUrl: 'https://cobellscholar.org/scholarships',
    selectors: {
      scholarshipCard: '.scholarship, [class*="scholarship"]',
      title: 'h2, h3, .title',
      description: '.description, .about',
      amount: '.amount',
      deadline: '.deadline, .due-date',
      requirements: '.requirements'
    }
  }
};

class ScholarshipScraper {
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  private config: ScraperConfig;

  constructor(portal: string) {
    this.config = SCRAPER_CONFIGS[portal];
    if (!this.config) {
      throw new Error(`Unknown portal: ${portal}`);
    }
  }

  /**
   * Launch visible browser and capture admin session
   * DEVELOPER manually logs in, we capture the session
   */
  async oneTimeAdminLogin(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: false, // VISIBLE browser so developer can log in
      defaultViewport: { width: 1280, height: 800 }
    });

    this.page = await this.browser.newPage();

    // Navigate to login
    console.log(`Opening ${this.config.portal} login page...`);
    await this.page.goto(this.config.loginUrl, {
      waitUntil: 'networkidle2'
    });

    console.log('Please log in manually in the browser window...');
    console.log('Waiting for successful login (up to 5 minutes)...');

    // Wait for navigation after login (developer clicks login)
    await this.page.waitForNavigation({
      waitUntil: 'networkidle0',
      timeout: 300000 // 5 minutes
    }).catch(() => {
      // Some sites don't navigate after login
      console.log('No navigation detected, checking if logged in...');
    });

    // Capture cookies and localStorage
    const cookies = await this.page.cookies();
    const localStorage = await this.page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          data[key] = localStorage.getItem(key)!;
        }
      }
      return data;
    });

    // Store in AdminPortalSession (no userId - admin only)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.adminPortalSession.upsert({
      where: { portal: this.config.portal },
      update: {
        cookies,
        localStorage,
        lastValid: new Date(),
        expiresAt
      },
      create: {
        portal: this.config.portal,
        cookies,
        localStorage,
        lastValid: new Date(),
        expiresAt
      }
    });

    console.log('Admin session captured successfully!');
  }

  /**
   * Load stored admin session and scrape scholarships
   */
  async scrapeWithAdminSession(): Promise<ScrapedScholarship[]> {
    // Retrieve stored admin session
    const session = await prisma.adminPortalSession.findUnique({
      where: { portal: this.config.portal }
    });

    if (!session || new Date(session.expiresAt) < new Date()) {
      throw new Error(`No valid admin session for ${this.config.portal}. Please run login again.`);
    }

    // Launch browser (can be headless for scraping)
    this.browser = await puppeteer.launch({
      headless: true, // Headless for automated scraping
      defaultViewport: { width: 1280, height: 800 }
    });

    this.page = await this.browser.newPage();

    // Restore cookies
    await this.page.setCookie(...session.cookies);

    // Restore localStorage if available
    if (session.localStorage) {
      await this.page.evaluate((data) => {
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(key, value as string);
        }
      }, session.localStorage);
    }

    // Navigate to scholarships page
    console.log(`Navigating to ${this.config.scholarshipsUrl}...`);
    await this.page.goto(this.config.scholarshipsUrl, {
      waitUntil: 'networkidle0'
    });

    // Check if still logged in
    const isLoggedIn = await this.page.evaluate(() => {
      return !document.querySelector('[href*="login"]');
    });

    if (!isLoggedIn) {
      await this.browser.close();
      throw new Error(`Admin session expired for ${this.config.portal}. Please login again.`);
    }

    // Extract scholarship data
    console.log('Extracting scholarship data...');
    const scholarships = await this.extractScholarships();

    // Update lastValid timestamp
    await prisma.adminPortalSession.update({
      where: { portal: this.config.portal },
      data: { lastValid: new Date() }
    });

    await this.browser.close();

    return scholarships;
  }

  /**
   * Extract scholarship data from page
   */
  private async extractScholarships(): Promise<ScrapedScholarship[]> {
    const scholarships = await this.page.evaluate((config) => {
      const results: ScrapedScholarship[] = [];
      const cards = document.querySelectorAll(config.scholarshipCard);

      cards.forEach(card => {
        const titleEl = card.querySelector(config.title);
        const title = titleEl?.textContent?.trim();

        if (title) {
          results.push({
            title,
            description: card.querySelector(config.description || '.description')?.textContent?.trim() || '',
            amount: card.querySelector(config.amount || '.amount')?.textContent?.trim() || '',
            deadline: card.querySelector(config.deadline || '.deadline')?.textContent?.trim() || '',
            requirements: Array.from(card.querySelectorAll(config.requirements || '.requirements'))
              .map(r => r.textContent?.trim())
              .filter(Boolean) as string[],
            applicationUrl: card.querySelector(config.applicationLink || 'a[href*="apply"]')?.getAttribute('href') || '',
            sourceUrl: window.location.href
          });
        }
      });

      return results;
    }, this.config.selectors);

    return scholarships.map(s => ({
      ...s,
      source: this.config.portal
    }));
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}

// CLI
async function main() {
  const portal = process.argv[2];

  if (!portal || !SCRAPER_CONFIGS[portal]) {
    console.error('Usage: npx tsx scripts/scrape-scholarships.ts <nativeforward|aises|cobell>');
    process.exit(1);
  }

  const scraper = new ScholarshipScraper(portal);

  try {
    // Check if we have a valid session
    const existingSession = await prisma.adminPortalSession.findUnique({
      where: { portal }
    });

    if (!existingSession || new Date(existingSession.expiresAt) < new Date()) {
      // Need to login first
      console.log('No valid session found. Starting login flow...');
      await scraper.oneTimeAdminLogin();
    }

    // Scrape scholarships
    console.log('Starting scholarship scrape...');
    const scholarships = await scraper.scrapeWithAdminSession();

    // Store in database
    console.log(`Found ${scholarships.length} scholarships. Storing in database...`);

    for (const scholarship of scholarships) {
      await prisma.scrapedScholarship.upsert({
        where: {
          id: scholarship.sourceUrl // Use sourceUrl as unique ID
        },
        update: {
          title: scholarship.title,
          description: scholarship.description,
          amount: scholarship.amount ? parseFloat(scholarship.amount) : null,
          deadline: new Date(scholarship.deadline),
          requirements: { requirements: scholarship.requirements },
          applicationUrl: scholarship.applicationUrl,
          updatedAt: new Date()
        },
        create: {
          portal: scholarship.source,
          title: scholarship.title,
          description: scholarship.description,
          amount: scholarship.amount ? parseFloat(scholarship.amount) : null,
          deadline: new Date(scholarship.deadline),
          requirements: { requirements: scholarship.requirements },
          applicationUrl: scholarship.applicationUrl,
          sourceUrl: scholarship.sourceUrl
        }
      });
    }

    console.log(`Successfully stored ${scholarships.length} scholarships!`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await scraper.close();
    await prisma.$disconnect();
  }
}

main();
```

---

### Part B: End-User Submission Flow

#### Step B1: Session Capture API (Popup + postMessage)

**File: `app/routes/api.scrape.save-session.tsx`**

```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

interface SaveSessionRequest {
  portal: string;
  cookies: string;
  localStorage?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { portal, cookies, localStorage }: SaveSessionRequest = await request.json();

  // Parse cookie string into array
  const cookieArray = cookies.split(';').map(cookie => {
    const [name, value] = cookie.trim().split('=');
    return {
      name,
      value,
      domain: new URL(request.url).hostname,
      path: '/'
    };
  });

  // Store in PortalSession (per-user)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for user sessions

  await prisma.portalSession.upsert({
    where: {
      userId_portal: {
        userId,
        portal
      }
    },
    update: {
      cookies: cookieArray,
      localStorage: localStorage ? JSON.parse(localStorage) : null,
      lastValid: new Date(),
      expiresAt
    },
    create: {
      userId,
      portal,
      cookies: cookieArray,
      localStorage: localStorage ? JSON.parse(localStorage) : null,
      lastValid: new Date(),
      expiresAt
    }
  });

  return json({ success: true });
}
```

---

#### Step B2: Client-Side Session Capture Component

**File: `app/components/portal-session-capture.tsx`**

```typescript
import { useState, useEffect, useRef } from 'react';
import { useFetcher } from '@remix-run/react';

interface PortalSessionCaptureProps {
  portal: string;
  portalUrl: string;
  onSessionCaptured: () => void;
}

const PORTAL_CONFIGS: Record<string, { url: string; loginSelector: string }> = {
  nativeforward: {
    url: 'https://scholars.nativeforward.org/login',
    loginSelector: '[href*="logout"], [class*="user"]' // Detect successful login
  },
  aises: {
    url: 'https://www.aises.org/login',
    loginSelector: '[href*="logout"]'
  },
  cobell: {
    url: 'https://cobellscholar.org/login',
    loginSelector: '[href*="logout"]'
  }
};

export function PortalSessionCapture({ portal, portalUrl, onSessionCaptured }: PortalSessionCaptureProps) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const fetcher = useFetcher();
  const popupRef = useRef<Window | null>(null);

  // Listen for messages from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (!event.origin.includes(window.location.hostname)) {
        return;
      }

      if (event.data.type === 'portal_session') {
        // Send to server
        fetcher.submit(
          {
            portal,
            cookies: event.data.cookies,
            localStorage: event.data.localStorage
          },
          {
            method: 'post',
            action: '/api/scrape/save-session'
          }
        );

        setStatus('success');
        setPopupOpen(false);
        popupRef.current?.close();
        onSessionCaptured();
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [portal, fetcher, onSessionCaptured]);

  const openPopup = () => {
    const config = PORTAL_CONFIGS[portal];
    const popup = window.open(
      config.url,
      'portal_login',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );

    if (popup) {
      popupRef.current = popup;
      setPopupOpen(true);
      setStatus('waiting');

      // Inject script to extract cookies after login
      const injectedScript = `
        (function() {
          console.log('Scholarships Plus session capture loaded');

          // Wait for successful login
          const observer = new MutationObserver(() => {
            const logoutButton = document.querySelector('${config.loginSelector}');
            if (logoutButton) {
              // User is logged in!
              console.log('Login detected, extracting cookies...');

              // Extract cookies
              const cookies = document.cookie;
              const localStorageData = JSON.stringify(localStorage);

              // Send to parent
              window.opener.postMessage({
                type: 'portal_session',
                cookies: cookies,
                localStorage: localStorageData
              }, '*');

              observer.disconnect();
            }
          });

          observer.observe(document.body, { childList: true, subtree: true });
        })();
      `;

      // Inject script after page loads
      popup.addEventListener('load', () => {
        popup.document.head.appendChild(
          Object.assign(document.createElement('script'), {
            textContent: injectedScript
          })
        );
      });

      // Cleanup if popup is closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setPopupOpen(false);
          if (status === 'waiting') {
            setStatus('error');
          }
        }
      }, 1000);
    }
  };

  return (
    <div className="portal-session-capture">
      {status === 'idle' && (
        <button
          onClick={openPopup}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Connect {portal} Account
        </button>
      )}

      {status === 'waiting' && (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span>Waiting for you to log in to {portal}...</span>
        </div>
      )}

      {status === 'success' && (
        <div className="text-green-600">
          ✅ {portal} connected successfully!
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-red-600 mb-2">Connection cancelled or failed.</p>
          <button
            onClick={openPopup}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
```

---

#### Step B3: Puppeteer Submission (Using User's Session)

**File: `app/lib/scrapers/puppeteer-submission.ts`**

```typescript
import puppeteer from 'puppeteer';
import { prisma } from '~/db.server';

interface SubmissionData {
  scholarshipId: string;
  portal: string;
  applicationUrl: string;
  fields: Record<string, string>; // Field name → value mapping
}

interface SubmissionConfig {
  portal: 'nativeforward' | 'aises' | 'cobell';
  selectors: {
    // Field selectors for each portal
    [fieldName: string]: string; // e.g., '.input-name', '#essay-text'
  };
}

const SUBMISSION_CONFIGS: Record<string, SubmissionConfig> = {
  nativeforward: {
    portal: 'nativeforward',
    selectors: {
      // Example selectors - will need to be determined by inspecting actual form
      firstName: '#firstName, [name="firstName"]',
      lastName: '#lastName, [name="lastName"]',
      email: '#email, [name="email"]',
      essay: '#essay, [name="essay"], textarea',
      submitButton: 'button[type="submit"], input[type="submit"]'
    }
  },
  // Add other portals...
};

export class PuppeteerSubmitter {
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  private config: SubmissionConfig;

  constructor(portal: string) {
    this.config = SUBMISSION_CONFIGS[portal];
    if (!this.config) {
      throw new Error(`Unknown portal: ${portal}`);
    }
  }

  /**
   * Submit application using user's session
   */
  async submit(userId: string, data: SubmissionData): Promise<{ success: boolean; message?: string; error?: string }> {
    // Retrieve user's session
    const session = await prisma.portalSession.findUnique({
      where: {
        userId_portal: {
          userId,
          portal: this.config.portal
        }
      }
    });

    if (!session || new Date(session.expiresAt) < new Date()) {
      return {
        success: false,
        error: `No valid session for ${this.config.portal}. Please connect your account again.`
      };
    }

    try {
      // Launch headless browser
      this.browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 1280, height: 800 }
      });

      this.page = await this.browser.newPage();

      // Restore user's session cookies
      await this.page.setCookie(...session.cookies);

      // Restore localStorage if available
      if (session.localStorage) {
        await this.page.evaluate((data) => {
          for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value as string);
          }
        }, session.localStorage);
      }

      // Navigate to application page
      await this.page.goto(data.applicationUrl, {
        waitUntil: 'networkidle0'
      });

      // Check if still logged in
      const isLoggedIn = await this.page.evaluate(() => {
        return !document.querySelector('[href*="login"]');
      });

      if (!isLoggedIn) {
        await this.browser.close();
        return {
          success: false,
          error: 'Session expired. Please connect your account again.'
        };
      }

      // Fill out form fields
      for (const [fieldName, value] of Object.entries(data.fields)) {
        const selector = this.config.selectors[fieldName];
        if (!selector) {
          console.warn(`No selector found for field: ${fieldName}`);
          continue;
        }

        await this.page.waitForSelector(selector, { timeout: 5000 }).catch(() => {
          console.warn(`Field not found: ${fieldName} (${selector})`);
        });

        // Try to find input with selector
        const input = await this.page.$(selector);
        if (input) {
          await input.evaluate((el, val) => {
            (el as HTMLInputElement | HTMLTextAreaElement).value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, value);
        }
      }

      // Submit form
      const submitButton = await this.page.$(this.config.selectors.submitButton);
      if (submitButton) {
        await submitButton.click();
        await this.page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {
          // Some forms don't navigate after submit
        });
      }

      // Check for success message or confirmation
      const submitted = await this.page.evaluate(() => {
        return document.body.textContent?.includes('submitted') ||
               document.body.textContent?.includes('received') ||
               document.body.textContent?.includes('thank you');
      });

      await this.browser.close();

      if (submitted) {
        return {
          success: true,
          message: 'Application submitted successfully!'
        };
      } else {
        return {
          success: false,
          error: 'Submission could not be verified. Please check manually.'
        };
      }
    } catch (error) {
      await this.browser?.close();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Submission failed'
      };
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
```

---

### Part C: Agentic Chat (Powered by Scholarship Index)

#### Step C1: Agentic Chat API

**File: `app/routes/api.chat.agentic.tsx`**

```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { searchRelevantChunks } from "~/lib/embeddings.server";

interface ChatRequest {
  message: string;
  scholarshipId?: string;
  context: {
    step: string;
    scholarshipName?: string;
    requirements?: string[];
    completedRequirements?: Record<string, string>;
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { message, context }: ChatRequest = await request.json();

  // Simple flow state machine
  switch (context.step) {
    case 'start': {
      // User just started chat - list available scholarships
      const scholarships = await prisma.scrapedScholarship.findMany({
        take: 10,
        orderBy: { deadline: 'asc' }
      });

      return json({
        message: `Welcome! I can help you apply for scholarships. I have access to ${scholarships.length} scholarships.\n\nWhich scholarship would you like to apply for?`,
        context: { step: 'awaiting_selection' },
        options: scholarships.map(s => ({ id: s.id, title: s.title, deadline: s.deadline }))
      });
    }

    case 'awaiting_selection': {
      // User selected a scholarship
      const scholarship = await prisma.scrapedScholarship.findUnique({
        where: { id: message }
      });

      if (!scholarship) {
        return json({
          message: "I couldn't find that scholarship. Please try again.",
          context
        });
      }

      const requirements = scholarship.requirements as any;
      const requirementList = requirements?.requirements || [];

      return json({
        message: `Great choice! **${scholarship.title}** is due ${new Date(scholarship.deadline).toLocaleDateString()}.\n\nHere are the requirements:\n${requirementList.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nLet's go through these one by one. I'll search your past essays for relevant content.\n\n**Requirement 1:** ${requirementList[0]}\n\nSearching your essays...`,
        context: {
          step: 'processing_requirements',
          scholarshipId: scholarship.id,
          scholarshipName: scholarship.title,
          portal: scholarship.portal,
          applicationUrl: scholarship.applicationUrl,
          requirements: requirementList,
          currentRequirement: 0,
          completedRequirements: {}
        }
      });
    }

    case 'processing_requirements': {
      const { requirements, currentRequirement, completedRequirements, scholarshipId, portal, applicationUrl } = context;

      if (currentRequirement >= requirements.length) {
        // All requirements processed!
        return json({
          message: "✅ All requirements gathered! Here's what we have:\n\n" +
            Object.entries(completedRequirements)
              .map(([req, content]) => `**${req}:**\n${content}`)
              .join('\n\n'),
          context: {
            step: 'ready_to_submit',
            scholarshipId,
            scholarshipName: context.scholarshipName,
            portal,
            applicationUrl,
            completedRequirements
          }
        });
      }

      // Search for relevant content for current requirement
      const currentReqText = requirements[currentRequirement];
      const chunks = await searchRelevantChunks(userId, currentReqText, 3);

      let suggestedContent = '';

      if (chunks.length > 0) {
        const formattedChunks = chunks.map(c =>
          `- From "${c.metadata.essayTitle}":\n  "${c.content.substring(0, 200)}..."`
        ).join('\n\n');

        suggestedContent = `I found some relevant content from your past essays:\n\n${formattedChunks}\n\n`;
        suggestedContent += `Based on this, here's my suggestion for **${currentReqText}**:\n\n`;
        suggestedContent += `[AI would generate a response based on the chunks]\n\n`;
      } else {
        suggestedContent = `I couldn't find directly relevant content. Let's craft something fresh for **${currentReqText}**.\n\n`;
      }

      suggestedContent += `Does this work for you? (yes/edit/no)`;

      return json({
        message: suggestedContent,
        context: {
          ...context,
          currentRequirement: currentRequirement,
          currentChunks: chunks
        }
      });
    }

    case 'ready_to_submit': {
      return json({
        message: `Ready to submit to ${context.scholarshipName}! \n\nYou'll need to connect your ${context.portal} account first so I can submit on your behalf.`,
        context: {
          ...context,
          step: 'awaiting_portal_connection'
        }
      });
    }

    case 'awaiting_portal_connection': {
      // This would be triggered after PortalSessionCapture component succeeds
      return json({
        message: "Account connected! Submitting your application now...",
        context: {
          ...context,
          step: 'submitting'
        }
      });
    }

    default:
      return json({
        message: "I'm not sure what to do next. Could you rephrase that?",
        context: { step: 'start' }
      });
  }
}
```

---

### Step 5: Submission API Endpoint

**File: `app/routes/api.submission.submit.tsx`**

```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { PuppeteerSubmitter } from "~/lib/scrapers/puppeteer-submission";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { scholarshipId, portal, applicationUrl, fields } = await request.json();

  const submitter = new PuppeteerSubmitter(portal);

  try {
    const result = await submitter.submit(userId, {
      scholarshipId,
      portal,
      applicationUrl,
      fields
    });

    return json(result);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Submission failed'
    }, { status: 500 });
  } finally {
    await submitter.close();
  }
}
```

---

## Key Design Decisions

### 1. Two Separate Flows
- **Developer Flow**: Admin-only script for indexing scholarships
- **End-User Flow**: Popup-based session capture for submission
- Completely separate authentication models

### 2. No Browser Extension (User Preference)
- Uses popup + postMessage for session capture
- Users log in with their own browser
- Injected script extracts cookies after login

### 3. Session Persistence
- Admin sessions: 30 days (for periodic re-scraping)
- User sessions: 7 days (for submission window)
- Automatic expiry with re-auth prompts

### 4. Scholarship Index Powers Agentic Chat
- Agent knows requirements upfront (from scraping)
- RAG searches user's essays for relevant content
- User confirms/edits each requirement before submission

---

## Next Steps

### Phase 1: Developer Scraping (Immediate)
1. ✅ Update database schema (AdminPortalSession, PortalSession, ScrapedScholarship)
2. ✅ Install Puppeteer (`npm install puppeteer`)
3. ✅ Create `scripts/scrape-scholarships.ts`
4. ✅ Test with Native Forward (first portal)

### Phase 2: End-User Session Capture (After Indexing Works)
5. ✅ Create `/api/scrape/save-session` endpoint
6. ✅ Create `PortalSessionCapture` component
7. ✅ Test popup + postMessage flow

### Phase 3: Agentic Chat + Submission (After Session Capture Works)
8. ✅ Create agentic chat API (`/api/chat/agentic`)
9. ✅ Create `PuppeteerSubmitter` class
10. ✅ Create submission API (`/api/submission/submit`)
11. ✅ Test full flow: chat → capture → submit

---

## Testing Checklist

### Developer Scraping
- [ ] Run `npx tsx scripts/scrape-scholarships.ts nativeforward`
- [ ] Verify admin session stored in database
- [ ] Verify scholarships scraped and stored
- [ ] Test re-running (should use existing session)

### End-User Session Capture
- [ ] Test popup opens correctly
- [ ] Test login detection works
- [ ] Test cookies extracted via postMessage
- [ ] Verify session stored per-user in database

### Agentic Chat
- [ ] Test scholarship selection
- [ ] Test requirement processing with RAG
- [ ] Test accept/edit/no responses
- [ ] Test session capture prompt

### Full Submission Flow
- [ ] Test PuppeteerSubmitter with real session
- [ ] Test form filling
- [ ] Test form submission
- [ ] Test error handling (expired sessions)
- [ ] Test referral flow (user as own referrer)

---

## Cron Job Setup (For Automatic Re-Scraping)

Add to `package.json`:

```json
{
  "scripts": {
    "scrape:scholarships": "tsx scripts/scrape-scholarships.ts nativeforward && tsx scripts/scrape-scholarships.ts aises && tsx scripts/scrape-scholarships.ts cobell"
  }
}
```

Cron expression (run daily at 2 AM):
```
0 2 * * * cd /path/to/scholarships-plus && npm run scrape:scholarships
```

---

## Security Considerations

### Cookie Storage
- Cookies stored encrypted in database (future enhancement)
- Sessions expire after 7-30 days
- Users can revoke sessions anytime

### postMessage Security
- Verify event.origin before accepting messages
- Use specific targetOrigin instead of '*'

### Puppeteer Security
- Run headless after session capture
- Close browser immediately after submission
- Don't log sensitive data

---

## Future Enhancements

1. **OAuth/API Integration**: If portals support OAuth, prioritize over popup flow
2. **Session Refresh**: Auto-refresh sessions before expiry
3. **Multi-Portal Support**: Easy config for new scholarship portals
4. **Submission History**: Track which scholarships user applied to
5. **Referral Workflow**: Separate flow for recommenders (to be implemented after testing)
