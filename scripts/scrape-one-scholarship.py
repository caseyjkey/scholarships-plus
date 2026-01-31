#!/usr/bin/env python3
"""
Single Scholarship Detail Scraper

Extracts detailed info for ONE scholarship at a time to avoid confusion.

Usage:
  python scripts/scrape-one-scholarship.py <scholarship_index>

Where scholarship_index is 1-11 (1 = first scholarship)
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path("~/Development/browser-use").expanduser()))

from browser_use import Agent, ChatOpenAI

load_dotenv(Path(__file__).parent.parent / ".env")


class ScholarshipDetail(BaseModel):
    """Detailed scholarship information"""
    title: str = Field(description="Scholarship title")
    short_description: str = Field(description="Short description from the card")
    full_description: str = Field(description="Full description from detail view")
    amount: str = Field(default="", description="Award amount")
    deadline: str = Field(default="", description="Application deadline")
    eligibility: str = Field(default="", description="Eligibility requirements")
    application_url: str = Field(default="", description="Application URL")
    status: str = Field(default="", description="Status (Open/Closed)")


async def scrape_one_scholarship(index: int):
    """
    Scrape detailed info for ONE scholarship.

    Args:
        index: 1-based index of scholarship (1-11)
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not found!")
        sys.exit(1)

    print(f"Scraping scholarship #{index}...")

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=api_key,
    )

    # Very focused task - ONE scholarship only
    task = f"""
    Navigate to https://www.nativeforward.org/scholarship-finder

    STEP 1: Close any modal
    - If you see a modal/popup, click the X button to close it
    - Wait for the main page to load

    STEP 2: Find and click the READ MORE button
    - Look for the scholarship listing at position {index}
    - Find and click the "READ MORE" button for that scholarship
    - Wait for the detail view to load

    STEP 3: Extract ALL details
    - Title
    - Full description (from #tab-description or detail section)
    - Award amount
    - Application deadline
    - Eligibility requirements
    - Application link
    - Status

    STEP 4: Return the data as JSON with these fields:
    {{
      "title": "...",
      "short_description": "...",
      "full_description": "...",
      "amount": "...",
      "deadline": "...",
      "eligibility": "...",
      "application_url": "...",
      "status": "..."
    }}

    IMPORTANT: Only extract data for scholarship #{index}. Do not navigate to other pages.
    """

    agent = Agent(
        task=task,
        llm=llm,
    )

    print(f"Running agent for scholarship #{index}...")

    try:
        history = await agent.run(max_steps=30)
        result = history.final_result()

        if result:
            print(f"\nResult for scholarship #{index}:")
            print(result[:500])

            # Try to parse as JSON
            try:
                # Clean up the result - sometimes there's extra text
                result_clean = result.strip()
                if result_clean.startswith("```"):
                    result_clean = result_clean.split("```")[1]
                    if result_clean.startswith("json"):
                        result_clean = result_clean[4:]

                data = json.loads(result_clean)

                # Save to file
                output_dir = Path(__file__).parent.parent / "data" / "scholarships"
                output_dir.mkdir(parents=True, exist_ok=True)

                output_path = output_dir / f"scholarship_{index:02d}_detail.json"
                with open(output_path, 'w') as f:
                    json.dump(data, f, indent=2)

                print(f"\nSaved to: {output_path}")
                return data

            except Exception as e:
                print(f"\nCould not parse as JSON: {e}")
                print(f"\nRaw result:\n{result}")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()

    return None


async def main():
    if len(sys.argv) < 2:
        print("Usage: python scrape-one-scholarship.py <index>")
        print("Example: python scrape-one-scholarship.py 1")
        sys.exit(1)

    try:
        index = int(sys.argv[1])
        if index < 1 or index > 11:
            print("Index must be between 1 and 11")
            sys.exit(1)
    except ValueError:
        print("Invalid index. Must be a number.")
        sys.exit(1)

    result = await scrape_one_scholarship(index)

    if result:
        print("\n" + "=" * 60)
        print("SUCCESS!")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("FAILED!")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
