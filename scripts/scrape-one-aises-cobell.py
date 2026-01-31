#!/usr/bin/env python3
"""
Scrape One AISES/Cobell Scholarship by Title

This script scrapes a single AISES or Cobell scholarship from the OASIS portal
by finding it by title and extracting all details.

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
from browser_use.llm import ChatOpenAI

def slugify(title: str) -> str:
    """Convert title to URL-friendly slug"""
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())
    return slug.strip('-')

async def scrape_one_scholarship(title: str, organization: str = "auto"):
    """Scrape a single scholarship by title"""

    if not title:
        print("ERROR: Scholarship title is required")
        print(f"RESULT: {json.dumps({'success': False, 'error': 'Scholarship title is required'})}")
        return

    print(f"STATUS: Starting scrape for: {title}")
    print(f"STATUS: Navigating to OASIS portal...")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize controller
    controller = Controller()

    # Build task with organization hint if provided
    org_hint = f" This is a {organization} scholarship." if organization != "auto" else ""

    # Task: Scrape specific scholarship by title
    task = f"""
Navigate to https://webportalapp.com/sp/login/access_oasis

STEP 1: Login
- Complete the login process with email and password

STEP 2: Find the scholarship
- Look for the scholarship with title: "{title}"{org_hint}
- It might be under AISES or Cobell scholarships
- Click on it to view full details

STEP 3: Extract ALL details from the application page:
- Title (exact)
- Organization (AISES or Cobell)
- Full description (from description/overview section)
- Award amount (variable amount if shown)
- Application deadline (exact date)
- Eligibility requirements (full text or list)
- Required documents (transcripts, essays, etc.)
- Application link (URL to apply)
- Status (Open/Closed/etc)

STEP 4: Return the data as JSON with these fields:
{{
  "title": "Exact Title",
  "organization": "AISES or Cobell",
  "full_description": "Full description text",
  "short_description": "Brief summary if available",
  "award_amount": "$X,XXX or Variable",
  "deadline": "Month DD, YYYY at Time",
  "eligibility": ["requirement1", "requirement2"] or "full text block",
  "required_documents": ["doc1", "doc2"],
  "application_url": "https://...",
  "status": "Open"
}}

IMPORTANT:
- Only scrape the scholarship with title: "{title}"
- Extract the FULL eligibility requirements text
- Include all required documents
- Get the exact deadline date and time
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

            # Add metadata
            data["sourceUrl"] = f"https://aises.awardspring.com/ACTIONS/Welcome.cfm"
            if organization != "auto" and "organization" not in data:
                data["organization"] = organization

            print(f"STATUS: Successfully scraped: {title}")
            print(f"RESULT: {json.dumps({
                'success': True,
                'scholarship': data
            }, indent=2)}")
            return

        # Fallback: try parsing entire result
        data = json.loads(result)
        data["sourceUrl"] = f"https://aises.awardspring.com/ACTIONS/Welcome.cfm"
        if organization != "auto" and "organization" not in data:
            data["organization"] = organization

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
        print("ERROR: Usage: python scrape-one-aises-cobell.py 'Scholarship Title' [AISES|Cobell]")
        print(f"RESULT: {json.dumps({'success': False, 'error': 'Usage: python scrape-one-aises-cobell.py \"Scholarship Title\" [AISES|Cobell]'})}")
        sys.exit(1)

    title = sys.argv[1]
    organization = sys.argv[2] if len(sys.argv) >= 3 else "auto"
    asyncio.run(scrape_one_scholarship(title, organization))
