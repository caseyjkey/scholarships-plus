#!/usr/bin/env python3
"""
Scrape Detailed Scholarship Info from Native Forward with Application Questions

This script loads a saved Native Forward session and scrapes detailed scholarship
information including individual requirements, deadlines, and ALL application questions.
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import List

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

async def scrape_detailed_scholarships(session_id: str, output_file: str = None):
    """Scrape detailed scholarship information from Native Forward using saved session"""

    print(f"STATUS: Loading session {session_id}...")
    session_data = await load_session_from_api(session_id)
    print(f"STATUS: Session loaded successfully")

    print(f"STATUS: Starting detailed scholarship scrape from Native Forward...")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    controller = Controller()

    task = """
You are scraping detailed scholarship information from the Native Forward portal.

IMPORTANT: We need to build an application preparation flow. This means we must capture ALL application questions so students can prepare answers BEFORE the agent fills out the form.

STEP 1: Navigate to scholarship finder
- Go to https://app.smarterselect.com/programs/105572-Native-Forward-Scholars-Fund
- Log in if needed (session should be loaded)

STEP 2: For EACH scholarship found, extract the scholarship data (HTML/JSON content)

STEP 3: For EACH scholarship, use this extraction framework:

Extract ALL requirements using this flexible structure:
{
  "title": "exact scholarship title",
  "description": "full description text",
  "award_amount": "$X,XXX or Variable",
  "deadline": "Month DD, YYYY",
  "application_url": "https://...",

  "requirements": {
    // Basic eligibility
    "gpa_min": <number or null>,
    "gpa_required": <boolean>,
    "gpa_details": "any specific GPA requirements (e.g., 'in major courses')",

    "enrollment_status": "full_time" | "part_time" | "any" | null,
    "class_level": ["undergraduate", "graduate", "phd", "professional", "vocational"],

    // Tribal/AI/AN requirements
    "tribal_enrollment_required": <boolean>,
    "tribal_documentation": ["Certificate of Indian Blood", "Tribal ID", "CIB", "Blood Quantum documentation"],
    "tribal_enrollment_details": "specific tribal requirements (e.g., 'federally recognized tribe', 'CIB of 1/4+')",

    // References/Letters
    "referral_count": <number>,
    "referral_details": "how many letters of recommendation",
    "reference_requirements": ["must be from professors", "at least one from tribal community"],

    // Documents
    "transcript_required": <boolean>,
    "transcript_details": "official vs unofficial, requirements",
    "fafsa_required": <boolean>,
    "identity_documents": ["driver's license", "tribal ID", "social security card"],

    // Essays
    "essay_required": <boolean>,
    "essay_count": <number>,
    "essay_prompts": [
      "prompt 1 topic/word count",
      "prompt 2 topic/word count"
    ],
    "essay_word_limits": [500, 750],

    // Field restrictions
    "field_of_study_required": <boolean>,
    "field_of_study": ["Computer Science", "Engineering", "STEM", "any"],
    "geographic_restrictions": "state or region restrictions",

    // Other requirements (catch-all for anything unusual)
    "special_requirements": [
      "Must be pursuing degree at 1994 Land-Grant Institution",
      "Must demonstrate financial need",
      "Must be U.S. citizen",
      "Any other unique requirements"
    ]
  }
}

CRITICAL INSTRUCTIONS:
- Extract EVERY requirement, even if it doesn't fit standard fields
- Put unusual/unique requirements in special_requirements array
- Capture exact documentation requirements (tribal ID, CIB, etc.)
- Note exact GPA numbers (3.0, 2.5, etc.)
- Count exact number of recommendations
- Specify exact enrollment requirements
- Note word/character limits for essays
- If a requirement is mentioned, capture it!

Return as JSON:
{
  "scholarships": [
    {
      "title": "...",
      "requirements": { ... }
    }
  ]
}
"""

    try:
        # Use cloud browser to avoid bot detection
        browser = Browser(use_cloud=True)

        agent = Agent(
            task=task,
            llm=llm,
            controller=controller,
            browser=browser
        )

        result = await agent.run()

        # Try to extract JSON
        json_start = result.find('{')
        json_end = result.rfind('}') + 1

        if json_start >= 0 and json_end > json_start:
            json_str = result[json_start:json_end]
            data = json.loads(json_str)

            # Save to file
            if output_file:
                with open(output_file, 'w') as f:
                    json.dump(data, f, indent=2)
                print(f"STATUS: Saved to {output_file}")

            print(f"STATUS: Scraped {len(data['scholarships'])} scholarships")
            print(f"RESULT: {json.dumps({'success': True, 'count': len(data['scholarships']), 'scholarships': data['scholarships']}, indent=2)}")
        else:
            print(f"RESULT: {result}")

    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"RESULT: {json.dumps({'success': False, 'error': str(e)})}")

async def scrape_single_scholarship(session_id: str, scholarship_title: str, output_file: str = None):
    """Scrape details for a single scholarship"""

    print(f"STATUS: Loading session {session_id}...")
    session_data = await load_session_from_api(session_id)

    print(f"STATUS: Scraping details for: {scholarship_title}")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    controller = Controller()

    task = f"""
You are scraping detailed information for ONE scholarship from the Native Forward portal.

IMPORTANT: We need to capture ALL application questions so the student can prepare answers BEFORE the agent fills out the form.

SCHOLARSHIP: {scholarship_title}

STEP 1: Navigate to SmarterSelect program
- Go to https://app.smarterselect.com/programs/105572-Native-Forward-Scholars-Fund

STEP 2: Find and click on the scholarship titled "{scholarship_title}"

STEP 3: Navigate through ALL sections of the application and extract EVERY question/field

For EACH section in the application:
- Section name
- All questions/fields in that section with:
  * ID/field name
  * Label/question text (exact wording)
  * Input type (text, textarea, dropdown, radio, checkbox, file upload)
  * Required (yes/no)
  * Options (if dropdown/radio/checkbox - list all choices)
  * Word/character limit (if specified)

STEP 4: Return as JSON:
{{
  "title": "{scholarship_title}",
  "organization": "Native Forward",
  "description": "Full description...",
  "award_amount": "$X,XXX",
  "deadline": "Month DD, YYYY",
  "status": "Open",
  "application_url": "https://...",
  "requirements": {{
    "gpa_min": 3.0,
    "gpa_required": true,
    "enrollment_status": "full_time",
    "class_level": ["undergraduate"],
    "tribal_enrollment_required": true,
    "referral_count": 2,
    "transcript_required": true,
    "essay_required": true,
    "essay_topics": ["topic1", "topic2"],
    "other_requirements": ["Must be US citizen", "Minimum 2.5 GPA in major"]
  }},
  "application_sections": [
    {{
      "name": "Personal Information",
      "questions": [
        {{
          "id": "first_name",
          "label": "First Name",
          "type": "text",
          "required": true
        }},
        {{
          "id": "email",
          "label": "Email Address",
          "type": "text",
          "required": true
        }}
      ]
    }},
    {{
      "name": "Essays",
      "questions": [
        {{
          "id": "essay_career",
          "label": "Describe your career goals and how this scholarship will help...",
          "type": "textarea",
          "required": true,
          "word_limit": 500
        }}
      ]
    }}
  ]
}}

CRITICAL:
- Navigate through ALL sections/pages of the application
- Extract EVERY single question/field
- Get EXACT question wording
- Note which are required vs optional
- Capture all dropdown options
- Note word/character limits
"""

    try:
        browser = Browser(use_cloud=True)
        agent = Agent(task=task, llm=llm, controller=controller, browser=browser)
        result = await agent.run()

        # Try to extract JSON
        json_start = result.find('{')
        json_end = result.rfind('}') + 1

        if json_start >= 0 and json_end > json_start:
            json_str = result[json_start:json_end]
            data = json.loads(json_str)

            # Save to file
            if output_file:
                with open(output_file, 'w') as f:
                    json.dump(data, f, indent=2)
                print(f"STATUS: Saved to {output_file}")

            print(f"RESULT: {json.dumps({'success': True, 'scholarship': data}, indent=2)}")
        else:
            print(f"RESULT: {result}")

    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(f"RESULT: {json.dumps({'success': False, 'error': str(e)})}")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scrape detailed Native Forward scholarship info")
    parser.add_argument("--session-id", required=True, help="Session ID from database")
    parser.add_argument("--scholarship", help="Scrape single scholarship by title")
    parser.add_argument("--output", help="Output JSON file path")

    args = parser.parse_args()

    output_file = args.output or Path.home() / "Development" / "scholarships-plus" / "data" / "nativeforward" / "detailed_scholarships.json"

    if args.scholarship:
        asyncio.run(scrape_single_scholarship(args.session_id, args.scholarship, args.output))
    else:
        asyncio.run(scrape_detailed_scholarships(args.session_id, str(output_file)))
