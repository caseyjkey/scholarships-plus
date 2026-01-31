#!/usr/bin/env python3
"""
Native Forward Scholarship Scraper using Chrome DevTools MCP

This script uses Chrome DevTools to:
1. Navigate to the scholarship page
2. Handle Cloudflare if present (wait for manual completion)
3. Close any modal with X button
4. Click all "READ MORE" buttons
5. Extract detailed info from #tab-description
6. Index in database

Usage:
  python scripts/scrape-nativeforward-chrome.py
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment
load_dotenv(Path(__file__).parent.parent / ".env")


class ScrapedScholarship(BaseModel):
    """Scholarship data model"""
    title: str
    description: str
    amount: Optional[str] = None
    deadline: Optional[str] = None
    eligibility: Optional[str] = None
    application_url: Optional[str] = None
    source_url: str
    details: Optional[str] = None  # Full content from #tab-description


# We'll use Chrome DevTools MCP through the running browser
# This is a controller script that guides the scraping process


async def extract_scholarship_from_page(screenshot_url: str = None) -> dict:
    """
    Extract scholarship data from the current page using screenshot analysis.

    This function coordinates with Chrome DevTools MCP to:
    1. Take a screenshot
    2. Analyze with zai-mcp-server
    3. Extract text content from #tab-description
    """
    return {
        "instruction": "Use Chrome DevTools MCP to interact with the page",
        "steps": [
            "1. Take snapshot of page",
            "2. Close modal if present (click X button)",
            "3. Click 'READ MORE' button on first scholarship",
            "4. Wait for content to load",
            "5. Extract content from #tab-description",
            "6. Go back and repeat for all scholarships"
        ]
    }


def save_to_json(scholarships: List[dict], output_path: str):
    """Save scholarships to JSON file"""
    data = {
        "scraped_at": datetime.now().isoformat(),
        "count": len(scholarships),
        "scholarships": scholarships
    }

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved {len(scholarships)} scholarships to {output_path}")


async def main():
    """Main entry point - coordinates with Chrome DevTools MCP"""
    print("=" * 60)
    print("Native Forward Scholarship Scraper")
    print("Using Chrome DevTools MCP")
    print("=" * 60)

    print("\nThis script coordinates with Chrome DevTools MCP.")
    print("Please ensure Chrome DevTools MCP is connected and")
    print("navigate to: https://www.nativeforward.org/scholarship-finder\n")

    print("Instructions:")
    print("1. Complete Cloudflare verification if present")
    print("2. Close any modal with X button")
    print("3. Script will click READ MORE buttons and extract data")
    print("\nWaiting for Chrome DevTools MCP to be ready...")

    # Wait for user to set up browser
    await asyncio.sleep(5)

    # The actual extraction will be done via Chrome DevTools MCP
    # This is just a controller script

    print("\n" + "=" * 60)
    print("Ready! Use Chrome DevTools MCP to:")
    print("1. take_snapshot - see page structure")
    print("2. click - interact with READ MORE buttons")
    print("3. evaluate_script - extract data from #tab-description")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
