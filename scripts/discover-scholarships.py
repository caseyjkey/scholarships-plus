#!/usr/bin/env python3
"""
Discover Scholarships on Native Forward

This script discovers and lists all scholarships on nativeforward.org
without clicking into each one. It returns titles, positions, and source URLs.

Progress markers:
- STATUS: message
- RESULT: json
"""

import asyncio
import json
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Browser, ChatOpenAI

async def get_portal_session_cookies():
    """Fetch Native Forward session cookies from database"""
    try:
        import psycopg
        from dotenv import load_dotenv
        load_dotenv()

        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            return None

        conn = await psycopg.AsyncConnection.connect(db_url)
        cursor = conn.cursor()

        # Get the most recent Native Forward session for the admin user
        await cursor.execute("""
            SELECT cookies, "localStorage"
            FROM "PortalSession"
            WHERE portal = 'nativeforward'
            ORDER BY "lastValid" DESC
            LIMIT 1
        """)

        row = await cursor.fetchone()
        await cursor.close()
        conn.close()

        if row:
            cookies_json, local_storage_json = row
            # Convert JSON cookies to browser-use format
            if isinstance(cookies_json, str):
                cookies = json.loads(cookies_json)
            else:
                cookies = cookies_json

            # Convert to browser-use cookie format
            browser_cookies = []
            for cookie in cookies:
                browser_cookies.append({
                    "name": cookie.get("name", ""),
                    "value": cookie.get("value", ""),
                    "domain": cookie.get("domain", ".smarterselect.com"),
                    "path": cookie.get("path", "/"),
                })

            return {
                "cookies": browser_cookies,
                "origins": []
            }
    except Exception as e:
        print(f"STATUS: Warning - could not load session cookies: {e}")

    return None

async def discover_scholarships():
    """Discover all scholarships on the scholarship finder page"""

    print("STATUS: Navigating to Native Forward scholarship finder...")

    # Initialize LLM using local OpenAI (not browser-use cloud)
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Get session cookies (optional for discover, but good for consistency)
    storage_state = await get_portal_session_cookies()

    # Initialize browser with local browser (uses your own OpenAI API key)
    browser = Browser(
        headless=False,  # Show browser window
        storage_state=storage_state,
        executable_path="/home/trill/chrome/chrome/linux-144.0.7559.96/chrome-linux64/chrome",
        args=["--no-sandbox", "--disable-setuid-sandbox"],
    )

    # Task: Discover scholarships without clicking READ MORE
    task = """
Navigate to https://www.nativeforward.org/scholarship-finder

STEP 1: Close any modal
- If you see a modal/popup, click the X button to close it
- Wait for the main page to load

STEP 2: Identify ALL scholarships on the page
- Look for the scholarship listing/cards
- Count how many scholarships are shown
- For each scholarship, extract:
  * Title (exact text)
  * Position (1st, 2nd, 3rd, etc. - order from top to bottom)
  * Source URL (construct as: https://www.nativeforward.org/scholarships/[title-in-kebab-case])

STEP 3: Return as JSON
{
  "scholarships": [
    {
      "title": "Scholarship Name Here",
      "position": 1,
      "sourceUrl": "https://www.nativeforward.org/scholarships/scholarship-name-here"
    }
  ]
}

IMPORTANT:
- DO NOT click any READ MORE buttons
- DO NOT navigate away from the main page
- Just extract the titles and positions from the listing view
"""

    try:
        # Initialize agent
        print("STATUS: Running discovery agent...")

        # Agent configuration
        agent_config = {
            "task": task,
            "llm": llm,
        }

        # Always add browser (now using cloud with anti-bot bypass)
        agent_config["browser"] = browser

        agent = Agent(**agent_config)

        # Run agent
        history = await agent.run()

        # Get the final result
        result = history.final_result() or ""

        # Try to extract JSON from result
        json_start = result.find('{')
        json_end = result.rfind('}') + 1

        if json_start >= 0 and json_end > json_start:
            json_str = result[json_start:json_end]
            discovery = json.loads(json_str)

            # Validate structure
            if "scholarships" in discovery:
                count = len(discovery["scholarships"])
                print(f"STATUS: Discovery complete! Found {count} scholarships")
                print(f"RESULT: {json.dumps({
                    "success": True,
                    "count": count,
                    "scholarships": discovery["scholarships"]
                }, indent=2)}")
                return

        # Fallback: try parsing entire result
        discovery = json.loads(result)
        count = len(discovery.get("scholarships", []))
        print(f"STATUS: Discovery complete! Found {count} scholarships")
        print(f"RESULT: {json.dumps(discovery, indent=2)}")

    except json.JSONDecodeError:
        # If no valid JSON found, return error
        print("STATUS: Discovery failed - could not parse results")
        print(f"RESULT: {json.dumps({
            "success": False,
            "error": "Failed to parse scholarship discovery",
            "rawOutput": result
        }, indent=2)}")
    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"RESULT: {json.dumps({
            "success": False,
            "error": str(e)
        }, indent=2)}")

if __name__ == "__main__":
    asyncio.run(discover_scholarships())
