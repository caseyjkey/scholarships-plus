# Chrome Extension Testing Guide

## Overview

The Scholarships Plus Chrome Extension automatically detects form fields on scholarship application pages and provides AI-suggested responses through sparkle icons (✨). This guide covers testing the extension on the demo page.

## Prerequisites

1. **Remix Dev Server Running**
   ```bash
   npm run dev
   ```
   Server should be running on `http://localhost:3030`

2. **Demo Scholarship Seeded**
   ```bash
   npx tsx scripts/seed-demo-scholarship.ts
   ```
   This creates mock scholarship data and field mappings in the database.

## Installation

### Step 1: Open Chrome Extensions Page

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" toggle in top right corner

### Step 2: Load Unpacked Extension

1. Click "Load unpacked" button
2. Navigate to and select: `chrome-extension/` folder
3. Verify "Scholarships Plus Assistant" appears in your extensions list

### Step 3: Verify Permissions

The extension should show these required permissions:
- `activeTab` - Access current tab content
- `storage` - Store extension settings
- `cookies` - Sync cookies for session tracking
- `sidepanel` - Show sidebar UI
- `tabs` - Multi-tab context tracking

## Testing the Demo Page

### Step 1: Navigate to Demo Page

1. Open new tab
2. Go to: `http://localhost:3030/demo`
3. You should see a green banner at top: "✨ Scholarships+ Extension Connected"
4. After 5 seconds, banner auto-hides

### Step 2: Verify Sparkle Icons Appear

Check that sparkle icons appear next to ALL form fields:

| Field | Expected Icon State |
|-------|-------------------|
| First Name | **Blue glowing** (ready) |
| Last Name | **Blue glowing** (ready) |
| Email Address | **Blue glowing** (ready) |
| Phone Number | **Blue glowing** (ready) |
| Cumulative GPA | **Blue glowing** (ready) |
| Class Level | **Blue glowing** (ready) |
| Major / Field of Study | **Blue glowing** (ready) |
| Enrollment Status | **Blue glowing** (ready) |
| Expected Graduation Date | **Grey** (empty - no data) |
| Leadership Experience | **Blue glowing** (ready) |
| Academic and Career Goals | **Blue glowing** (ready) |
| Overcoming Challenges | **Blue glowing** (ready) |
| Community Service | **Blue glowing** (ready) |
| Annual Household Income | **Blue glowing** (ready) |
| Have you completed the FAFSA? | **Blue glowing** (ready) |

**Total Expected:** 14 blue glowing sparkles, 1 grey sparkle

### Step 3: Check Status Indicator

Look in bottom right corner for status indicator:
- Text: "✨ 14 responses ready" (or similar count)
- Gradient background: blue to purple
- Hover effect: lifts up slightly

### Step 4: Test Tooltips

1. Hover over any blue glowing sparkle
2. Tooltip should appear: "Click to fill: [Field Name]"
3. Tooltip has dark background with white text
4. Small arrow points down to the sparkle

### Step 5: Test Empty State

1. Find the "Expected Graduation Date" field (grey sparkle)
2. Click the grey sparkle
3. Icon should shake and turn red momentarily
4. No text is filled (no data available)

### Step 6: Test Auto-Fill (Single Field)

1. Click any **blue glowing** sparkle (e.g., "First Name")
2. Watch the animation sequence:
   - Icon turns **amber** and starts spinning (loading state)
   - Field fills with typewriter effect (character by character)
   - Icon turns **green** with checkmark overlay (filled state)
   - Tooltip changes to "✓ Filled"

3. Verify field value:
   - First Name: "Jane"
   - Last Name: "Doe"
   - Email: "jane.doe@example.com"
   - Phone: "(555) 123-4567"
   - GPA: "3.75"
   - Class Level: "junior" (select dropdown)
   - Major: "Computer Science"
   - Enrollment Status: "full_time" (select dropdown)
   - Income: "$50,000 - $75,000" (select dropdown)
   - FAFSA: "Yes" (select dropdown)

4. For essay fields, verify longer text content:
   - Leadership Experience: ~300 words about CS Club presidency
   - Academic and Career Goals: ~250 words about AI/ML goals
   - Overcoming Challenges: ~300 words about first-gen student experience
   - Community Service: ~300 words about volunteering

### Step 7: Test Select Dropdowns

For select fields (Class Level, Enrollment Status, Income, FAFSA):
1. Click the sparkle
2. Verify correct option is selected in dropdown
3. Dropdown value changes to match the approved response

### Step 8: Test Essay Fields with Typewriter Effect

For textarea fields (Leadership, Goals, Challenges, Community Service):
1. Click the sparkle
2. Watch typewriter animation:
   - Text appears character by character
   - Speed: ~10ms per character
   - Max animation time: 500ms (then instantly fills remaining)
3. Verify complete essay text is filled
4. Check green checkmark appears

### Step 9: Test Multiple Fields

1. Fill several fields by clicking their sparkles
2. Each should animate independently
3. Each should turn green when complete
4. Status indicator updates in real-time

### Step 10: Test Field Focus Behavior

1. Click into any form field (not the sparkle)
2. Associated sparkle should scale up (1.1x) and become fully opaque
3. This visual feedback helps identify which field you're editing

## Mock Data Reference

### Personal Information
- **First Name**: Jane
- **Last Name**: Doe
- **Email**: jane.doe@example.com
- **Phone**: (555) 123-4567

### Academic Information
- **GPA**: 3.75
- **Class Level**: Junior
- **Major**: Computer Science
- **Enrollment Status**: Full-Time

### Financial Information
- **Income**: $50,000 - $75,000
- **FAFSA**: Yes

### Essay Content (Preview)

**Leadership Experience**: CS Club president, organized coding workshops, started peer mentoring program, led hackathon.

**Academic and Career Goals**: Graduate with honors in CS, work at edtech company, pursue ML graduate degree, develop AI for educational access.

**Overcoming Challenges**: First-gen student, imposter syndrome, sought tutoring, founded peer mentoring program for first-year students.

**Community Service**: Food bank volunteer, K-12 math/CS tutor, organized coding bootcamp, Women in Tech mentor, environmental conservation.

## Troubleshooting

### Extension Not Loading

**Symptom**: No green banner appears on demo page

**Solutions**:
1. Check extension is enabled in `chrome://extensions/`
2. Verify `manifest.json` includes `http://localhost:3030/*` in matches
3. Refresh the demo page (Ctrl+Shift+R for hard refresh)
4. Check browser console for errors (F12 → Console tab)

Expected console log:
```
Scholarships Plus: Detected portal: demo
Scholarships Plus: Running on demo page
Scholarships Plus: Found 16 form fields
Scholarships Plus: Initialization complete
```

### Sparkle Icons Not Appearing

**Symptom**: Demo page loads but no sparkle icons visible

**Solutions**:
1. Verify content script is injected:
   - Open DevTools → Sources → Content scripts
   - Look for `content.js`
2. Check CSS is loaded:
   - Open DevTools → Elements → Computed
   - Verify `.sp-sparkle-icon` styles exist
3. Ensure demo page is on `localhost:3030` (not 3000)
4. Check that field detection found inputs:
   - Console should show "Found 16 form fields"

### Fields Not Filling

**Symptom**: Sparkle appears but clicking doesn't fill field

**Solutions**:
1. Check console for errors on click
2. Verify field name matches mock data:
   - Open DevTools → Elements
   - Select input field
   - Check `name` attribute (e.g., `name="firstName"`)
3. Try different sparkle icons
4. Check that sparkle is blue glowing (has data) not grey (empty)

### Wrong Data Filled

**Symptom**: Field fills but with incorrect value

**Solutions**:
1. Check mock data in `chrome-extension/content.js`
2. Look for `getDemoFieldMappings()` function
3. Verify `fieldName` matches input `name` attribute
4. For essay fields, verify full text content in mock data

## Advanced Testing

### Console Commands

Run these in browser console to debug:

```javascript
// Check if extension is loaded
window.scholarshipsPlusExtension

// Count sparkle icons
document.querySelectorAll('.sp-sparkle-icon').length

// Count ready (blue) sparkles
document.querySelectorAll('.sp-sparkle-ready').length

// Check field mappings
[...document.querySelectorAll('input, textarea, select')].map(el => ({
  name: el.name,
  hasSparkle: !!el.parentElement.querySelector('.sp-sparkle-icon'),
  sparkleState: el.parentElement.querySelector('.sp-sparkle-icon')?.className
}))
```

### Manual API Testing

If logged in to scholarships-plus:

```bash
# Check if demo scholarship is known
curl 'http://localhost:3030/api/extension/check-scholarship?url=http://localhost:3030/demo&portal=demo' \
  -H 'Cookie: [your-session-cookie]'

# Get field mappings
curl 'http://localhost:3030/api/extension/field-mappings/demo-scholarship-cuid' \
  -H 'Cookie: [your-session-cookie]'
```

## Production Testing

To test on real scholarship portals:

1. **Update manifest.json** to include target domain:
   ```json
   "matches": ["https://app.smarterselect.com/*"]
   ```

2. **Create field mappings** for the real scholarship:
   - Log in to scholarships-plus
   - Navigate to application detail page
   - Fill out form fields
   - Agent will create field mappings

3. **Navigate to real portal** and test sparkle flow

## Next Steps

After successful demo testing:

1. ✅ Test on real scholarship portal (SmarterSelect, Oasis)
2. ✅ Test with authenticated API calls
3. ✅ Test sidepanel chat integration
4. ✅ Test form submission flow
5. ✅ Test with multiple scholarships

## Files Modified

- `chrome-extension/content.js` - Field detection and sparkle injection
- `chrome-extension/content.css` - Sparkle styles and animations
- `chrome-extension/manifest.json` - Extension configuration
- `chrome-extension/README.md` - Extension documentation
- `app/routes/demo._index.tsx` - Demo scholarship application form
- `scripts/seed-demo-scholarship.ts` - Database seeding script
- `docs/screenshots/demo-page-without-extension.png` - Demo page screenshot

## Contact

For issues or questions, check the main project README or create an issue on GitHub.
