#!/usr/bin/env python3
"""
Scrape AISES/Cobell Scholarships from Public Websites

This script discovers all AISES and Cobell scholarships from their public websites,
which don't require login.

Progress markers:
- STATUS: message
- PROGRESS: current/total: message
- ERROR: error message
- RESULT: json
"""

import asyncio
import json
import sys
from pathlib import Path

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Controller
from browser_use.llm import ChatOpenAI

async def discover_scholarships():
    """Discover all AISES and Cobell scholarships from public websites"""

    print("STATUS: Starting AISES/Cobell scholarship discovery from public websites...")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize controller
    controller = Controller()

    # Task: Scrape both AISES and Cobell scholarships from public pages
    task = """
STEP 1: Scrape AISES Scholarships
- Navigate to https://aises.org/scholarships/
- Find all scholarship listings on the page
- For each scholarship, extract:
  * Title (exact text)
  * Description/summary
  * Award amount (if shown)
  * Deadline (if shown)
  * Application link URL

STEP 2: Scrape Cobell Scholarships
- Navigate to https://cobellscholar.org/our-scholarships/
- Find all scholarship listings on the page
- For each scholarship, extract:
  * Title (exact text)
  * Description/summary
  * Award amount (if shown)
  * Deadline (if shown)
  * Application link URL

STEP 3: Return as JSON
{
  "scholarships": [
    {
      "title": "Scholarship Name",
      "organization": "AISES",  // or "Cobell"
      "position": 1,
      "sourceUrl": "https://...",
      "applicationUrl": "https://...",
      "description": "Brief description",
      "amount": "$X,XXX",
      "deadline": "Month DD, YYYY",
      "status": "Open"
    }
  ]
}

IMPORTANT:
- Visit both websites
- Include ALL scholarships found on both pages
- Clearly mark each scholarship's organization (AISES or Cobell)
- Extract the exact title and any deadline information
- Look for "Apply Now" or "Application" links for the applicationUrl
"""

    try:
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
