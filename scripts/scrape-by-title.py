#!/usr/bin/env python3
"""
Scrape specific scholarship by title

Usage:
  python scripts/scrape-by-title.py "Exact Scholarship Title"
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path("~/Development/browser-use").expanduser()))

from browser_use import Agent, ChatOpenAI

load_dotenv(Path(__file__).parent.parent / ".env")


async def scrape_by_title(title: str):
    """Scrape a specific scholarship by its title"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not found!")
        sys.exit(1)

    print(f"Scraping: {title}")

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=api_key,
    )

    task = f"""
    Navigate to https://www.nativeforward.org/scholarship-finder

    STEP 1: Close any modal
    - If you see a modal/popup, click the X button to close it
    - Wait for the main page to load

    STEP 2: Find the scholarship with title: "{title}"
    - Look through the scholarship list for this EXACT title
    - Click the "READ MORE" button for this scholarship

    STEP 3: Extract ALL details from the detail view:
    - Title (must match: "{title}")
    - Short description
    - Full description
    - Award amount
    - Application deadline
    - Eligibility requirements
    - Application link

    STEP 4: Return the data as JSON

    IMPORTANT: Find the EXACT scholarship with title "{title}". Do not click on other scholarships.
    """

    agent = Agent(
        task=task,
        llm=llm,
    )

    print(f"Running agent for: {title}")

    try:
        history = await agent.run(max_steps=30)
        result = history.final_result()

        if result:
            print(f"\nResult for: {title}")

            # Try to parse as JSON
            try:
                # Clean up the result
                result_clean = result.strip()
                if result_clean.startswith("```"):
                    result_clean = result_clean.split("```")[1]
                    if result_clean.startswith("json"):
                        result_clean = result_clean[4:]

                data = json.loads(result_clean)

                # Save to file
                output_dir = Path(__file__).parent.parent / "data" / "scholarships"
                output_dir.mkdir(parents=True, exist_ok=True)

                # Create safe filename
                safe_title = re.sub(r'[^a-z0-9]+', '_', title.lower())[:50]
                output_path = output_dir / f"{safe_title}.json"

                with open(output_path, 'w') as f:
                    json.dump(data, f, indent=2)

                print(f"✅ Saved to: {output_path}")
                return data

            except Exception as e:
                print(f"❌ Could not parse as JSON: {e}")

    except Exception as e:
        print(f"❌ Error: {e}")

    return None


async def main():
    if len(sys.argv) < 2:
        print("Usage: python scrape-by-title.py \"Scholarship Title\"")
        sys.exit(1)

    title = sys.argv[1]
    result = await scrape_by_title(title)

    if result:
        print("\n✅ SUCCESS!")
    else:
        print("\n❌ FAILED!")


if __name__ == "__main__":
    asyncio.run(main())
