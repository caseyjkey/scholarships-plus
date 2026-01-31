#!/usr/bin/env python3
"""
Scrape All AISES/Cobell Scholarships

This script scrapes all AISES and Cobell scholarships from the OASIS portal.
It requires login credentials and iterates through known scholarships.

Output: Individual JSON files + scrape_summary.json

Progress markers:
- PROGRESS: current/total: message
- STATUS: message
- ERROR: error message
- RESULT: json
"""

import asyncio
import json
import sys
import re
from pathlib import Path
from datetime import datetime

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Controller
from browser_use.llm import ChatOpenAI

# Known AISES/Cobell scholarships (from discovery or manual list)
SCHOLARSHIPS = [
    {"title": "AISES National Conference Travel Scholarship", "organization": "AISES"},
    {"title": "Stellantis Scholarship", "organization": "AISES"},
    {"title": "Cobell Undergraduate Scholarship", "organization": "Cobell"},
    {"title": "Cobell Graduate Scholarship", "organization": "Cobell"},
    {"title": "Cobell Vocational Scholarship", "organization": "Cobell"},
    {"title": "Cobell Summer Scholarship", "organization": "Cobell"},
    {"title": "Cobell Graduate Summer Research Fellowship", "organization": "Cobell"},
    {"title": "Elouise Cobell Doctoral Dissertation Writing-Year Fellowship", "organization": "Cobell"},
]

def slugify(title: str) -> str:
    """Convert title to filename-friendly slug"""
    slug = re.sub(r'[^a-z0-9]+', '_', title.lower().strip())
    return slug.strip('_')

async def scrape_scholarship(scholarship: dict, index: int, data_dir: Path):
    """Scrape a single scholarship"""

    title = scholarship['title']
    org = scholarship['organization']

    print(f"PROGRESS: {index+1}/{len(SCHOLARSHIPS)}: Scraping {org} - {title}")
    print(f"STATUS: Scraping: {title}")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize controller
    controller = Controller()

    # Task: Scrape specific scholarship
    task = f"""
Navigate to https://webportalapp.com/sp/login/access_oasis

STEP 1: Login if needed
- Complete login to access the OASIS portal

STEP 2: Find and open the scholarship
- Look for the scholarship titled: "{title}"
- Click on it to view the full application details

STEP 3: Extract all details:
- Title (exact)
- Organization ({org})
- Full description
- Award amount
- Application deadline (exact date)
- Eligibility requirements (full text)
- Required documents
- Application link
- Status

STEP 4: Return as JSON with these fields:
{{
  "title": "Exact Title",
  "organization": "{org}",
  "full_description": "Full description text",
  "short_description": "Brief summary if available",
  "award_amount": "$X,XXX or variable",
  "deadline": "Month DD, YYYY",
  "eligibility": ["requirement1", "requirement2"] or "full text",
  "required_documents": ["transcript", "essay", etc],
  "application_url": "https://...",
  "status": "Open/Closed/etc"
}}

IMPORTANT:
- Only scrape the scholarship titled "{title}"
- Extract ALL eligibility requirements in full text
- Include the exact deadline date
"""

    try:
        # Initialize agent
        agent = Agent(
            task=task,
            llm=llm,
            controller=controller,
        )

        # Run agent with timeout
        result = await asyncio.wait_for(agent.run(), timeout=180)

        # Parse result
        json_start = result.find('{')
        json_end = result.rfind('}') + 1

        if json_start >= 0 and json_end > json_start:
            json_str = result[json_start:json_end]
            data = json.loads(json_str)

            # Add metadata
            data['organization'] = org
            data['sourceUrl'] = f"https://aises.awardspring.com/ACTIONS/Welcome.cfm"

            # Save individual file
            filename = f"aises_cobell_{index+1:02d}_{slugify(title)}.json"
            filepath = data_dir / filename

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f"STATUS: ✅ Saved: {filename}")
            return {"title": title, "organization": org, "status": "success", "file": filename}

        else:
            print(f"ERROR: Failed to parse JSON for {title}")
            return {"title": title, "organization": org, "status": "error", "error": "No valid JSON found"}

    except asyncio.TimeoutError:
        print(f"ERROR: Timeout after 180 seconds for {title}")
        return {"title": title, "organization": org, "status": "error", "error": "Timeout"}

    except Exception as e:
        print(f"ERROR: {str(e)}")
        return {"title": title, "organization": org, "status": "error", "error": str(e)}

async def scrape_all():
    """Scrape all AISES/Cobell scholarships"""

    # Create data directory
    data_dir = Path.cwd() / "data" / "aises_cobell"
    data_dir.mkdir(parents=True, exist_ok=True)

    print(f"STATUS: Starting scrape of {len(SCHOLARSHIPS)} AISES/Cobell scholarships...")
    print(f"PROGRESS: 0/{len(SCHOLARSHIPS)}: Initializing")

    results = []

    # Scrape each scholarship
    for i, scholarship in enumerate(SCHOLARSHIPS):
        result = await scrape_scholarship(scholarship, i, data_dir)
        results.append(result)

        # Small delay between requests
        await asyncio.sleep(2)

    # Create summary
    success_count = sum(1 for r in results if r["status"] == "success")
    error_count = sum(1 for r in results if r["status"] == "error")

    summary = {
        "timestamp": datetime.now().isoformat(),
        "portal": "OASIS (AISES/Cobell)",
        "total": len(SCHOLARSHIPS),
        "success": success_count,
        "errors": error_count,
        "results": results
    }

    # Save summary
    summary_path = data_dir / "scrape_summary.json"
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"STATUS: Scraping complete! Success: {success_count}, Errors: {error_count}")
    print(f"PROGRESS: {len(SCHOLARSHIPS)}/{len(SCHOLARSHIPS)}: Complete")

    # Print result to stdout for API to capture
    print(f"RESULT: {json.dumps(summary)}")

if __name__ == "__main__":
    asyncio.run(scrape_all())
