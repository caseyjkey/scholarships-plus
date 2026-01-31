#!/usr/bin/env python3
"""
Scrape One Scholarship by Title

This script scrapes a single scholarship from Native Forward
by finding it by title and clicking READ MORE.

Progress markers:
- STATUS: message
- ERROR: error message
- RESULT: json
"""

import asyncio
import json
import sys
import re
from pathlib import Path

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Controller
from langchain_openai import ChatOpenAI

def slugify(title: str) -> str:
    """Convert title to URL-friendly slug"""
    # Convert to lowercase and replace non-alphanumeric with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    return slug

async def scrape_one_scholarship(title: str):
    """Scrape a single scholarship by title"""

    if not title:
        print("ERROR: Scholarship title is required")
        print(f"RESULT: {json.dumps({'success': False, 'error': 'Scholarship title is required'})}")
        return

    print(f"STATUS: Starting scrape for: {title}")
    print(f"STATUS: Navigating to Native Forward scholarship finder...")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize controller
    controller = Controller()

    # Task: Scrape specific scholarship by title
    task = f"""
Navigate to https://www.nativeforward.org/scholarship-finder

STEP 1: Close any modal
- If you see a modal/popup, click the X button to close it
- Wait for the main page to load

STEP 2: Find the scholarship with title: "{title}"
- Look through all scholarship listings
- Find the one matching this exact title
- Click the "READ MORE" button for that scholarship
- Wait for the detail view to load

STEP 3: Extract ALL details from the detail view
- Title (exact)
- Full description (from #tab-description or detail section)
- Award amount (if shown)
- Application deadline (exact text including date/time)
- Eligibility requirements (list or text)
- Application link (URL)
- Status (Open/Closed/etc)

STEP 4: Return the data as JSON with these fields:
{{
  "title": "Exact Title",
  "full_description": "Full description text",
  "short_description": "Short description if available",
  "award_amount": "Amount or null",
  "deadline": "Deadline text",
  "eligibility": ["requirement1", "requirement2"] or "text",
  "application_url": "https://...",
  "status": "Open"
}}

IMPORTANT:
- Only scrape the scholarship with title: "{title}"
- Extract the FULL description from the detail tab
- Include all eligibility requirements
"""

    try:
        print("STATUS: Running scrape agent...")
        # Initialize agent
        agent = Agent(
            task=task,
            llm=llm,
            controller=controller,
        )

        # Run agent
        result = await agent.run()

        # Parse and return result
        json_start = result.find('{')
        json_end = result.rfind('}') + 1

        if json_start >= 0 and json_end > json_start:
            json_str = result[json_start:json_end]
            data = json.loads(json_str)

            # Add source URL
            data["sourceUrl"] = f"https://www.nativeforward.org/scholarships/{slugify(data['title'])}"

            print(f"STATUS: Successfully scraped: {title}")
            print(f"RESULT: {json.dumps({
                'success': True,
                'scholarship': data
            }, indent=2)}")
            return

        # Fallback: try parsing entire result
        data = json.loads(result)
        data["sourceUrl"] = f"https://www.nativeforward.org/scholarships/{slugify(data['title'])}"
        print(f"STATUS: Successfully scraped: {title}")
        print(f"RESULT: {json.dumps({
            'success': True,
            'scholarship': data
        }, indent=2)}")

    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"RESULT: {json.dumps({
            'success': False,
            'error': 'Failed to parse scholarship data',
            'rawOutput': result if 'result' in locals() else str(e)
        }, indent=2)}")

if __name__ == "__main__":
    # Get title from command line argument
    if len(sys.argv) < 2:
        print("ERROR: Usage: python scrape-one-modular.py 'Scholarship Title'")
        result = json.dumps({'success': False, 'error': "Usage: python scrape-one-modular.py 'Scholarship Title'"})
        print(f"RESULT: {result}")
        sys.exit(1)

    title = sys.argv[1]
    asyncio.run(scrape_one_scholarship(title))
