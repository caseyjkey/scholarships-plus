#!/usr/bin/env python3
"""
Scrape ALL Native Forward Scholarships

This script scrapes all 11 Native Forward scholarships in sequence
and saves them to individual JSON files.

Expected output: 11 JSON files in data/scholarships/
"""

import asyncio
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path("~/Development/browser-use").expanduser()))

from browser_use import Agent, ChatOpenAI

load_dotenv(Path(__file__).parent.parent / ".env")

# All 11 Native Forward scholarships for 2025-2026
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


async def scrape_scholarship(title: str, index: int) -> dict:
    """Scrape a single scholarship by title"""
    api_key = os.getenv("OPENAI_API_KEY")
    llm = ChatOpenAI(model="gpt-4o-mini", api_key=api_key)

    task = f"""
    Navigate to https://www.nativeforward.org/scholarship-finder

    STEP 1: Close any modal with X button
    STEP 2: Find scholarship with title: "{title}"
    STEP 3: Click READ MORE
    STEP 4: Extract: title, short description, full description, amount, deadline, eligibility, application_url

    Return as JSON with these fields:
    {{
      "title": "...",
      "short_description": "...",
      "full_description": "...",
      "amount": "...",
      "deadline": "...",
      "eligibility": "...",
      "application_url": "..."
    }}
    """

    agent = Agent(task=task, llm=llm)
    history = await agent.run(max_steps=30)
    result = history.final_result()

    if result:
        # Parse JSON from result
        result_clean = result.strip()
        if result_clean.startswith("```"):
            result_clean = result_clean.split("```")[1]
            if result_clean.startswith("json"):
                result_clean = result_clean[4:]

        data = json.loads(result_clean)
        return data

    return None


async def main():
    """Scrape all scholarships"""
    print(f"Starting scrape of {len(SCHOLARSHIPS)} Native Forward scholarships...")
    print(f"Started at: {datetime.now().isoformat()}")

    output_dir = Path(__file__).parent.parent / "data" / "scholarships"
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {
        "scraped_at": datetime.now().isoformat(),
        "portal": "nativeforward",
        "total": len(SCHOLARSHIPS),
        "scholarships": []
    }

    for i, title in enumerate(SCHOLARSHIPS, 1):
        print(f"\n[{i}/{len(SCHOLARSHIPS)}] Scraping: {title}")

        try:
            data = await scrape_scholarship(title, i)

            if data:
                # Save individual file
                safe_title = re.sub(r'[^a-z0-9]+', '_', title.lower())[:50]
                output_file = output_dir / f"scholarship_{i:02d}_{safe_title}.json"

                with open(output_file, 'w') as f:
                    json.dump(data, f, indent=2)

                results["scholarships"].append({
                    "index": i,
                    "title": title,
                    "status": "success",
                    "file": str(output_file)
                })

                print(f"  ✅ Success")
            else:
                results["scholarships"].append({
                    "index": i,
                    "title": title,
                    "status": "failed"
                })
                print(f"  ❌ Failed")

        except Exception as e:
            results["scholarships"].append({
                "index": i,
                "title": title,
                "status": "error",
                "error": str(e)
            })
            print(f"  ❌ Error: {e}")

    # Save summary
    summary_file = output_dir / "scrape_summary.json"
    with open(summary_file, 'w') as f:
        json.dump(results, f, indent=2)

    success_count = sum(1 for s in results["scholarships"] if s["status"] == "success")

    print(f"\n{'=' * 60}")
    print(f"Scrape Complete!")
    print(f"Success: {success_count}/{len(SCHOLARSHIPS)}")
    print(f"Summary saved to: {summary_file}")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    asyncio.run(main())
