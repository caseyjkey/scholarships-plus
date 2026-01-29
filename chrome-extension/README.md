# Scholarships Plus Chrome Extension

## Installation (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select this directory: `chrome-extension/`

## Quick Start - Demo Page

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:3000/demo` (or port 3030)
3. You should see:
   - **Green banner**: "✨ Scholarships+ Extension Connected"
   - **Sparkle icons** (⭐ stars) next to form fields
   - **Status indicator**: Bottom right showing ready responses

## Sparkle Icon States

| State | Icon | Behavior |
|-------|------|----------|
| **Empty** | Grey star | No saved response - shakes red if clicked |
| **Ready** | Blue glowing star | Response available - click to fill! |
| **Loading** | Spinning amber star | Filling field with typewriter effect |
| **Filled** | Green star with ✓ | Successfully filled |

## Usage

### Filling Fields

1. Click any **glowing blue sparkle** (ready state)
2. Watch the field auto-fill with animated typewriter effect
3. Sparkle turns green with checkmark when complete

### Demo Mock Data

The demo page includes pre-filled responses for:
- **Personal**: Jane Doe, jane.doe@example.com
- **Academic**: 3.75 GPA, Junior, Computer Science
- **Essays**:
  - Leadership: CS Club president experience
  - Goals: Create AI for social good
  - Challenges: First-gen student journey
  - Community Service: Food bank & tutoring

## Development

### API Configuration

The extension uses `http://localhost:3000` as the API base URL.

To change this, update `CONFIG.apiBaseUrl` in:
- `content.js`
- `background.js`
- `sidepanel.js`

### Loading Changes

After making changes:
1. Go to `chrome://extensions/`
2. Click the refresh icon on "Scholarships Plus Assistant"
3. Reload the demo page

### File Structure

```
chrome-extension/
├── manifest.json       # Extension configuration
├── content.js          # Field detection & sparkle injection
├── content.css         # Sparkle styles & animations
├── background.js       # Service worker
├── popup.html/js       # Extension popup
├── sidepanel.html/js   # AI chat sidebar
└── icons/              # Extension icons
```

## Field Detection

The extension automatically:
1. Finds all form inputs (text, select, textarea, checkbox, radio)
2. Matches by `name`, `id`, or `data-ai-field` attribute
3. Fetches saved responses from API (or uses mock data for demo)
4. Adds sparkle icons with appropriate state

## SVG Sparkle Icon

The sparkle is a custom SVG star shape with 4 states:
- **Empty**: Grey (`#d1d5db`) - no data
- **Ready**: Blue (`#3b82f6`) with pulse glow animation
- **Loading**: Amber (`#f59e0b`) with spin animation
- **Filled**: Green (`#10b981`) with checkmark overlay

All states include:
- Hover scale effect (1.15x)
- Active press effect (0.95x)
- Tooltip on hover
- Smooth transitions

## Testing Checklist

- [ ] Sparkle icons appear on demo page
- [ ] Glowing blue sparkles indicate ready responses
- [ ] Clicking fills field with typewriter animation
- [ ] Sparkle turns green after filling
- [ ] Empty sparkles shake red when clicked
- [ ] Status indicator shows correct count
- [ ] Tooltips appear on hover
- [ ] Responsive on mobile (smaller icons, adjusted spacing)

## Permissions

- `activeTab` - Access current tab content
- `storage` - Store extension settings
- `cookies` - Sync cookies for session tracking
- `sidepanel` - Show sidebar UI
- `tabs` - Multi-tab context tracking

## Troubleshooting

### Extension not loading on demo page

**Check**: manifest.json includes your port:
```json
"matches": ["http://localhost:3000/*", "http://localhost:3030/*"]
```

### Sparkle icons not appearing

**Check**:
- Extension is enabled (not grayed out)
- Content script matches your URL
- Browser console for errors

**Try**:
- Refresh extension (click reload icon in chrome://extensions)
- Hard refresh page (Ctrl+Shift+R)
- Check console: `Scholarships Plus: Detected portal: demo`

### Fields not filling

**Check**:
- Field `name`/`id` matches mock data
- No console errors when clicking

**Try**:
- Click different sparkles
- Check network tab for API calls (non-demo)
