#!/bin/bash
# Package the Chrome extension for distribution
# Creates a clean zip file with only the necessary extension files

set -e

# Get the script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

EXTENSION_DIR="$PROJECT_DIR/chrome-extension"
OUTPUT_DIR="$PROJECT_DIR/public/downloads"
OUTPUT_FILE="$OUTPUT_DIR/scholarships-plus-extension.zip"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Create a temporary directory for the package
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "Packaging Chrome extension..."

# Copy only the necessary files to temp directory
# Include: manifest.json, JS files, CSS files, HTML files, icons
for file in \
  manifest.json \
  background.js \
  content.js \
  content.css \
  popup.html \
  popup.js \
  sidepanel.html \
  sidepanel.js \
  sidepanel.css \
  history-modal.js \
  progress-banner.js \
  sparkle.css \
  style-settings.js \
  synthesis-integration.js \
  webapp-content.js
do
  if [ -f "$EXTENSION_DIR/$file" ]; then
    cp "$EXTENSION_DIR/$file" "$TEMP_DIR/"
    echo "  Added $file"
  fi
done

# Copy icons directory (excluding .base64 files)
mkdir -p "$TEMP_DIR/icons"
for icon in "$EXTENSION_DIR/icons"/*.{png,svg}; do
  if [ -f "$icon" ]; then
    basename=$(basename "$icon")
    # Skip .base64 files
    if [[ ! "$basename" =~ \.base64$ ]]; then
      cp "$icon" "$TEMP_DIR/icons/"
      echo "  Added icons/$basename"
    fi
  fi
done

# Create the zip file
(cd "$TEMP_DIR" && zip -r "$OUTPUT_FILE" . 2>/dev/null)

echo "Extension packaged successfully: $OUTPUT_FILE"
echo ""
echo "Contents:"
unzip -l "$OUTPUT_FILE"
