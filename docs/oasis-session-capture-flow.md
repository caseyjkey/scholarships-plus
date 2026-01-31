# OASIS Session Capture & Application Completion Flow

## Overview

This document describes the complete flow for capturing student OASIS sessions and using them to automatically complete scholarship applications.

## Architecture

```
┌─────────────────┐
│  Student logs    │
│  into your app   │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────┐
│  "Connect OASIS Account"    │
│  (Embedded browser window)  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Student logs into OASIS    │
│  (Manually + CAPTCHA)        │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  App captures session        │
│  (cookies, localStorage)     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Saved to PortalSession      │
│  (prisma.portalSession)      │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Agent loads session         │
│  (complete-application.py)  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Browser-Use Cloud Agent    │
│  - Loads saved cookies      │
│  - Fills forms naturally   │
│  - Submits application      │
└─────────────────────────────┘
```

## Bot Detection Strategy

### Where Detection Happens:
1. **Login Form** - CAPTCHA, rate limiting ✅ (Cloud handles)
2. **Application Forms** - Behavioral analysis, timing ✅ (Cloud handles)
3. **Throughout Session** - Fingerprinting, IP reputation ✅ (Cloud handles)

### When to Use Cloud Browser:

| Task | Browser Type | Why |
|------|-------------|-----|
| Scraping scholarship listings | Regular | Just reading, no forms |
| Discovering scholarships | Regular | Public websites |
| Completing applications | **Cloud** | Form submission needs human behavior |
| Filling out personal info | **Cloud** | Anti-fraud checks |

### Browser-Use Cloud Benefits:

- ✅ CAPTCHA automatic bypass
- ✅ Natural mouse movements
- ✅ Human-like typing patterns
- ✅ Real browser fingerprints
- ✅ IP reputation management
- ✅ Geolocation matching
- ✅ Session persistence across runs

## Setup

### 1. Get Browser-Use Cloud API Key

Visit: https://cloud.browser-use.com/new-api-key

Free tier includes $10 of credits (plenty for testing).

### 2. Add to Environment

```bash
# .env file
BROWSER_USE_API_KEY=your_cloud_api_key_here
OPENAI_API_KEY=your_openai_key_here
```

### 3. Test Session Capture

```bash
cd ~/Development/scholarships-plus
python3 scripts/extract-oasis-session.py
```

### 4. Test Application Completion

```bash
cd ~/Development/browser-use
source .venv/bin/activate

cd ~/Development/scholarships-plus

# List available scholarships
python scripts/complete-application.py --session-id SESSION_ID --list

# Complete specific application
python scripts/complete-application.py --session-id SESSION_ID --scholarship "Cobell Undergraduate Scholarship"
```

## API Endpoints

### POST /api/oasis.session
Save captured session cookies
```json
{
  "cookies": [...],
  "localStorage": {...},
  "sessionStorage": {...}
}
```

### GET /api/oasis.session/:sessionId
Retrieve saved session for agent use
```json
{
  "id": "...",
  "userId": "...",
  "portal": "oasis",
  "cookies": [...],
  "localStorage": {...},
  "sessionStorage": {...},
  "expiresAt": "2025-02-24T..."
}
```

## Frontend Components

### OASISSessionCapture
Modal with embedded iframe for OASIS login
- Opens OASIS login in iframe
- Captures cookies after login
- Saves to database

### ConnectOasisButton
Button to trigger session capture flow
- Shows "Connect OASIS Account" when not linked
- Shows "OASIS Connected" when linked

## Security Considerations

1. **Session Expiration**: Sessions expire after 30 days
2. **User Ownership**: Sessions are tied to userId
3. **HTTPS Only**: Always use HTTPS for session transport
4. **Cookie Security**: Mark sensitive cookies as HttpOnly, Secure
5. **Storage Encryption**: Consider encrypting stored sessions

## Troubleshooting

### Session Not Working
1. Check expiration date in PortalSession table
2. Verify cookies are being saved correctly
3. Ensure same domain (webportalapp.com vs aises.awardspring.com)
4. Check browser console for cookie errors

### Cloud Browser Issues
1. Verify BROWSER_USE_API_KEY is set
2. Check credit balance at cloud.browser-use.com
3. Ensure API key has proper permissions

### CAPTCHA Still Appearing
With Cloud Browser, CAPTCHA should be automatically bypassed. If not:
1. Verify Cloud is being used (`use_cloud=True`)
2. Check Cloud status (may be temporarily down)
3. Fallback: Manual session extraction
