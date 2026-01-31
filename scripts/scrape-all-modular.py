#!/usr/bin/env python3
"""
Scrape All Native Forward Scholarships

This script scrapes all scholarships from Native Forward
by iterating through the known list or discovering them first.
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
from langchain_openai import ChatOpenAI

# Known scholarships list (from previous discovery)
SCHOLARSHIPS = [
    "BIE Internship Funding for STEM Students 2025-2026",
    "BIE Professional Development Funding for STEM Educators and Students 2025-2026",
    "BIE Professional Examination Funding 2025-2026",
    "Native Forward Community Impact Research Funding 2025-2026",
    "Native Forward CPA Examination Funding 2025-2026",
    "Miller Indigenous Economic Development Fellowship 2025-2026",
    "Native Forward Scholars Fund 2026-2027 Scholarship Application",
    "Native Forward Scholars Fund Internship Assistance Program 2025-2026",
    "Native Forward Scholars Fund Professional Development Assistance Program 2025-2026",
    "Native Forward Student Access Funding 2025-2026",
    "Native Forward Student Relief Funding Spring 2025-2026",
]

def slugify(title: str) -> str:
    """Convert title to filename-friendly slug"""
    slug = re.sub(r'[^a-z0-9]+', '_', title.lower().strip())
    return slug.strip('_')

async def scrape_scholarship(title: str, index: int, data_dir: Path):
    """Scrape a single scholarship"""

    print(f"PROGRESS: {index+1}/{len(SCHOLARSHIPS)}: Scraping {title}")
    print(f"STATUS: Scraping: {title}")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize controller
    controller = Controller()

    # Task: Scrape specific scholarship
    task = f"""
Navigate to https://www.nativeforward.org/scholarship-finder

STEP 1: Close any modal (if present)

STEP 2: Find and click READ MORE for: "{title}"

STEP 3: Extract all details:
- Title
- Full description
- Short description
- Award amount
- Application deadline
- Eligibility requirements
- Application link
- Status

STEP 4: Return as JSON with these fields.

IMPORTANT: Only scrape the scholarship titled "{title}"
"""

    try:
        # Initialize agent
        agent = Agent(
            task=task,
            llm=llm,
            controller=controller,
        )

        # Run agent with timeout
        result = await asyncio.wait_for(agent.run(), timeout=120)

        # Parse result
        json_start = result.find('{')
        json_end = result.rfind('}') + 1

        if json_start >= 0 and json_end > json_start:
            json_str = result[json_start:json_end]
            data = json.loads(json_str)

            # Save individual file
            filename = f"scholarship_{index+1:02d}_{slugify(title)}.json"
            filepath = data_dir / filename

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f"STATUS: ✅ Saved: {filename}")
            return {"title": title, "status": "success", "file": filename}

        else:
            print(f"ERROR: Failed to parse JSON for {title}")
            return {"title": title, "status": "error", "error": "No valid JSON found"}

    except asyncio.TimeoutError:
        print(f"ERROR: Timeout after 120 seconds for {title}")
        return {"title": title, "status": "error", "error": "Timeout"}

    except Exception as e:
        print(f"ERROR: {str(e)}")
        return {"title": title, "status": "error", "error": str(e)}

async def scrape_all():
    """Scrape all scholarships"""

    # Create data directory
    data_dir = Path.cwd() / "data" / "scholarships"
    data_dir.mkdir(parents=True, exist_ok=True)

    print(f"STATUS: Starting scrape of {len(SCHOLARSHIPS)} scholarships...")
    print(f"PROGRESS: 0/{len(SCHOLARSHIPS)}: Initializing")

    results = []

    # Scrape each scholarship
    for i, title in enumerate(SCHOLARSHIPS):
        result = await scrape_scholarship(title, i, data_dir)
        results.append(result)

        # Small delay between requests
        await asyncio.sleep(2)

    # Create summary
    success_count = sum(1 for r in results if r["status"] == "success")
    error_count = sum(1 for r in results if r["status"] == "error")

    summary = {
        "timestamp": datetime.now().isoformat(),
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
