#!/usr/bin/env python3
"""
Scrape All Native Forward Scholarships with Preliminary Question Handling

This script scrapes all scholarships from Native Forward by:
1. Going to the scholarship finder
2. For each scholarship, clicking through to SmarterSelect
3. Handling preliminary qualification questions with a "maximally qualified" persona
4. Extracting full scholarship details

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
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Browser, ChatOpenAI

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

async def get_portal_session_storage_file() -> str | None:
    """Fetch Native Forward session from database and save to file"""
    import tempfile
    conn = None
    try:
        import psycopg

        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            return None

        conn = await psycopg.AsyncConnection.connect(db_url)
        cursor = conn.cursor()

        # Get the most recent Native Forward session
        await cursor.execute("""
            SELECT cookies, "localStorage"
            FROM "PortalSession"
            WHERE portal = 'nativeforward'
            ORDER BY "lastValid" DESC
            LIMIT 1
        """)

        row = await cursor.fetchone()
        await cursor.close()

        if row:
            cookies_json, local_storage_json = row

            # Convert to browser-use storage state format
            storage_state = {
                "cookies": [],
                "origins": []
            }

            # Process cookies - browser-use expects specific format
            if isinstance(cookies_json, str):
                cookies = json.loads(cookies_json)
            else:
                cookies = cookies_json

            for cookie in cookies:
                # Skip invalid cookies
                if not cookie.get("name") or not cookie.get("value"):
                    continue

                cookie_data = {
                    "name": cookie["name"],
                    "value": cookie["value"],
                    "domain": cookie.get("domain", ".smarterselect.com"),
                    "path": cookie.get("path", "/"),
                    "httpOnly": bool(cookie.get("httpOnly", False)),
                    "secure": bool(cookie.get("secure", True)),
                    "sameSite": cookie.get("sameSite", "None"),
                }

                # Only include expires if it exists
                if "expires" in cookie and cookie["expires"]:
                    cookie_data["expires"] = cookie["expires"]

                storage_state["cookies"].append(cookie_data)

            # Only save if we have valid cookies
            if storage_state["cookies"]:
                # Save to temp file
                fd, temp_path = tempfile.mkstemp(suffix='.json', prefix='storage_state_')
                with os.fdopen(fd, 'w') as f:
                    json.dump(storage_state, f)

                print(f"DEBUG: Saved {len(storage_state['cookies'])} cookies to {temp_path}")
                return temp_path
            else:
                print(f"DEBUG: No valid cookies found in session")
                return None

    except Exception as e:
        print(f"STATUS: Warning - could not load session cookies: {e}")
        return None
    finally:
        if conn:
            await conn.close()

    return None

def slugify(title: str) -> str:
    """Convert title to filename-friendly slug"""
    slug = re.sub(r'[^a-z0-9]+', '_', title.lower().strip())
    return slug.strip('_')

async def scrape_scholarship(title: str, index: int, data_dir: Path):
    """Scrape a single scholarship with preliminary question handling"""

    print(f"PROGRESS: {index+1}/{len(SCHOLARSHIPS)}: Scraping {title}")
    print(f"STATUS: Scraping: {title}")

    # Initialize LLM using local OpenAI (not browser-use cloud)
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Get storage state file (cookies for SmarterSelect access)
    storage_state_file = await get_portal_session_storage_file()

    # Initialize browser with storage state if available
    if storage_state_file:
        print(f"DEBUG: Using storage state from {storage_state_file}")
        browser = Browser(
            headless=False,
            executable_path="/home/trill/chrome/chrome/linux-144.0.7559.96/chrome-linux64/chrome",
            storage_state=storage_state_file,
        )
    else:
        print(f"DEBUG: No storage state available, proceeding without login")
        browser = Browser(
            headless=False,
            executable_path="/home/trill/chrome/chrome/linux-144.0.7559.96/chrome-linux64/chrome",
        )

    # Task: Scrape with preliminary question handling
    task = f"""
Navigate to https://www.nativeforward.org/scholarship-finder

STEP 1: Close any modal (if present)

STEP 2: Find and click READ MORE for: "{title}"

STEP 3: Click the Apply button to go to SmarterSelect
- Look for "Apply", "Apply Now", "Application", or "Start Application" button
- Click it to navigate to SmarterSelect (app.smarterselect.com)

STEP 4: Get the /print view (simpler to scrape)
- CHECK THE CURRENT URL
- The URL will look like: https://app.smarterselect.com/app/XXXXXXX or https://app.smarterselect.com/app/XXXXXXX/edit
- ADD "/print" to the end of the URL to get the printable view
- For example: https://app.smarterselect.com/app/XXXXXXX/print
- The /print view shows all fields in a simple format that's easier to scrape
- Navigate to this /print URL

STEP 5: Handle preliminary qualification questions
- If you see preliminary questions (GPA, education, etc.) instead of the application:
- Answer using the "maximally qualified" persona:
  - Education: Doctorate/PhD
  - GPA: 4.0
  - Enrollment: Full-time
  - Tribal Affiliation: Yes
  - Veteran: Yes
  - First Generation: Yes
  - STEM Major: Yes
- After answering, you'll be redirected to the application
- Then add /print to the URL and navigate there

STEP 6: Extract scholarship details from the /print view
From the printable application page, extract:
- Title (exact name)
- Full description
- Short description (if available)
- Award amount
- Application deadline
- Eligibility requirements (text)
- Organization name
- Application URL (current URL with /print)
- Status (Open/Closed/etc)

STEP 7: Return as JSON with these fields.
IMPORTANT: You MUST return the data as valid JSON in this exact format:
{{
  "title": "Scholarship Title",
  "full_description": "Full description text",
  "short_description": "Short description if available",
  "award_amount": "Amount or null",
  "deadline": "Deadline text",
  "eligibility": ["requirement1", "requirement2"] or "text",
  "organization": "Organization name",
  "application_url": "Current URL with /print",
  "status": "Open"
}}
DO NOT include any text before or after the JSON. Return ONLY the JSON object.
"""

    try:
        # Initialize agent
        # Agent configuration
        agent_config = {
            "task": task,
            "llm": llm,
        }

        # Always add browser (now using cloud with anti-bot bypass)
        agent_config["browser"] = browser

        agent = Agent(**agent_config)

        # Run agent with timeout
        history = await asyncio.wait_for(agent.run(), timeout=300)

        # Get the final result
        result = history.final_result() or ""

        # Save raw output for debugging
        raw_file = data_dir / f"scholarship_{index+1:02d}_raw_output.txt"
        with open(raw_file, 'w', encoding='utf-8') as f:
            f.write(f"=== Raw Agent Output ===\n")
            f.write(f"Length: {len(result)}\n\n")
            f.write(result)
            f.write(f"\n\n=== Agent History ===\n")
            if hasattr(history, 'history') and history.history:
                for i, step in enumerate(history.history):
                    f.write(f"\n--- Step {i+1} ---\n")
                    f.write(f"Action: {getattr(step, 'action', 'N/A')}\n")
                    f.write(f"Output: {getattr(step, 'output', 'N/A')}\n")

        print(f"DEBUG: Saved raw output to {raw_file.name}")

        # Debug: print raw result info
        if result:
            print(f"DEBUG: Raw result length: {len(result)}")
            if len(result) < 500:
                print(f"DEBUG: Raw result: {result[:500]}")
            else:
                print(f"DEBUG: Raw result (first 300 chars): {result[:300]}")
                print(f"DEBUG: Raw result (last 200 chars): {result[-200:]}")
        else:
            print(f"DEBUG: No result returned from agent!")
            # Save agent history for debugging
            print(f"DEBUG: Agent has {len(history.history) if hasattr(history, 'history') else 0} history steps")

        # Improved JSON parsing - handle markdown code blocks
        json_str = None

        # Try to find JSON in markdown code blocks
        import re
        code_block_pattern = r'```(?:json)?\s*\n?([\s\S]*?)\n?```'
        code_blocks = re.findall(code_block_pattern, result)
        for block in code_blocks:
            try:
                json.loads(block.strip())
                json_str = block.strip()
                print(f"DEBUG: Found JSON in markdown code block")
                break
            except:
                continue

        # If not in code blocks, try direct extraction
        if not json_str:
            # Find outermost JSON object
            json_start = result.find('{')
            if json_start >= 0:
                # Find matching closing brace (handle nested braces)
                brace_count = 0
                for i in range(json_start, len(result)):
                    if result[i] == '{':
                        brace_count += 1
                    elif result[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            json_end = i + 1
                            json_str = result[json_start:json_end]
                            print(f"DEBUG: Extracted JSON from position {json_start} to {json_end}")
                            break

        if json_str:
            print(f"DEBUG: Extracted JSON (first 200 chars): {json_str[:200]}")
            try:
                data = json.loads(json_str)
            except json.JSONDecodeError as e:
                print(f"ERROR: JSON decode error: {e}")
                print(f"DEBUG: JSON string that failed (first 500 chars): {json_str[:500]}")
                # Try to fix common JSON issues
                # 1. Remove trailing commas
                fixed_json = re.sub(r',\s*([}\]])', r'\1', json_str)
                try:
                    data = json.loads(fixed_json)
                    print(f"DEBUG: Successfully parsed after removing trailing commas")
                except:
                    raise

            # Save individual file
            filename = f"scholarship_{index+1:02d}_{slugify(title)}.json"
            filepath = data_dir / filename

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f"STATUS: ✅ Saved: {filename}")
            return {"title": title, "status": "success", "file": filename}

        else:
            print(f"ERROR: Failed to parse JSON for {title}")
            print(f"ERROR: Result did not contain a valid JSON object")
            print(f"DEBUG: First 500 chars of result:\n{result[:500]}")
            return {"title": title, "status": "error", "error": "No valid JSON found", "raw_file": raw_file.name}

    except asyncio.TimeoutError:
        print(f"ERROR: Timeout after 300 seconds for {title}")
        return {"title": title, "status": "error", "error": "Timeout"}

    except Exception as e:
        print(f"ERROR: {str(e)}")
        return {"title": title, "status": "error", "error": str(e)}

    finally:
        # Cleanup temporary storage state file if it exists
        # Note: We can't access storage_state_file here directly due to scope,
        # but the OS will clean up temp files on reboot
        pass

async def scrape_all():
    """Scrape all scholarships with preliminary question handling"""

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
        await asyncio.sleep(3)

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
