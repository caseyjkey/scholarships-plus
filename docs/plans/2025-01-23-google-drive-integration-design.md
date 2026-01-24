# Google Drive Integration Design

**Date:** 2025-01-23
**Status:** Approved
**Author:** Claude

## Overview

Add Google OAuth authentication and Google Drive file import capabilities to Scholarships Plus. Users can sign in with Google, link multiple Google accounts, and import essay files directly from Drive.

## Requirements

1. Google OAuth as a sign-in option (alongside existing email/password)
2. Full account linking - users can sign in with any linked method
3. Support multiple Google accounts per user
4. Import files from Google Drive using Picker API
5. Reuse existing text extraction pipeline for imported files
6. Foundation for future export to Drive capability

## Architecture

### Authentication Flow

Users can choose "Sign in with Google" on the login page. Remix-auth handles the OAuth dance:
1. Redirect to Google consent screen
2. User approves → Google redirects back with authorization code
3. Exchange code for tokens (access + refresh)
4. Fetch user's Google profile (ID, email, name)
5. Link or create user account
6. Create session and redirect to app

### Token Storage

OAuth tokens stored in `GoogleCredential` model (separate from User table):
- Access token (short-lived, 1 hour)
- Refresh token (long-lived)
- Expiry timestamp
- Google account ID and email

### Drive Import Flow

1. User clicks "Import from Drive" in essay uploader
2. Frontend requests current access token from `/api/google/token`
3. Server returns valid token (refreshing if needed)
4. Google Picker API opens with user's Drive files
5. User selects files → Picker returns file IDs
6. Frontend POSTs file IDs to `/api/google/download`
7. Server downloads files using Drive API
8. Files processed through existing text extraction pipeline
9. Essay records created as normal

## Database Schema

### New Model: GoogleCredential

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

### Modified Model: User

```prisma
model User {
  // ... existing fields ...

  googleCredentials GoogleCredential[] // New relation
}
```

### Migration Notes

- Additive migration - non-breaking
- No data migration needed
- Existing users continue with email/password
- Google auth available immediately after migration

## API Endpoints

### Authentication

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/google` | GET | Initiate Google OAuth flow |
| `/auth/google/callback` | GET | OAuth callback handler |
| `/auth/logout` | POST | Logout (clear session) |

### Google Integration

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/google/token` | GET | Get current access token | Required |
| `/api/google/download` | POST | Download files by ID | Required |
| `/api/google/accounts` | GET | List linked accounts | Required |
| `/api/google/accounts/:id` | DELETE | Unlink account | Required |

## Frontend Components

### New Components

- `GoogleSignInButton.tsx` - Sign in with Google button
- `GoogleAccountManager.tsx` - Manage linked accounts on settings page

### Modified Components

- `cloud-picker.tsx` - Replace alert with Picker API integration
- Login page - Add Google sign-in option
- Settings page - Add Google account management section

## Environment Variables

```bash
# Google OAuth
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/auth/google/callback"

# Security
ENCRYPTION_KEY="for-encrypting-refresh-tokens-at-rest" # Generate with: openssl rand -base64 32

# OAuth Scopes
GOOGLE_OAUTH_SCOPES="openid,profile,email,https://www.googleapis.com/auth/drive.readonly"
```

## Dependencies

```bash
npm install remix-auth remix-auth-oauth2
npm install -D @types/crypto-js
```

## Implementation Order

1. **Foundation** (2 hours)
   - Install dependencies
   - Create `GoogleCredential` Prisma model
   - Run migration
   - Add environment variables

2. **OAuth Setup** (3 hours)
   - Configure remix-auth with Google OAuth strategy
   - Create auth routes (`/auth/google`, `/auth/google/callback`)
   - Implement account linking logic
   - Build GoogleSignInButton component

3. **Token Management** (2 hours)
   - Create `/api/google/token` endpoint
   - Implement token refresh logic
   - Add middleware for token validation

4. **Drive Picker** (3 hours)
   - Load Google Picker API script
   - Replace placeholder in cloud-picker.tsx
   - Handle Picker callback
   - Create download endpoint (`/api/google/download`)

5. **Account Management** (2 hours)
   - Build GoogleAccountManager component
   - Add account list/unlink endpoints
   - Create settings page section

6. **Testing** (2 hours)
   - Test OAuth flow end-to-end
   - Test Drive file import
   - Test multiple account linking
   - Test token refresh

**Total Estimated Time:** ~14 hours

## Security Considerations

1. **Refresh Token Storage:** Encrypt at rest using AES-256 with key from `.env`
2. **Access Token Scope:** Request `drive.readonly` initially (minimal scope)
3. **Token Refresh:** Automatic refresh before expiry (1 hour lifetime)
4. **HTTPS Required:** OAuth redirects require HTTPS in production
5. **CSRF Protection:** remix-auth handles CSRF tokens automatically
6. **Session Security:** Use Remix's built-in session with secure, httpOnly cookies

## Future Enhancements

### Phase 2: Export to Drive
- Request `drive.file` scope (per-file access, not full Drive)
- Add "Save to Drive" button to essay editor
- Create `drive.file` resources on first export
- Store Drive file IDs in Essay model

### Phase 3: Real-time Sync
- Watch for changes in Drive files
- Auto-update essay content when source changes
- Add conflict resolution for concurrent edits

### Phase 4: Other Providers
- Dropbox integration (Dropbox Chooser API)
- OneDrive integration (Microsoft Graph API)
- Unified cloud picker UI

## References

- [remix-auth](https://github.com/sergiodxa/remix-auth)
- [Google Picker API](https://developers.google.com/picker/docs)
- [Google Drive API](https://developers.google.com/drive/api/v3/about-sdk)
- [OAuth 2.0 for Web Server Apps](https://developers.google.com/identity/protocols/oauth2/web-server)
