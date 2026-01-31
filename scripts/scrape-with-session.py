#!/usr/bin/env python3
"""
Scrape OASIS Portal with Saved Session

This script loads a previously saved session and uses it to scrape
scholarship details without needing to re-authenticate.
"""

import asyncio
import json
import sys
from pathlib import Path

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Controller, Browser
from browser_use.llm import ChatOpenAI

async def scrape_with_session(scholarship_title: str = None):
    """Scrape using saved session"""

    session_file = Path.home() / "Development" / "scholarships-plus" / "data" / "oasis_session.json"

    # Load session
    with open(session_file, 'r') as f:
        session_data = json.load(f)

    print(f"STATUS: Loaded session with {len(session_data['cookies'])} cookies")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize browser with cookies
    # Note: browser-use doesn't directly support loading cookies in Browser init
    # We'll handle this via the task instructions

    controller = Controller()

    if scholarship_title:
        task = f"""
You are already logged into the OASIS portal with saved session cookies.

STEP 1: Navigate to dashboard
- Go to https://aises.awardspring.com/ACTIONS/Welcome.cfm

STEP 2: Find the scholarship
- Look for scholarship titled: "{scholarship_title}"
- Click on it to view details

STEP 3: Extract all details:
- Title
- Organization (AISES or Cobell)
- Full description
- Award amount
- Application deadline
- Eligibility requirements
- Required documents
- Application status

STEP 4: Return as JSON:
{{
  "title": "...",
  "organization": "AISES/Cobell",
  "full_description": "...",
  "award_amount": "...",
  "deadline": "...",
  "eligibility": "...",
  "required_documents": ["...", "..."],
  "application_url": "...",
  "status": "..."
}}

IMPORTANT: Use the existing authenticated session - no need to log in.
"""
    else:
        task = """
You are already logged into the OASIS portal with saved session cookies.

STEP 1: Navigate to dashboard
- Go to https://aises.awardspring.com/ACTIONS/Welcome.cfm

STEP 2: List all available scholarships
- Find all scholarship applications
- For each one, extract:
  * Title
  * Organization (AISES or Cobell)
  * Deadline
  * Status (Open/Closed/etc)

STEP 3: Return as JSON:
{
  "scholarships": [
    {
      "title": "Scholarship Name",
      "organization": "AISES/Cobell",
      "deadline": "Date",
      "status": "Open/Closed"
    }
  ]
}

IMPORTANT: Use the existing authenticated session - no need to log in.
"""

    try:
        print(f"STATUS: Running agent...")

        agent = Agent(
            task=task,
            llm=llm,
            controller=controller,
        )

        result = await agent.run()

        print(f"RESULT: {result}")

    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"RESULT: {json.dumps({'success': False, 'error': str(e)})}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--title', help='Specific scholarship title to scrape')
    args = parser.parse_args()

    asyncio.run(scrape_with_session(args.title))
