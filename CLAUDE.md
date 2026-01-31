# Project-Specific Guidelines

## Browser-Use Integration

When working with browser-use scraping scripts, **DO NOT** use `langchain_openai` imports.

### ✅ CORRECT
```python
from browser_use import Agent, Browser, ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
```

### ❌ WRONG
```python
from langchain_openai import ChatOpenAI  # Don't do this!

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
```

### Why?

The browser-use library provides its own LLM wrappers (ChatOpenAI, ChatAnthropic, ChatGoogle, etc.) that are optimized for browser automation tasks. These are imported directly from `browser_use`, not from langchain.

Reference: `~/Development/browser-use/AGENTS.md` for full documentation on supported models and usage patterns.

### WSL2 Chrome Configuration

**IMPORTANT:** This project runs on WSL2. All browser-use scripts must use the custom Chrome installation with sandbox flags:

```python
browser = Browser(
    headless=False,  # Show browser window
    storage_state=storage_state,
    executable_path="/home/trill/chrome/chrome/linux-144.0.7559.96/chrome-linux64/chrome",
    args=["--no-sandbox", "--disable-setuid-sandbox", "--isolated"],
)
```

This Chrome installation is configured to work on WSL2 without requiring an X server. Reference: chrome-devtools MCP configuration in `~/.claude/mcp_config.json`.
# Testing Capabilities

## Chrome Extension Testing
You can use chrome-devtools-mcp to:
- Navigate to chrome://extensions
- Reload extensions
- Check console errors
- Navigate to test pages
- Test extension functionality end-to-end

## Chrome Extension Development Workflow

### Prerequisites

1. **Remote Debugging Chrome**: Chrome must be started with remote debugging enabled
2. **Windows Administrator**: Required for port proxy configuration (WSL2 → Windows bridge)
3. **File Sync**: Changes must be copied from WSL2 to Windows mount

### Starting Chrome

**On Windows (Administrator PowerShell)**:
```powershell
cd C:\Users\YourUsername\Development\scholarships-plus\chrome-development
.\chrome.bat
```

This script:
- Starts Chrome with `--remote-debugging-port=9222`
- Sets up netsh port proxy from WSL2 to Windows
- Uses temp user data dir (`%temp%\dev-mode-chrome`)

### Making Changes to Extension

1. Edit files in: `/home/trill/Development/scholarships-plus/chrome-extension/`

2. Copy to Windows mount:
   ```bash
   cp /home/trill/Development/scholarships-plus/chrome-extension/*.js \
      /mnt/c/Users/Omni/Development/chrome-extension/
   cp /home/trill/Development/scholarships-plus/chrome-extension/manifest.json \
      /mnt/c/Users/Omni/Development/chrome-extension/
   ```

3. **Bump version** in `manifest.json` (Chrome caches aggressively!):
   ```json
   {
     "version": "0.2.5"  // Always increment
   }
   ```

4. Reload extension at `chrome://extensions/`

5. Hard refresh test page (Ctrl+Shift+R)

### File Locations

- **Linux (WSL2)**: `/home/trill/Development/scholarships-plus/chrome-extension/`
- **Windows Mount**: `/mnt/c/Users/Omni/Development/chrome-extension/`
- **Chrome Load Path**: `C:\Users\Omni\Development\chrome-extension`

**These are SEPARATE directories** - always copy after editing!

### Common Issues

**Content script not loading**:
- Bump version in manifest.json
- Copy files to Windows mount
- Reload extension (not just page)

**Changes not appearing**:
- Chrome caches content scripts aggressively
- Always bump version after each change
- Use hard refresh (Ctrl+Shift+R)

**Extension shows old version**:
- Verify files copied to Windows mount
- Check manifest.json version incremented
- Reload extension at chrome://extensions/

### Testing with chrome-devtools MCP

```javascript
// Check if sparkles are present
document.querySelectorAll('.sp-sparkle-icon').length

// Check content script loaded
typeof processFields !== 'undefined'

// Manually add sparkles for testing
labels.forEach(label => {
  const sparkle = document.createElement('div');
  sparkle.className = 'sp-sparkle-icon';
  label.appendChild(sparkle);
});
```

## Screenshot Analysis
Use zai-mcp-server tools for visual analysis:
- mcp__zai-mcp-server__analyze_image - General image analysis
- mcp__zai-mcp-server__ui_to_artifact - Convert UI to code/specs
- mcp__zai-mcp-server__diagnose_error_screenshot - Analyze error screenshots
- mcp__zai-mcp-server__extract_text_from_screenshot - OCR for text extraction

