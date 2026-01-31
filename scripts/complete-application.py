#!/usr/bin/env python3
"""
Load OASIS Session from API and Use in Browser-Use Agent

This script retrieves a saved OASIS session from your app's API
and uses it to scrape or complete scholarship applications.
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

# Add browser-use to path
sys.path.insert(0, str(Path.home() / "Development" / "browser-use"))

from browser_use import Agent, Controller, Browser
from browser_use.llm import ChatOpenAI
import aiohttp

async def load_session_from_api(session_id: str, api_base_url: str = "http://localhost:3030") -> dict:
    """Load session from your app's API"""

    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{api_base_url}/api/oasis.session/{session_id}",
            headers={"Content-Type": "application/json"}
        ) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"Failed to load session: {response.status} - {error_text}")

async def get_current_user_session(api_base_url: str = "http://localhost:3030") -> dict:
    """Load current user's active OASIS session"""
    # This would require authentication - for now using session_id approach
    raise NotImplementedError("Use session_id approach for now")

async def complete_application_with_session(
    session_id: str,
    scholarship_title: str,
    prepared_answers: dict = None,
    answers_url: str = None,
    api_base_url: str = "http://localhost:3030"
):
    """Complete a scholarship application using saved session and prepared answers

    Args:
        session_id: PortalSession ID from database
        scholarship_title: Exact title of scholarship
        prepared_answers: Dict of prepared answers {question_id: answer_value}
        answers_url: URL to fetch prepared answers from API
        api_base_url: Base URL for API
    """

    print(f"STATUS: Loading session {session_id}...")

    # Load session from API
    session_data = await load_session_from_api(session_id, api_base_url)

    print(f"STATUS: Session loaded with {len(session_data['cookies'])} cookies")
    print(f"STATUS: Expires at: {session_data['expiresAt']}")

    # Load prepared answers
    answers = prepared_answers
    if answers_url and not answers:
        async with aiohttp.ClientSession() as session:
            async with session.get(answers_url) as response:
                if response.status == 200:
                    data = await response.json()
                    answers = data.get('answers', {})

    if not answers:
        raise ValueError("No prepared answers provided. Cannot complete application.")

    print(f"STATUS: Loaded {len(answers)} prepared answers")

    # Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize browser
    controller = Controller()

    # Format answers for the agent
    answers_json = json.dumps(answers, indent=2)

    task = f"""
You are completing a scholarship application on the OASIS portal using PREPARED ANSWERS.
The student has already reviewed and approved all answers - you just need to fill them in.

SCHOLARSHIP: {scholarship_title}

PREPARED ANSWERS (use these exactly):
{answers_json}

STEP 1: Navigate to application
- Go to https://aises.awardspring.com/ACTIONS/Welcome.cfm
- Find the application for: "{scholarship_title}"
- Click on it to start the application

STEP 2: Fill each section with prepared answers
- For each field/question, find the matching answer in PREPARED ANSWERS
- Use the answer EXACTLY as provided (don't modify or paraphrase)
- For dropdowns/radios, select the option that matches the answer
- For text fields, type the answer exactly
- For file uploads, use the provided file_id to upload from Google Drive
- Check checkboxes that match the answer values

STEP 3: Review and submit
- Review all filled fields match the prepared answers
- Submit the application
- Confirm successful submission

IMPORTANT:
- Use prepared answers EXACTLY - don't ask questions or modify
- Match answer keys to field labels (e.g., "first_name" → "First Name" field)
- For dropdowns, find the option that matches the answer value
- Report any fields without matching prepared answers
- Report any submission errors
"""

    try:
        print(f"STATUS: Starting agent...")

        # Use cloud browser for application completion to avoid bot detection
        # Cloud provides:
        # - CAPTCHA bypass
        # - Natural mouse movements
        # - Human-like typing patterns
        # - Real browser fingerprints
        browser = Browser(use_cloud=True)

        agent = Agent(
            task=task,
            llm=llm,
            controller=controller,
            browser=browser
        )

        result = await agent.run()

        print(f"RESULT: {result}")

    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"RESULT: {json.dumps({'success': False, 'error': str(e)})}")

async def list_scholarships_with_session(
    session_id: str,
    api_base_url: str = "http://localhost:3030"
):
    """List available scholarships using saved session"""

    print(f"STATUS: Loading session {session_id}...")

    # Load session from API
    session_data = await load_session_from_api(session_id, api_base_url)

    print(f"STATUS: Session loaded")
    print(f"STATUS: Listing available scholarships...")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    controller = Controller()

    task = """
You are viewing the OASIS scholarship portal for a student.

STEP 1: Navigate to dashboard
- Go to https://aises.awardspring.com/ACTIONS/Welcome.cfm

STEP 2: List all available scholarships
- Find all scholarship applications
- For each one, extract:
  * Title
  * Organization (AISES or Cobell)
  * Current status (Not Started, In Progress, Submitted, etc.)
  * Deadline

STEP 3: Return as JSON:
{
  "scholarships": [
    {
      "title": "Scholarship Name",
      "organization": "AISES/Cobell",
      "status": "Not Started",
      "deadline": "Date"
    }
  ]
}
"""

    try:
        # Use regular browser for listing (just reading, no form submission)
        browser = Browser()
        agent = Agent(task=task, llm=llm, controller=controller, browser=browser)
        result = await agent.run()
        print(f"RESULT: {result}")

    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Complete OASIS scholarship applications with prepared answers",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List available scholarships
  python complete-application.py --session-id SESSION_ID --list

  # Complete application with answers from file
  python complete-application.py --session-id SESSION_ID --scholarship "Cobell Undergraduate" --answers-file answers.json

  # Complete application with answers from API
  python complete-application.py --session-id SESSION_ID --scholarship "Cobell Undergraduate" --answers-url http://localhost:3030/api/applications/ID/answers
        """
    )

    parser.add_argument("--session-id", required=True, help="Session ID from database")
    parser.add_argument("--scholarship", help="Specific scholarship to complete")
    parser.add_argument("--list", action="store_true", help="List available scholarships")
    parser.add_argument("--answers-file", help="JSON file with prepared answers")
    parser.add_argument("--answers-url", help="API URL to fetch prepared answers")
    parser.add_argument("--output", help="Output file for result")

    args = parser.parse_args()

    if args.list:
        asyncio.run(list_scholarships_with_session(args.session_id))
    elif args.scholarship:
        # Load prepared answers
        prepared_answers = None
        if args.answers_file:
            with open(args.answers_file, 'r') as f:
                prepared_answers = json.load(f)

        asyncio.run(complete_application_with_session(
            args.session_id,
            args.scholarship,
            prepared_answers=prepared_answers,
            answers_url=args.answers_url
        ))
    else:
        print("Please specify --list or --scholarship TITLE")
        print("If completing an application, provide --answers-file or --answers-url")
