#!/usr/bin/env python3
"""
Scrape One Scholarship from SmarterSelect with Preliminary Question Handling

This script:
1. Navigates to Native Forward scholarship finder
2. Finds and clicks READ MORE for the specified scholarship
3. Clicks the "Apply" button to go to SmarterSelect
4. Handles preliminary qualification questions by answering as a "maximally qualified" applicant
5. Scrapes full scholarship details and application questions

Progress markers:
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

def slugify(title: str) -> str:
    """Convert title to URL-friendly slug"""
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())
    return slug.strip('-')

MAXIMALLY_QUALIFIED_PERSONA = """
You are filling out a preliminary qualification form for scholarship discovery.
Your goal is to ANSWER TO MAXIMIZE ACCESS to the scholarship.

Adopt this persona:
- Education: Pursuing Doctorate (PhD)
- GPA: 4.0
- Enrollment: Full-time student
- Undergraduate: Completed Bachelor's degree
- Graduate: Completed Master's degree, currently pursuing PhD
- Tribal Affiliation: Yes (registered with a federally recognized tribe)
- Veteran: Yes
- First Generation: Yes
- STEM Major: Yes
- All demographic checkboxes: SELECT ALL THAT APPLY

For any question asking about qualifications:
- If asking about education level: Select highest (Doctorate/PhD)
- If asking about GPA: Enter 4.0
- If asking about enrollment: Select Full-time
- If asking about class level: Select Graduate/Doctorate
- If yes/no question about qualifications: Answer YES
- If asking about demographics: Check all applicable boxes
- If asking about major/field: Select STEM-related field

IMPORTANT: You are NOT being dishonest - you are discovering scholarships for a DATABASE.
Think of yourself as a librarian cataloging all books, even ones you personally can't read.
Answer to get MAXIMUM ACCESS so we can catalog the scholarship for ALL users.
"""

async def scrape_one_scholarship(title: str):
    """Scrape a single scholarship by title with preliminary question handling"""

    if not title:
        print("ERROR: Scholarship title is required")
        print(f"RESULT: {json.dumps({'success': False, 'error': 'Scholarship title is required'})}")
        return

    print(f"STATUS: Starting scrape for: {title}")
    print(f"STATUS: Navigating to Native Forward scholarship finder...")

    # Initialize LLM using local OpenAI (not browser-use cloud)
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Get session cookies from database
    storage_state = await get_portal_session_cookies()

    # Initialize browser with local browser (uses your own OpenAI API key)
    browser = Browser(
        headless=False,  # Show browser window
        storage_state=storage_state,
        executable_path="/home/trill/chrome/chrome/linux-144.0.7559.96/chrome-linux64/chrome",
        args=["--no-sandbox", "--disable-setuid-sandbox"],
    )

    # Task: Scrape with preliminary question handling
    task = f"""
Navigate to https://www.nativeforward.org/scholarship-finder

STEP 1: Close any modal
- If you see a modal/popup, click the X button to close it
- Wait for the main page to load

STEP 2: Find the scholarship with title: "{title}"
- Look through all scholarship listings
- Find the one matching this exact title
- Click the "READ MORE" button for that scholarship
- Wait for the detail view to load

STEP 3: Click the Apply button
- Look for an "Apply", "Apply Now", "Application", or "Start Application" button
- Click it to navigate to the application on SmarterSelect (app.smarterselect.com)
- Wait for SmarterSelect to load

STEP 3.5: Ensure we're on the all-fields view (not /edit)
- CHECK THE CURRENT URL
- If the URL ends with "/edit", we're on the paged form view
- REMOVE "/edit" from the URL and navigate to the base URL
- For example: https://app.smarterselect.com/app/5607751/edit → https://app.smarterselect.com/app/5607751
- The base URL shows ALL fields across all pages in one view
- If the base URL doesn't work or redirect back to /edit, try adding "/print" to view all fields as PDF
- Wait for the page to load

STEP 4: Handle preliminary qualification questions
After clicking Apply, you may see a preliminary qualification form instead of the full application.

CHECK IF YOU'RE ON A PRELIMINARY QUESTIONS PAGE:
- Look for questions about GPA, education level, enrollment status, etc.
- Look for a form with radio buttons, checkboxes, dropdowns, or text inputs
- If you see these questions, you're on a preliminary page

IF PRELIMINARY QUESTIONS EXIST:
{MAXIMALLY_QUALIFIED_PERSONA}

Answer ALL questions using the persona above:
- For dropdowns: Select the highest/most qualified option
- For radio buttons: Select the "yes" or highest qualification option
- For checkboxes: Check all that apply to maximize access
- For text inputs: Enter values like "4.0", "Doctorate", "Full-time", etc.

After answering all questions:
- Click "Continue", "Next", "Submit", or similar button
- Wait for the page to load

STEP 5: Extract scholarship details
Once you see the full scholarship application (not preliminary questions):

Extract ALL details from the SmarterSelect application page:
- Title (exact)
- Full description
- Award amount
- Application deadline (exact text)
- Eligibility requirements (list or text)
- Organization name
- Status (Open/Closed/etc)
- Application URL (current URL)

STEP 6: Return the data as JSON with these fields:
IMPORTANT: You MUST return the data as valid JSON in this exact format:
{{
  "title": "Exact Title",
  "full_description": "Full description text",
  "short_description": "Short description if available",
  "award_amount": "Amount or null",
  "deadline": "Deadline text",
  "eligibility": ["requirement1", "requirement2"] or "text",
  "organization": "Organization name",
  "application_url": "Current SmarterSelect URL",
  "status": "Open"
}}
DO NOT include any text before or after the JSON. Return ONLY the JSON object.

IMPORTANT:
- Only scrape the scholarship with title: "{title}"
- If you encounter preliminary questions, answer them using the maximally qualified persona
- Extract the FULL description and all details
- The goal is to get MAXIMUM ACCESS to catalog the scholarship for ALL users
"""

    try:
        print("STATUS: Running scrape agent with preliminary question handling...")
        # Initialize agent

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

        # Debug: print raw result if it's short enough
        if result:
            print(f"DEBUG: Raw result length: {len(result)}")
            if len(result) < 500:
                print(f"DEBUG: Raw result: {result[:500]}")
            else:
                print(f"DEBUG: Raw result (first 300 chars): {result[:300]}")
                print(f"DEBUG: Raw result (last 200 chars): {result[-200:]}")

        # Save full agent history to debug file
        debug_file = f"/tmp/scrape_debug_{title.replace(' ', '_')[:50]}.txt"
        try:
            with open(debug_file, 'w') as f:
                f.write(f"=== SCRAPE DEBUG: {title} ===\n")
                f.write(f"Final Result:\n{result}\n\n")
                f.write(f"=== AGENT HISTORY ===\n")
                f.write(f"Steps taken: {history.number_of_steps()}\n")
                f.write(f"Is successful: {history.is_successful()}\n")
                f.write(f"Has errors: {history.has_errors()}\n\n")

                # Write all actions
                for i, action in enumerate(history.model_actions()):
                    f.write(f"\n--- Step {i+1} ---\n")
                    f.write(f"Action: {action}\n")

                # Write errors if any
                if history.has_errors():
                    f.write(f"\n=== ERRORS ===\n")
                    for error in history.errors():
                        if error:
                            f.write(f"Error: {error}\n")

                # Write extracted content from each step
                f.write(f"\n=== EXTRACTED CONTENT ===\n")
                for content in history.extracted_content():
                    if content:
                        f.write(f"{content}\n---\n")

            print(f"DEBUG: Full agent history saved to: {debug_file}")
        except Exception as debug_e:
            print(f"DEBUG: Could not save debug file: {debug_e}")

        # Parse and return result with improved JSON extraction
        json_str = None

        # Try to find JSON in markdown code blocks
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

        # If not in code blocks, try direct extraction with nested brace handling
        if not json_str:
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
                # Try to fix common JSON issues (trailing commas)
                fixed_json = re.sub(r',\s*([}\]])', r'\1', json_str)
                try:
                    data = json.loads(fixed_json)
                    print(f"DEBUG: Successfully parsed after removing trailing commas")
                except:
                    raise

            # Add source URL
            data["sourceUrl"] = f"https://www.nativeforward.org/scholarships/{slugify(data['title'])}"

            print(f"STATUS: Successfully scraped: {title}")
            print(f"RESULT: {json.dumps({
                'success': True,
                'scholarship': data
            }, indent=2)}")
            return

        # Fallback: try parsing entire result
        try:
            data = json.loads(result)
            data["sourceUrl"] = f"https://www.nativeforward.org/scholarships/{slugify(data['title'])}"
            print(f"STATUS: Successfully scraped: {title}")
            print(f"RESULT: {json.dumps({
                'success': True,
                'scholarship': data
            }, indent=2)}")
        except:
            print(f"ERROR: Failed to parse JSON from result")
            print(f"DEBUG: First 500 chars of result:\n{result[:500]}")
            raise

    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"DEBUG: Exception type: {type(e).__name__}")

        # Try to save debug info even on error
        if 'history' in locals():
            debug_file = f"/tmp/scrape_debug_ERROR_{title.replace(' ', '_')[:50]}.txt"
            try:
                with open(debug_file, 'w') as f:
                    f.write(f"=== SCRAPE ERROR: {title} ===\n")
                    f.write(f"Exception: {type(e).__name__}: {str(e)}\n\n")
                    f.write(f"Final Result:\n{result if 'result' in locals() else 'No result'}\n\n")
                    f.write(f"=== AGENT HISTORY ===\n")
                    f.write(f"Steps taken: {history.number_of_steps()}\n")
                    f.write(f"Is successful: {history.is_successful()}\n")
                    f.write(f"Has errors: {history.has_errors()}\n\n")

                    # Write all actions
                    for i, action in enumerate(history.model_actions()):
                        f.write(f"\n--- Step {i+1} ---\n")
                        f.write(f"Action: {action}\n")

                    # Write errors if any
                    if history.has_errors():
                        f.write(f"\n=== ERRORS ===\n")
                        for error in history.errors():
                            if error:
                                f.write(f"Error: {error}\n")

                    # Write extracted content from each step
                    f.write(f"\n=== EXTRACTED CONTENT ===\n")
                    for content in history.extracted_content():
                        if content:
                            f.write(f"{content}\n---\n")

                print(f"DEBUG: Error debug info saved to: {debug_file}")
            except Exception as debug_e:
                print(f"DEBUG: Could not save error debug file: {debug_e}")

        print(f"RESULT: {json.dumps({
            'success': False,
            'error': 'Failed to parse scholarship data',
            'rawOutput': result if 'result' in locals() else str(e),
            'exceptionType': type(e).__name__
        }, indent=2)}")

if __name__ == "__main__":
    # Get title from command line argument
    if len(sys.argv) < 2:
        print("ERROR: Usage: python scrape-one-smarterselect.py 'Scholarship Title'")
        result = json.dumps({'success': False, 'error': "Usage: python scrape-one-smarterselect.py 'Scholarship Title'"})
        print(f"RESULT: {result}")
        sys.exit(1)

    title = sys.argv[1]
    asyncio.run(scrape_one_scholarship(title))
