# Extension Fixes - Round 2

## Issues Fixed This Round

### 1. AI Chat Still Discussing Instead of Returning Values ✅

**Root Cause**: Knowledge base context was being added to simple value prompts, overriding the directive to return only the value.

**Example of the problem**:
- User types: "Stanford"
- AI responds: "Stanford is the host institution for the Miller Indigenous Economic Development Fellowship..."
- Expected: "Stanford University" (as a suggestion with approval buttons)

**Fixes Applied**:

#### A. Skip Knowledge Base Search for Simple Values
**File**: `app/routes/api.extension.chat.tsx` (lines 153-179)
- Detect simple values using same criteria as prompt building
- Skip `searchKnowledgeBase()` for select/radio fields and simple values
- Prevents context from being added that causes AI to discuss instead of return

#### B. More Forceful Prompt for Simple Values
**File**: `app/routes/api.extension.chat.tsx` (lines 224-248)
- Removed all context from simple value prompt
- More direct instructions: "YOU ARE A FORM-FILLING ASSISTANT"
- Added explicit examples showing input → output format
- Emphasized: "NO explanations, NO context, NO suggestions"

**Expected Result**: User types "Stanford" → AI returns "Stanford University" → Shown as suggestion with ✨ "Sounds good!" button

---

### 2. Radio Button Label Detection Wrong ✅

**Problem**: For radio buttons like "Are you currently a doctoral candidate? Yes/No", the extension detected "yes" as the field label instead of the question.

**Fix**: `chrome-extension/content-v037.js` (lines 284-327)

Changes:
1. **Minimum length check**: Skip candidates shorter than 15 characters (eliminates "Yes", "No", "Male", "Female")
2. **Question mark priority**: Labels with `?` get 1000-point bonus
3. **Use clean text**: Call `getCleanLabelText()` to exclude nested form elements
4. **Fix compareDocumentPosition**: Use `DOCUMENT_POSITION_FOLLOWING` instead of `PRECEDING`

**Expected Result**: Radio groups now detect the full question as the label

---

### 3. Duplicate Tooltips on Sparkles ✅

**Problem**: First sparkle (and possibly others) showed two tooltips when hovering.

**Root Cause**: Code was creating both a custom `.sp-tooltip` div AND setting `icon.title` which creates a native browser tooltip.

**Fix**: `chrome-extension/content-v037.js` (line 768)
- Removed `icon.title = tooltipText;`
- Kept only the custom tooltip div

**Expected Result**: Only one tooltip appears on hover

---

### 4. Banner Not Showing After Login ⚠️

**Status**: Code appears correct, needs testing

**What should happen**:
1. After login, auth banner is removed (line 1880)
2. `processFields()` is called (line 1882)
3. Banner shows: "✨ X fields ready • Y generating..." (line 1616)
4. Auto-dismisses after 5 seconds (line 1462-1466)

**Possible issues**:
- Banner shown but dismissed before user returns to tab
- Timing issue where fields aren't ready when user returns
- Auth detection not firing (check browser console logs)

**Debug steps**:
```javascript
// Check console for these logs:
"Scholarships Plus: Auth token detected, re-processing fields"
"Scholarships Plus: Extracted X fields"
"Scholarships Plus: Updated sparkles - X ready, Y generating"
```

---

## Files Modified This Round

1. **app/routes/api.extension.chat.tsx**
   - Lines 153-179: Skip knowledge base for simple values
   - Lines 224-248: More forceful simple value prompt

2. **chrome-extension/content-v037.js**
   - Lines 284-327: Improved radio button label detection
   - Line 768: Removed duplicate tooltip

---

## Testing Checklist

### Deploy Changes
```bash
# Copy updated files to Windows mount
cp /home/trill/Development/scholarships-plus/chrome-extension/content-v037.js \
   /mnt/c/Users/Omni/Development/chrome-extension/

# Bump version in manifest.json (Chrome caches!)
# e.g., "version": "0.2.6"

# Reload extension at chrome://extensions/

# Hard refresh test page (Ctrl+Shift+R)
```

### Test Scenarios

#### ✅ Test 1: Simple Value Response
1. Click empty sparkle for "University" field
2. Type "Stanford" in chat
3. **Expected**: AI returns "Stanford University" as suggestion
4. **Expected**: Shows buttons: "✨ Sounds good!" and "Let's change that."
5. Click "✨ Sounds good!"
6. **Expected**: Field fills with animation

#### ✅ Test 2: Radio Button Label
1. Find radio button group: "Are you currently a doctoral candidate? Yes/No"
2. **Expected**: Sparkle appears next to question, NOT next to "Yes"
3. **Expected**: Chat greeting says: "...help you with 'Are you currently a doctoral candidate?'"

#### ✅ Test 3: Tooltip
1. Hover over any sparkle
2. **Expected**: Only ONE tooltip appears
3. **Expected**: No native browser tooltip

#### ✅ Test 4: Login Flow
1. Log out, navigate to scholarship application
2. **Expected**: Red auth banner appears
3. Log in (in new tab)
4. Return to application tab
5. **Expected**: Auth banner removed
6. **Expected**: Green banner shows: "✨ X fields detected"
7. **Expected**: All sparkles appear immediately

#### ✅ Test 5: Complex Request
1. Click sparkle for essay field
2. Type: "Can you help me write about my research experience?"
3. **Expected**: AI generates paragraph with context
4. **Expected**: Shows as suggestion with approval buttons
5. Click "Let's change that."
6. **Expected**: Can continue refining

---

## Known Limitations

### Chat Memory
**Current behavior**: Each time you open the chat, it starts fresh. Previous conversation is lost.

**User expectation**: Chat should remember what was discussed (e.g., "Nope." should reference earlier "Save Stanford as my university")

**Solution needed**:
- Store conversation history in database per (applicationId, fieldName)
- Load history when opening chat
- Clear history when field is filled

**Not implemented yet** - would require backend changes

---

## Debugging Tips

### If AI still discusses instead of suggesting:

Check browser console Network tab for `/api/extension/chat` request:
```json
{
  "scholarshipId": "...",
  "applicationId": "...",
  "fieldName": "university",  // ← Should be present for field-specific chat
  "fieldLabel": "Name of college or university",
  "fieldType": "text",
  "message": "Stanford"
}
```

If `fieldName` is missing, `currentFieldName` is null in content script.

### If approval buttons don't show:

Check browser console for the response label:
- Should see: "Suggested response:" (with buttons)
- If you see: "Assistant" (no buttons) → field mode not detected

Add console.log:
```javascript
// Line 1253 in content-v037.js
console.log('currentFieldName:', currentFieldName);
```

### If radio button label is still wrong:

Check console logs:
```
[FINDLABEL] Starting for element: doctoral radio
[SPARKLE] Field: doctoral Source: radio-group-before-input Label text: Are you currently a doctoral candidate?
```

Should show the full question, not "yes" or "no".

---

## Next Steps

1. **Deploy and test** the changes
2. **Check browser console** for any errors
3. **Report results** - which issues are fixed, which persist
4. **Consider chat memory** feature if needed
