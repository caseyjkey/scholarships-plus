#!/bin/bash
# Create simple sparkle icons using ImageMagick

cd "$(dirname "$0")/.."

# Check if ImageMagick is available
if command -v convert &> /dev/null; then
    echo "Creating PNG icons with ImageMagick..."

    # Create 128x128 icon with gradient background and sparkle emoji
    convert -size 128x128 xc:none \
      -fill "#3b82f6" \
      -draw "roundrectangle 0,0,128,128,20,20" \
      -font DejaVu-Sans \
      -pointsize 80 \
      -fill white \
      -gravity center \
      -annotate 0 "✨" \
      icons/icon128.png

    # Scale to other sizes
    convert icons/icon128.png -resize 48x48 icons/icon48.png
    convert icons/icon128.png -resize 16x16 icons/icon16.png

    echo "✅ Icons created successfully!"
    ls -lh icons/
else
    echo "❌ ImageMagick not found. Install with: sudo apt-get install imagemagick"
    echo "Or use https://icon.kitchen to create icons manually"
    exit 1
fi
