# Icon Setup Required

The extension needs icon files at the following sizes:
- `icons/icon16.png` (16x16)
- `icons/icon48.png` (48x48)
- `icons/icon128.png` (128x128)

## Quick Setup Options

### Option 1: Use icon.kitchen (Recommended)
1. Go to https://icon.kitchen
2. Enter "✨" emoji or design your icon
3. Set background gradient: Blue (#3b82f6) to Purple (#8b5cf6)
4. Download all sizes
5. Save to `chrome-extension/icons/` directory

### Option 2: Create with CLI
```bash
# Install ImageMagick
sudo apt-get install imagemagick  # Ubuntu/WSL

# Generate icons (run from chrome-extension/ directory)
convert -size 128x128 xc:none -fill "url(#gradient)" \
  -draw "circle 64,64 64,0" \
  -pointsize 80 -gravity center -annotate 0 "✨" \
  -define gradient:gradient="linear-gradient(135deg, #3b82f6, #8b5cf6)" \
  icons/icon128.png

# Scale to other sizes
convert icons/icon128.png -resize 16x16 icons/icon16.png
convert icons/icon128.png -resize 48x48 icons/icon48.png
```

### Option 3: Use any PNG
For testing, you can use any 128x128 PNG:
1. Save a PNG as `icons/icon128.png`
2. Run: `convert icons/icon128.png -resize 48x48 icons/icon48.png`
3. Run: `convert icons/icon128.png -resize 16x16 icons/icon16.png`

## Temporary Fix (Development Only)

You can comment out icons in manifest.json to load the extension without them:

```json
{
  "action": {
    "default_popup": "popup.html"
    // Remove default_icon and icons sections temporarily
  }
}
```

Then reload the extension in chrome://extensions/
