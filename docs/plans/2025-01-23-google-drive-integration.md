# Google Drive Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google OAuth authentication and Google Drive file import, allowing users to sign in with Google and import essay files directly from Drive.

**Architecture:** Use remix-auth for OAuth flow, store tokens in GoogleCredential model (supporting multiple accounts per user), integrate Google Picker API for file selection, reuse existing text-extraction pipeline for imported files.

**Tech Stack:** remix-auth, remix-auth-oauth2, Prisma, Google Picker API, Google Drive API v3

**Estimated Time:** ~14 hours

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install remix-auth packages**

Run: `npm install remix-auth remix-auth-oauth2`

Expected output:
```
added 2 packages, and audited 1151 packages in 3s
```

**Step 2: Install crypto package for token encryption**

Run: `npm install crypto-js && npm install -D @types/crypto-js`

Expected output:
```
added 2 packages, and audited 1153 packages in 2s
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add remix-auth and crypto-js for Google OAuth"
```

---

## Task 2: Add Environment Variables

**Files:**
- Create: `.env.example` additions
- Modify: `.env` (local only, don't commit)

**Step 1: Add variables to .env.example**

Append to `.env.example`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/auth/google/callback"

# Token encryption
ENCRYPTION_KEY="generate-with-openssl-rand-base64-32"

# Google OAuth scopes (space-separated)
GOOGLE_OAUTH_SCOPES="openid profile email https://www.googleapis.com/auth/drive.readonly"
```

**Step 2: Update local .env**

Add the same variables to `.env` with placeholder values (user will replace with real credentials).

Generate encryption key: `openssl rand -base64 32`

**Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add Google OAuth environment variables"
```

---

## Task 3: Create GoogleCredential Prisma Model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add GoogleCredential model**

Add to `prisma/schema.prisma` after the User model:

```prisma
model GoogleCredential {
  id             String   @id @default(uuid())
  googleAccountId String  @unique
  email          String
  accessToken    String   @db.Text
  refreshToken   String   @db.Text
  expiresAt      DateTime
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId])
  @@index([googleAccountId])
}
```

**Step 2: Add relation to User model**

Add `googleCredentials` field to User model:

```prisma
model User {
  // ... existing fields ...

  googleCredentials GoogleCredential[]
}
```

**Step 3: Create migration**

Run: `npx prisma migrate dev --name add_google_credential`

Expected output:
```
✔ Generated Prisma Client
✔ The following migration has been created and applied:
migrations/XXXXXX_add_google_credential/migration.sql
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "schema: add GoogleCredential model for OAuth tokens"
```

---

## Task 4: Create Encryption Utility

**Files:**
- Create: `app/lib/encryption.server.ts`

**Step 1: Write encryption utility**

Create `app/lib/encryption.server.ts`:

```typescript
import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY must be set");

/**
 * Encrypt sensitive data (refresh tokens) at rest
 */
export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

/**
 * Decrypt sensitive data
 */
export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
```

**Step 2: Commit**

```bash
git add app/lib/encryption.server.ts
git commit -m "feat: add encryption utility for OAuth tokens"
```

---

## Task 5: Create Google OAuth Strategy

**Files:**
- Create: `app/lib/auth/google.server.ts`

**Step 1: Write Google OAuth strategy**

Create `app/lib/auth/google.server.ts`:

```typescript
import { redirect } from "@remix-run/node";
import { OAuth2Error, OAuth2Strategy } from "remix-auth-oauth2";

export interface GoogleProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export const googleStrategy = new OAuth2Strategy(
  {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectURI: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    scopes: process.env.GOOGLE_OAUTH_SCOPES?.split(" ") || [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    authorization: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
  },
  async ({ tokens }) => {
    // Fetch user profile from Google
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!response.ok) {
      throw new OAuth2Error("Failed to fetch user profile");
    }

    const profile: GoogleProfile = await response.json();

    // Return profile + tokens for verification/storage
    return {
      profile,
      tokens,
    };
  }
);

// Type for strategy verify callback return
export interface GoogleAuthResult {
  profile: GoogleProfile;
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
}
```

**Step 2: Commit**

```bash
git add app/lib/auth/google.server.ts
git commit -m "feat: add Google OAuth2 strategy"
```

---

## Task 6: Create Google Credential Server Model

**Files:**
- Create: `app/models/google-credential.server.ts`

**Step 1: Write credential model**

Create `app/models/google-credential.server.ts`:

```typescript
import { prisma } from "~/db.server";
import { encrypt, decrypt } from "~/lib/encryption.server";
import type { GoogleAuthResult } from "~/lib/auth/google.server";

/**
 * Get a user's Google credentials, refreshing if needed
 */
export async function getValidCredential(userId: string, googleAccountId: string) {
  const credential = await prisma.googleCredential.findUnique({
    where: { googleAccountId },
  });

  if (!credential) {
    throw new Error("Google credential not found");
  }

  if (credential.userId !== userId) {
    throw new Error("Credential does not belong to user");
  }

  // Check if token needs refresh
  if (credential.expiresAt <= new Date()) {
    return await refreshCredential(credential);
  }

  return credential;
}

/**
 * Refresh an expired access token
 */
async function refreshCredential(credential: any) {
  const refreshToken = decrypt(credential.refreshToken);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const data = await response.json();

  // Calculate expiry (Google tokens expire in 1 hour)
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return await prisma.googleCredential.update({
    where: { id: credential.id },
    data: {
      accessToken: data.access_token,
      expiresAt,
    },
  });
}

/**
 * Create or link a Google credential to a user
 */
export async function linkGoogleAccount(
  userId: string,
  authResult: GoogleAuthResult
) {
  const { profile, tokens } = authResult;

  // Calculate expiry
  const expiresAt = new Date(
    Date.now() + (tokens.expires_in || 3600) * 1000
  );

  // Upsert credential
  return await prisma.googleCredential.upsert({
    where: { googleAccountId: profile.id },
    create: {
      googleAccountId: profile.id,
      email: profile.email,
      accessToken: tokens.access_token,
      refreshToken: encrypt(tokens.refresh_token || ""),
      expiresAt,
      userId,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : undefined,
      expiresAt,
      userId,
    },
  });
}

/**
 * Get all Google accounts for a user
 */
export async function getUserGoogleAccounts(userId: string) {
  return await prisma.googleCredential.findMany({
    where: { userId },
    select: {
      id: true,
      googleAccountId: true,
      email: true,
      createdAt: true,
    },
  });
}

/**
 * Unlink a Google account
 */
export async function unlinkGoogleAccount(
  userId: string,
  credentialId: string
) {
  return await prisma.googleCredential.deleteMany({
    where: { id: credentialId, userId },
  });
}

/**
 * Find user by Google account ID
 */
export async function findUserByGoogleAccount(googleAccountId: string) {
  const credential = await prisma.googleCredential.findUnique({
    where: { googleAccountId },
    include: { user: true },
  });

  return credential?.user || null;
}

/**
 * Find user by Google email
 */
export async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email },
  });
}

/**
 * Get current access token for API calls
 */
export async function getAccessToken(
  userId: string,
  googleAccountId: string
): Promise<string> {
  const credential = await getValidCredential(userId, googleAccountId);
  return credential.accessToken;
}
```

**Step 2: Commit**

```bash
git add app/models/google-credential.server.ts
git commit -m "feat: add Google credential model with token refresh"
```

---

## Task 7: Create Remix Auth Configuration

**Files:**
- Create: `app/lib/auth/auth.server.ts`
- Modify: `app/session.server.ts`

**Step 1: Create auth server**

Create `app/lib/auth/auth.server.ts`:

```typescript
import { prisma } from "~/db.server";
import { sessionStorage } from "~/session.server";
import { googleStrategy } from "./google.server";
import {
  findUserByGoogleAccount,
  findUserByEmail,
  linkGoogleAccount,
} from "~/models/google-credential.server";
import { createUser, getUserById } from "~/models/user.server";
import { Authenticator } from "remix-auth";

// Create authenticator instance
export const authenticator = new Authenticator(sessionStorage);

// Add Google OAuth strategy
authenticator.use(googleStrategy, "google");

/**
 * Verify and create session after Google OAuth
 */
export async function verifyGoogleAccount(authResult: any) {
  const { profile } = authResult;

  // 1. Check if Google account already linked
  const existingByGoogle = await findUserByGoogleAccount(profile.id);
  if (existingByGoogle) {
    return existingByGoogle;
  }

  // 2. Check if email matches existing user (link accounts)
  const existingByEmail = await findUserByEmail(profile.email);
  if (existingByEmail) {
    await linkGoogleAccount(existingByEmail.id, authResult);
    return existingByEmail;
  }

  // 3. Create new user
  const newUser = await createUser({
    email: profile.email,
    password: "", // No password for OAuth-only users
    name: profile.name,
  });

  // Link Google account
  await linkGoogleAccount(newUser.id, authResult);

  return newUser;
}
```

**Step 2: Update session.server.ts for remix-auth compatibility**

Check `app/session.server.ts` - ensure sessionStorage exports are compatible.

Add remix-auth session storage:

```typescript
// Add to app/session.server.ts
import { createCookieSessionStorage } from "@remix-run/node";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "default-secret"],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
```

**Step 3: Commit**

```bash
git add app/lib/auth/auth.server.ts app/session.server.ts
git commit -m "feat: add remix-auth configuration"
```

---

## Task 8: Create OAuth Routes

**Files:**
- Create: `app/routes/auth.google.tsx`
- Create: `app/routes/auth.google.callback.tsx`
- Create: `app/routes/auth.logout.tsx`

**Step 1: Create Google OAuth initiate route**

Create `app/routes/auth.google.tsx`:

```typescript
import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { authenticator } from "~/lib/auth/auth.server";

export async function loader() {
  return redirect("/login");
}

export async function action({ request }: ActionFunctionArgs) {
  return await authenticator.authenticate("google", request);
}
```

**Step 2: Create OAuth callback route**

Create `app/routes/auth.google.callback.tsx`:

```typescript
import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { authenticator } from "~/lib/auth/auth.server";
import { verifyGoogleAccount } from "~/lib/auth/auth.server";
import { getSession, commitSession } from "~/session.server";
import { getUserById } from "~/models/user.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Get auth result from Google
  const authResult = await authenticator.authenticate("google", request);

  // Verify and get/create user
  const user = await verifyGoogleAccount(authResult);

  // Create session
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);

  return redirect("/", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return await loader({ request });
}
```

**Step 3: Create logout route**

Create `app/routes/auth.logout.tsx`:

```typescript
import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { destroySession, getSession } from "~/session.server";

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie");
  return redirect("/login", {
    headers: { "Set-Cookie": await destroySession(session) },
  });
}
```

**Step 4: Commit**

```bash
git add app/routes/auth.google.tsx app/routes/auth.google.callback.tsx app/routes/auth.logout.tsx
git commit -m "feat: add OAuth routes for Google sign-in"
```

---

## Task 9: Create Google Sign-In Button Component

**Files:**
- Create: `app/components/google-sign-in-button.tsx`

**Step 1: Create the component**

Create `app/components/google-sign-in-button.tsx`:

```typescript
import { Form } from "@remix-run/react";

interface GoogleSignInButtonProps {
  redirectTo?: string;
  className?: string;
}

export function GoogleSignInButton({
  redirectTo = "/auth/google/callback",
  className = "",
}: GoogleSignInButtonProps) {
  return (
    <Form action="/auth/google" method="post" className={className}>
      <input type="hidden" name="redirect" value={redirectTo} />
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span className="font-medium text-gray-700">
          Continue with Google
        </span>
      </button>
    </Form>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/google-sign-in-button.tsx
git commit -m "feat: add Google sign-in button component"
```

---

## Task 10: Update Login Page

**Files:**
- Modify: `app/routes/_index.tsx` or existing login route

**Step 1: Add Google sign-in button to login**

Find your login page (likely `app/routes/_index.tsx` or `app/routes/login.tsx`). Add the Google button below the existing login form:

```typescript
import { GoogleSignInButton } from "~/components/google-sign-in-button";

// Add this in the login form section, below the existing submit button:
<div className="mt-6">
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <div className="w-full border-t border-gray-300" />
    </div>
    <div className="relative flex justify-center text-sm">
      <span className="px-2 bg-white text-gray-500">Or continue with</span>
    </div>
  </div>

  <div className="mt-6">
    <GoogleSignInButton />
  </div>
</div>
```

**Step 2: Test login flow**

Run: `npm run dev`

Visit: http://localhost:3000

1. Click "Continue with Google"
2. Complete Google OAuth flow
3. Verify redirect and session creation

**Step 3: Commit**

```bash
git add app/routes/_index.tsx
git commit -m "feat: add Google sign-in option to login page"
```

---

## Task 11: Create Token API Endpoint

**Files:**
- Create: `app/routes/api.google.token.tsx`

**Step 1: Create token endpoint**

Create `app/routes/api.google.token.tsx`:

```typescript
import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getAccessToken, getUserGoogleAccounts } from "~/models/google-credential.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Get user's Google accounts
  const accounts = await getUserGoogleAccounts(userId);

  if (accounts.length === 0) {
    return json({ error: "No Google accounts linked" }, { status: 400 });
  }

  // Use first account (default)
  // TODO: Add UI to select which account to use
  const accessToken = await getAccessToken(userId, accounts[0].googleAccountId);

  return json({
    accessToken,
    email: accounts[0].email,
    googleAccountId: accounts[0].googleAccountId,
  });
}
```

**Step 2: Commit**

```bash
git add app/routes/api.google.token.tsx
git commit -m "feat: add API endpoint to get Google access token"
```

---

## Task 12: Create Google Picker Integration

**Files:**
- Modify: `app/components/cloud-picker.tsx`

**Step 1: Update cloud-picker with real Picker API**

Replace `app/components/cloud-picker.tsx`:

```typescript
import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";

interface CloudPickerProps {
  onFilesSelected: (files: File[]) => Promise<void>;
  disabled?: boolean;
}

declare global {
  interface Window {
    google: {
      picker: any;
    };
  }
}

export function CloudPicker({
  onFilesSelected,
  disabled = false,
}: CloudPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const tokenFetcher = useFetcher<{ accessToken?: string; error?: string }>();

  useEffect(() => {
    // Load Google Picker API when component mounts
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      window.google.load("picker", "1");
    };
    document.body.appendChild(script);
  }, []);

  const handleProviderSelect = async (provider: "google-drive" | "dropbox") => {
    if (provider === "google-drive") {
      await openGooglePicker();
    } else {
      alert("Dropbox integration is coming soon!");
    }
  };

  const openGooglePicker = async () => {
    setIsLoading(true);

    // Fetch access token
    tokenFetcher.load("/api/google/token");

    // Wait for token response (useEffect will handle when data arrives)
  };

  // Effect to open picker when token is ready
  useEffect(() => {
    if (
      tokenFetcher.data?.accessToken &&
      isLoading &&
      window.google?.picker
    ) {
      createPicker(tokenFetcher.data.accessToken);
    }
  }, [tokenFetcher.data, isLoading]);

  const createPicker = (accessToken: string) => {
    const picker = new window.google.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .addView(window.google.picker.ViewId.DOCS)
      .setMimeTypes(
        "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
      )
      .setCallback(pickerCallback)
      .build();

    picker.setVisible(true);
  };

  const pickerCallback = async (data: any) => {
    if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
      const docs = data[window.google.picker.Response.DOCUMENTS];

      // Download files server-side
      await downloadFiles(docs);
    }

    setIsOpen(false);
    setIsLoading(false);
  };

  const downloadFiles = async (docs: any[]) => {
    const fileIds = docs.map((doc) => doc[window.google.picker.Document.ID]);

    const response = await fetch("/api/google/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileIds }),
    });

    if (!response.ok) {
      alert("Failed to download files from Google Drive");
      return;
    }

    // The server will handle file processing and essay creation
    // Show success message
    alert(`Successfully imported ${fileIds.length} file(s) from Google Drive`);
  };

  return (
    <div className="relative">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={disabled}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">☁️</span>
            <span className="font-medium">Import from Cloud</span>
          </div>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Import from Cloud Storage
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsLoading(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-gray-600 text-sm">
                Select a cloud storage provider to import your essays from:
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleProviderSelect("google-drive")}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🔵</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Google Drive</div>
                    <div className="text-sm text-gray-500">
                      Import files from your Google Drive
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderSelect("dropbox")}
                  className="w-full flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📦</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Dropbox</div>
                    <div className="text-sm text-gray-500">
                      Coming soon
                    </div>
                  </div>
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">
                  🔒 Connected as {tokenFetcher.data?.email || "..."}
                </h4>
                <p className="text-sm text-blue-800">
                  Using your connected Google account for file access.
                </p>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-lg">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsLoading(false);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/cloud-picker.tsx
git commit -m "feat: integrate Google Picker API for Drive file selection"
```

---

## Task 13: Create Download Endpoint

**Files:**
- Create: `app/routes/api.google.download.tsx`

**Step 1: Create download endpoint**

Create `app/routes/api.google.download.tsx`:

```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getAccessToken } from "~/models/google-credential.server";
import { extractText } from "~/lib/text-extraction.server";
import { prisma } from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { fileIds } = await request.json();

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return json({ error: "Invalid file IDs" }, { status: 400 });
  }

  // Get access token (using first account for now)
  // TODO: Support multi-account selection
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { googleCredentials: { take: 1 } },
  });

  if (!user?.googleCredentials[0]) {
    return json({ error: "No Google account linked" }, { status: 400 });
  }

  const accessToken = await getAccessToken(
    userId,
    user.googleCredentials[0].googleAccountId
  );

  const results = [];

  for (const fileId of fileIds) {
    try {
      // Get file metadata
      const metadataResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch metadata for ${fileId}`);
      }

      const metadata = await metadataResponse.json();

      // Download file content
      const downloadResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!downloadResponse.ok) {
        throw new Error(`Failed to download ${fileId}`);
      }

      const buffer = await downloadResponse.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      // Create File object
      const file = new File([uint8Array], metadata.name, {
        type: metadata.mimeType,
      });

      // Extract text using existing utility
      const text = await extractText(file);

      // Create essay record
      const essay = await prisma.essay.create({
        data: {
          userId,
          essayPrompt: `Imported from Google Drive: ${metadata.name}`,
          body: text,
          essay: text,
        },
      });

      results.push({
        id: essay.id,
        name: metadata.name,
        success: true,
      });
    } catch (error) {
      results.push({
        id: fileId,
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      });
    }
  }

  return json({
    results,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
}
```

**Step 2: Commit**

```bash
git add app/routes/api.google.download.tsx
git commit -m "feat: add Google Drive file download endpoint"
```

---

## Task 14: Create Account Management Component

**Files:**
- Create: `app/components/google-account-manager.tsx`
- Create: `app/routes/api.google.accounts.tsx`
- Create: `app/routes/api.google.accounts.$id.tsx`

**Step 1: Create accounts list endpoint**

Create `app/routes/api.google.accounts.tsx`:

```typescript
import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getUserGoogleAccounts } from "~/models/google-credential.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const accounts = await getUserGoogleAccounts(userId);
  return json(accounts);
}
```

**Step 2: Create unlink endpoint**

Create `app/routes/api.google.accounts.$id.tsx`:

```typescript
import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { unlinkGoogleAccount } from "~/models/google-credential.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const credentialId = params.id;
  if (!credentialId) {
    return json({ error: "Missing credential ID" }, { status: 400 });
  }

  await unlinkGoogleAccount(userId, credentialId);

  return json({ success: true });
}
```

**Step 3: Create account manager component**

Create `app/components/google-account-manager.tsx`:

```typescript
import { useFetcher, useFetcherData } from "@remix-run/react";
import { useState, useEffect } from "react";

interface GoogleAccount {
  id: string;
  googleAccountId: string;
  email: string;
  createdAt: string;
}

export function GoogleAccountManager() {
  const accountsFetcher = useFetcher<GoogleAccount[]>();
  const unlinkFetcher = useFetcher();

  useEffect(() => {
    accountsFetcher.load("/api/google/accounts");
  }, []);

  const accounts = accountsFetcher.data || [];

  const handleUnlink = (credentialId: string) => {
    if (!confirm("Are you sure you want to unlink this Google account?")) {
      return;
    }

    unlinkFetcher.submit(
      {},
      {
        method: "DELETE",
        action: `/api/google/accounts/${credentialId}`,
      }
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Connected Google Accounts
      </h3>

      {accounts.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No Google accounts connected yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xl">🔵</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {account.email}
                  </div>
                  <div className="text-sm text-gray-500">
                    Connected {new Date(account.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleUnlink(account.id)}
                disabled={unlinkFetcher.state === "submitting"}
                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                Unlink
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add app/components/google-account-manager.tsx app/routes/api.google.accounts.tsx app/routes/api.google.accounts.$id.tsx
git commit -m "feat: add Google account management UI"
```

---

## Task 15: Testing & Integration

**Step 1: Set up Google Cloud project**

1. Go to https://console.cloud.google.com/
2. Create new project or select existing
3. Enable APIs:
   - Google Picker API
   - Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/auth/google/callback`
     - (Production) `https://yourdomain.com/auth/google/callback`
5. Copy Client ID and Client Secret to `.env`

**Step 2: Test complete flow**

Run: `npm run dev`

Test checklist:
- [ ] Sign in with Google works
- [ ] User account created correctly
- [ ] Token stored in database
- [ ] Google Picker opens
- [ ] File selection works
- [ ] File downloads correctly
- [ ] Essay created from Drive file
- [ ] Account management shows linked accounts
- [ ] Unlink account works

**Step 3: Update .env.example with instructions**

Add to top of `.env.example`:

```bash
# Google OAuth Setup:
# 1. Go to https://console.cloud.google.com/
# 2. Create OAuth 2.0 credentials (Web application)
# 3. Add redirect URI: http://localhost:3000/auth/google/callback
# 4. Enable Google Picker API and Google Drive API
```

**Step 4: Final commit**

```bash
git add .env.example
git commit -m "docs: add Google OAuth setup instructions"
```

---

## Task 16: Merge to Main

**Step 1: Switch to main**

```bash
cd /home/trill/Development/scholarships-plus
git checkout main
```

**Step 2: Merge feature branch**

```bash
git merge feature/google-drive-integration --no-ff -m "feat: complete Google Drive integration"
```

**Step 3: Prune worktree**

```bash
git worktree remove .worktrees/google-drive
git branch -d feature/google-drive-integration
```

**Step 4: Verify build**

```bash
npm run build
npm run test
```

---

## Summary

This plan implements:
- ✅ Google OAuth sign-in with remix-auth
- ✅ Multiple Google accounts per user
- ✅ Secure token storage with encryption
- ✅ Automatic token refresh
- ✅ Google Picker API integration
- ✅ Drive file import with text extraction
- ✅ Account management UI

**Next phase:** Export to Drive capability
