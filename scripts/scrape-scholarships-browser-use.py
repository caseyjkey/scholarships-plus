#!/usr/bin/env python3
"""
Scholarship Scraper using Browser-Use

Usage:
  cd scripts
  python scrape-scholarships-browser-use.py

This script uses browser-use library to scrape scholarships from
Native Forward portal, bypassing Cloudflare protection.

Requirements:
  - OPENAI_API_KEY environment variable (already configured in .env)
  - Python 3.11+
  - PostgreSQL database connection
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Add parent directory to path to import browser_use
sys.path.insert(0, str(Path("~/Development/browser-use").expanduser()))

from browser_use import Agent, ChatOpenAI

# Load environment variables from project root
load_dotenv(Path(__file__).parent.parent / ".env")


class ScrapedScholarship(BaseModel):
    """Structured output model for scholarship data"""
    title: str = Field(description="The title/name of the scholarship")
    description: str = Field(description="Detailed description of the scholarship")
    amount: Optional[str] = Field(default=None, description="Award amount as displayed on page")
    deadline: Optional[str] = Field(default=None, description="Application deadline as displayed on page")
    eligibility: Optional[str] = Field(default=None, description="Eligibility requirements")
    application_url: Optional[str] = Field(default=None, description="Direct link to application page")
    source_url: str = Field(description="URL where this scholarship was found")


class ScholarshipList(BaseModel):
    """Container for multiple scholarships"""
    scholarships: List[ScrapedScholarship] = Field(default_factory=list, description="List of scholarships found on the page")


async def scrape_nativeforward_scholarships() -> List[ScrapedScholarship]:
    """
    Scrape scholarships from Native Forward portal using browser-use.

    Returns:
        List of ScrapedScholarship objects
    """
    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable not set")
        print("Add to your .env file: OPENAI_API_KEY=your_key_here")
        sys.exit(1)

    print("Starting browser-use agent with OpenAI...")
    print(f"Target: https://www.nativeforward.org/scholarship-finder")

    # Create the LLM with OpenAI (gpt-4o-mini for fast, cost-effective automation)
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=api_key,
    )

    # Define the task with clear instructions for structured output
    task = """
    Navigate to https://www.nativeforward.org/scholarship-finder

    Wait for the page to fully load, including any JavaScript-rendered content.

    Extract ALL scholarships visible on the page. For each scholarship, capture:
    1. Title/name
    2. Description (full text, not truncated)
    3. Award amount (exactly as displayed)
    4. Application deadline (exactly as displayed)
    5. Eligibility requirements (if available)
    6. Application URL (the link to apply)

    Return the results as a JSON structure with a "scholarships" array containing all entries.
    """

    # Create agent with the task
    agent = Agent(
        task=task,
        llm=llm,
    )

    print("Running agent (this may take 1-2 minutes)...")

    try:
        # Run the agent
        history = await agent.run(max_steps=50)

        # Extract results from the final state
        result = history.final_result()

        if result:
            print("Successfully extracted data!")

            # Try to parse as JSON
            try:
                data = json.loads(result)
                if "scholarships" in data:
                    scholarships = [ScrapedScholarship(**s) for s in data["scholarships"]]
                    print(f"Found {len(scholarships)} scholarships")
                    return scholarships
            except Exception as e:
                print(f"Could not parse structured output: {e}")
                print(f"Raw result: {result}")

        # If structured extraction failed, try to extract from the agent's history
        print("Attempting to extract from agent history...")
        # For now, return empty list and let the user know
        return []

    except Exception as e:
        print(f"Error during scraping: {e}")
        import traceback
        traceback.print_exc()
        return []


def save_to_json(scholarships: List[ScrapedScholarship], output_path: str):
    """Save scholarships to JSON file for inspection"""
    data = {
        "scraped_at": datetime.now().isoformat(),
        "count": len(scholarships),
        "scholarships": [s.model_dump() for s in scholarships]
    }

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved {len(scholarships)} scholarships to {output_path}")


async def main():
    """Main entry point"""
    print("=" * 60)
    print("Scholarship Scraper - Browser-Use Edition")
    print("=" * 60)

    # Check API key
    if not os.getenv("OPENAI_API_KEY"):
        print("\nERROR: OPENAI_API_KEY not found!")
        print("\nTo get started:")
        print("1. Get an API key from: https://platform.openai.com/api-keys")
        print("2. Add to your .env file:")
        print("   OPENAI_API_KEY=your_key_here")
        print("\nOr set via environment variable:")
        print("   export OPENAI_API_KEY=your_key_here")
        sys.exit(1)

    # Scrape scholarships
    scholarships = await scrape_nativeforward_scholarships()

    if not scholarships:
        print("\nNo scholarships found or extraction failed.")
        print("The agent may have encountered an error or the page structure may have changed.")
        sys.exit(1)

    # Save to JSON for inspection
    output_dir = Path(__file__).parent.parent / "data" / "scholarships"
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"nativeforward_{timestamp}.json"

    save_to_json(scholarships, str(output_path))

    print("\n" + "=" * 60)
    print(f"SUCCESS: Extracted {len(scholarships)} scholarships")
    print(f"Output: {output_path}")
    print("=" * 60)

    # Show sample data
    if scholarships:
        print("\nSample scholarship:")
        s = scholarships[0]
        print(f"  Title: {s.title}")
        print(f"  Amount: {s.amount}")
        print(f"  Deadline: {s.deadline}")


if __name__ == "__main__":
    asyncio.run(main())
