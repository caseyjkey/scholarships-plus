#!/usr/bin/env python3
"""
Discover AISES/Cobell Scholarships on OASIS Portal

This script discovers all AISES and Cobell scholarships on the OASIS portal.
It requires login credentials and will pause for manual login if needed.

Progress markers:
- STATUS: message
- PROGRESS: current/total: message
- ERROR: error message
- RESULT: json
"""

import asyncio
import json
import sys
import os
from pathlib import Path

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Controller
from browser_use.llm import ChatOpenAI

# OASIS Portal configuration
OASIS_LOGIN_URL = "https://webportalapp.com/sp/login/access_oasis"
OASIS_DASHBOARD_URL = "https://aises.awardspring.com/ACTIONS/Welcome.cfm"

# Known AISES scholarships for reference
AISES_SCHOLARSHIPS = [
    "AISES National Conference Travel Scholarship",
    "Stellantis Scholarship",
    "AISES General Scholarship",
]

# Known Cobell scholarships for reference
COBELL_SCHOLARSHIPS = [
    "Cobell Undergraduate Scholarship",
    "Cobell Graduate Scholarship",
    "Cobell Vocational Scholarship",
    "Cobell Summer Scholarship",
    "Cobell Graduate Summer Research Fellowship",
    "Elouise Cobell Doctoral Dissertation Writing-Year Fellowship",
]

async def discover_scholarships():
    """Discover all AISES and Cobell scholarships on OASIS portal"""

    print("STATUS: Navigating to OASIS portal...")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize controller
    controller = Controller()

    # Task: Discover scholarships on OASIS portal
    task = """
Navigate to https://webportalapp.com/sp/login/access_oasis

STEP 1: Handle Login
- If you see a login form, look for email and password fields
- If credentials are not pre-filled, PAUSE and wait
- Otherwise, complete the login and continue

STEP 2: Navigate to Scholarship Applications
- After login, look for a "Scholarships", "Applications", or "My Applications" link
- Click on it to view available scholarships

STEP 3: Identify ALL scholarships
- Look through all available scholarship applications
- For each scholarship, extract:
  * Title (exact text)
  * Organization (AISES or Cobell)
  * Position (order from top to bottom)
  * Deadline (if shown)
  * Status (Open/Closed/etc - if shown)

STEP 4: Return as JSON
{
  "scholarships": [
    {
      "title": "Scholarship Name Here",
      "organization": "AISES",
      "position": 1,
      "deadline": "March 31, 2025",
      "status": "Open"
    }
  ]
}

IMPORTANT:
- Look for both AISES and Cobell scholarships
- Include all active and available scholarships
- Note the organization (AISES vs Cobell) for each scholarship
"""

    try:
        # Initialize agent
        print("STATUS: Running discovery agent...")
        print("PROGRESS: 0/1: Discovering scholarships...")

        agent = Agent(
            task=task,
            llm=llm,
            controller=controller,
        )

        # Run agent
        result = await agent.run()

        # Try to extract JSON from result
        json_start = result.find('{')
        json_end = result.rfind('}') + 1

        if json_start >= 0 and json_end > json_start:
            json_str = result[json_start:json_end]
            discovery = json.loads(json_str)

            # Validate structure
            if "scholarships" in discovery:
                count = len(discovery["scholarships"])
                print(f"PROGRESS: 1/1: Discovery complete!")
                print(f"STATUS: Found {count} AISES/Cobell scholarships")
                print(f"RESULT: {json.dumps({
                    'success': True,
                    'count': count,
                    'scholarships': discovery['scholarships']
                }, indent=2)}")
                return

        # Fallback: try parsing entire result
        discovery = json.loads(result)
        count = len(discovery.get("scholarships", []))
        print(f"PROGRESS: 1/1: Discovery complete!")
        print(f"STATUS: Found {count} AISES/Cobell scholarships")
        print(f"RESULT: {json.dumps(discovery, indent=2)}")

    except json.JSONDecodeError:
        print("STATUS: Discovery failed - could not parse results")
        print(f"RESULT: {json.dumps({
            'success': False,
            'error': 'Failed to parse scholarship discovery',
            'rawOutput': result
        }, indent=2)}")
    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"RESULT: {json.dumps({
            'success': False,
            'error': str(e)
        }, indent=2)}")

if __name__ == "__main__":
    asyncio.run(discover_scholarships())
