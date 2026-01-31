#!/usr/bin/env python3
"""
Native Forward Scholarship Scraper - Detailed Version

This script uses browser-use to:
1. Navigate to https://www.nativeforward.org/scholarship-finder
2. Handle Cloudflare (browser-use handles this automatically)
3. Close any modal with X button
4. Click each "READ MORE" button
5. Extract detailed info from #tab-description
6. Save structured JSON output

Usage:
  cd ~/Development/browser-use
  source .venv/bin/activate
  cd ~/Development/scholarships-plus
  python scripts/scrape-nativeforward-detailed.py
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Add browser-use to path
sys.path.insert(0, str(Path("~/Development/browser-use").expanduser()))

from browser_use import Agent, ChatOpenAI

# Load environment
load_dotenv(Path(__file__).parent.parent / ".env")


class ScholarshipDetail(BaseModel):
    """Detailed scholarship information"""
    title: str = Field(description="Scholarship title")
    short_description: str = Field(description="Short description from the card")
    full_description: Optional[str] = Field(default=None, description="Full description from #tab-description")
    amount: Optional[str] = Field(default=None, description="Award amount")
    deadline: Optional[str] = Field(default=None, description="Application deadline")
    eligibility: Optional[str] = Field(default=None, description="Eligibility requirements")
    application_url: Optional[str] = Field(default=None, description="Application URL")
    status: Optional[str] = Field(default=None, description="Status (Open/Closed)")


async def scrape_with_browser_use():
    """
    Scrape scholarships using browser-use with detailed extraction.
    """
    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        print("ERROR: OPENAI_API_KEY not found!")
        sys.exit(1)

    print("Starting browser-use agent for detailed scraping...")
    print("Target: https://www.nativeforward.org/scholarship-finder")

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=api_key,
    )

    # Detailed task that includes modal handling and READ MORE clicking
    task = """
    Navigate to https://www.nativeforward.org/scholarship-finder

    STEP 1: Wait for page to fully load and handle any initial modal:
    - If there's a modal/popup with an X button in the top right corner, click the X to close it
    - Wait for the main scholarship content to be visible

    STEP 2: Identify all scholarship cards on the page
    - Look for scholarship listings with titles and descriptions
    - Count how many scholarships are visible

    STEP 3: For EACH scholarship on the page:
    a) Note the scholarship title from the card
    b) Click the "READ MORE" button for that scholarship
    c) Wait for the detailed view to load
    d) Extract ALL information from the detailed view, including:
       - Full title
       - Short description (from card)
       - Full description (from #tab-description or similar detail section)
       - Award amount
       - Application deadline
       - Eligibility requirements
       - Application/apply link
       - Status (Open/Closed)
    e) Go back to the main scholarship list
    f) Move to the next scholarship

    STEP 4: Return ALL scholarship details as a JSON array with complete information for each scholarship.

    IMPORTANT: Be patient and wait for content to load after each click. Extract the full detailed information, not just the card summary.
    """

    agent = Agent(
        task=task,
        llm=llm,
    )

    print("Running agent (this may take 3-5 minutes for multiple scholarships)...")

    try:
        history = await agent.run(max_steps=100)

        result = history.final_result()

        if result:
            print("\n" + "=" * 60)
            print("Agent completed!")
            print("=" * 60)

            # Try to parse as JSON
            try:
                data = json.loads(result)

                # Save to file
                output_dir = Path(__file__).parent.parent / "data" / "scholarships"
                output_dir.mkdir(parents=True, exist_ok=True)

                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_path = output_dir / f"nativeforward_detailed_{timestamp}.json"

                with open(output_path, 'w') as f:
                    json.dump({
                        "scraped_at": datetime.now().isoformat(),
                        "count": len(data) if isinstance(data, list) else len(data.get("scholarships", [])),
                        "scholarships": data if isinstance(data, list) else data.get("scholarships", [])
                    }, f, indent=2)

                print(f"\nSaved to: {output_path}")
                print(f"Scholarships extracted: {len(data) if isinstance(data, list) else len(data.get('scholarships', []))}")

                return data

            except json.JSONDecodeError as e:
                print(f"\nCould not parse result as JSON: {e}")
                print(f"\nRaw result:\n{result[:1000]}...")
                return None

    except Exception as e:
        print(f"\nError during scraping: {e}")
        import traceback
        traceback.print_exc()
        return None


async def main():
    """Main entry point"""
    print("=" * 60)
    print("Native Forward Detailed Scholarship Scraper")
    print("Browser-Use Edition")
    print("=" * 60)

    scholarships = await scrape_with_browser_use()

    if scholarships:
        print("\n" + "=" * 60)
        print("SUCCESS!")
        print("=" * 60)

        # Show sample
        if isinstance(scholarships, list) and len(scholarships) > 0:
            sample = scholarships[0]
            print(f"\nSample scholarship:")
            print(f"  Title: {sample.get('title', 'N/A')}")
            print(f"  Amount: {sample.get('amount', 'N/A')}")
            print(f"  Deadline: {sample.get('deadline', 'N/A')}")
            if sample.get('full_description'):
                desc = sample['full_description'][:200]
                print(f"  Description: {desc}...")
    else:
        print("\nFailed to extract scholarships")


if __name__ == "__main__":
    asyncio.run(main())
