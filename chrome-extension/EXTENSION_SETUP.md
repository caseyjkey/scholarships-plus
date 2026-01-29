# Chrome Extension Setup Instructions

## Quick Start

### 1. Create Icons

Run the icon generation script:
```bash
cd chrome-extension/scripts
./create-icons.sh
```

Or install ImageMagick first:
```bash
sudo apt-get install imagemagick
```

If ImageMagick isn't available, create icons manually at https://icon.kitchen using:
- Background: Blue gradient (#3b82f6 → #8b5cf6)
- Emoji: ✨

### 2. Install Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `chrome-extension/` directory

### 3. Start Development Server

```bash
cd /home/trill/Development/scholarships-plus
npm run dev
```

### 4. Test

1. Navigate to a SmarterSelect application page
2. Check browser console for "Scholarships Plus: Detected portal"
3. You should see sparkle icons next to form fields
4. Click sparkle icons to fill fields
5. Click the extension icon to open the popup
6. Open sidebar to chat with the assistant

## Authentication

The extension uses JWT tokens for API authentication:

1. Log in to the web app at `http://localhost:3000`
2. The extension will automatically read your session cookie
3. API calls include the session cookie for authentication

## Development

### API Configuration

The extension uses `http://localhost:3000` as the API base URL. To change this:

- Update `CONFIG.apiBaseUrl` in:
  - `content.js`
  - `background.js`
  - `sidepanel.js`

### Chrome Extension APIs Used

- `chrome.cookies` - Read session cookies
- `chrome.tabs` - Track tab context
- `chrome.sidePanel` - Show sidebar
- `chrome.runtime` - Messaging between components

## Troubleshooting

### Extension won't load
- Check that all icon files exist: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- Check Chrome extensions page for errors

### API calls failing
- Ensure dev server is running: `npm run dev`
- Check console for CORS errors
- Verify `CONFIG.apiBaseUrl` is correct

### Sparkle icons not appearing
- Check you're on a known portal (smarterselect.com, webportalapp.com)
- Check browser console for errors
- Verify scholarship exists in database

## File Structure

```
chrome-extension/
├── manifest.json              # Extension config
├── background.js              # Service worker
├── content.js                 # Content script (sparkle icons)
├── content.css                # Sparkle icon styles
├── popup.html/js              # Extension popup
├── sidepanel.html/css/js      # Chat sidebar
├── icons/                     # Extension icons (16, 48, 128)
├── scripts/                   # Utility scripts
│   └── create-icons.sh        # Icon generation
├── README.md                  # This file
└── ICON_SETUP.md              # Detailed icon instructions
```
