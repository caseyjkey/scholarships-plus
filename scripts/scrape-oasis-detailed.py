#!/usr/bin/env python3
"""
Scrape Detailed Scholarship Info from OASIS Using Saved Session

This script loads a saved OASIS session and scrapes detailed scholarship
information including individual requirements, deadlines, and application status.
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
    """Scrape detailed scholarship information from OASIS using saved session"""

    print(f"STATUS: Loading session {session_id}...")
    session_data = await load_session_from_api(session_id)
    print(f"STATUS: Session loaded successfully")

    print(f"STATUS: Starting detailed scholarship scrape from OASIS...")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    controller = Controller()

    task = """
You are scraping detailed scholarship information from the OASIS portal for AISES and Cobell scholarships.

IMPORTANT: We need to build an application preparation flow. This means we must capture ALL application questions so students can prepare answers BEFORE the agent fills out the form.

STEP 1: Navigate to scholarship dashboard
- Go to https://aises.awardspring.com/ACTIONS/Welcome.cfm

STEP 2: For EACH scholarship found, do the following:

For each scholarship:
1. Click on it to view the application
2. Navigate through ALL sections/pages of the application
3. Extract EVERY question, field, and input

Extract the following information:

BASIC INFO:
- Title (exact)
- Organization (AISES or Cobell)
- Full description
- Award amount (specific if listed, or "Variable")
- Application deadline (exact date)
- Application status (Open/Closed/Draft/etc)
- Application URL

REQUIREMENTS (from eligibility section):
- GPA requirement (minimum GPA if specified)
- Enrollment status (full-time, part-time, or any)
- Class level (undergraduate, graduate, vocational, etc.)
- Tribal enrollment requirement (yes/no details)
- Letters of recommendation (how many)
- Transcript required (yes/no)
- Essay requirements (prompt/topics)
- Other specific documentation required
- Geographic restrictions
- Field of study requirements
- Additional special requirements

APPLICATION QUESTIONS (CRITICAL - navigate through ALL sections):
For EVERY section in the application, extract:
- Section name (e.g., "Personal Information", "Academic Information", "Essays", etc.)
- Questions/Fields in that section:
  * Question/label text (exact wording)
  * Input type (text, textarea, dropdown, radio, checkbox, file upload)
  * Options (if dropdown/radio/checkbox - list all choices)
  * Required (yes/no)
  * Character/word limit (if specified)

Example of question structure:
{
  "section": "Personal Information",
  "questions": [
    {
      "id": "first_name",
      "label": "First Name",
      "type": "text",
      "required": true,
      "options": null
    },
    {
      "id": "state",
      "label": "State of Residence",
      "type": "dropdown",
      "required": true,
      "options": ["Arizona", "New Mexico", ...]
    },
    {
      "id": "essay_career_goals",
      "label": "Describe your career goals (500 words max)",
      "type": "textarea",
      "required": true,
      "word_limit": 500
    }
  ]
}

STEP 3: Return as JSON:
{
  "scholarships": [
    {
      "title": "Exact Title",
      "organization": "AISES/Cobell",
      "description": "Full description...",
      "award_amount": "$X,XXX or Variable",
      "deadline": "Month DD, YYYY at Time",
      "status": "Open/Closed",
      "application_url": "https://...",
      "requirements": {
        "gpa_min": 3.0,
        "gpa_required": true,
        "enrollment_status": "full_time",
        "class_level": ["undergraduate"],
        "tribal_enrollment_required": true,
        "referral_count": 2,
        "transcript_required": true,
        "essay_required": true,
        "essay_topics": ["topic1", "topic2"],
        "other_requirements": ["Must be STEM major", "US citizen"]
      },
      "application_sections": [
        {
          "name": "Personal Information",
          "questions": [
            {
              "id": "first_name",
              "label": "First Name",
              "type": "text",
              "required": true
            },
            {
              "id": "email",
              "label": "Email Address",
              "type": "text",
              "required": true
            }
          ]
        },
        {
          "name": "Academic Information",
          "questions": [
            {
              "id": "gpa",
              "label": "Current GPA",
              "type": "text",
              "required": true
            },
            {
              "id": "major",
              "label": "Major/Field of Study",
              "type": "dropdown",
              "required": true,
              "options": ["Engineering", "Computer Science", ...]
            }
          ]
        },
        {
          "name": "Essays",
          "questions": [
            {
              "id": "essay_career",
              "label": "Describe your career goals and how this scholarship will help you achieve them.",
              "type": "textarea",
              "required": true,
              "word_limit": 500
            }
          ]
        }
      ]
    }
  ]
}

CRITICAL:
- Get EVERY scholarship listed on the dashboard
- For EACH scholarship, click through and navigate ALL sections
- Extract EVERY question/field in EVERY section
- Get exact question wording (students need to see exact questions)
- Note which fields are required vs optional
- Capture dropdown options exactly as listed
- Note word/character limits for text fields
- This data will be used to build a form where students prepare answers before the agent fills the real application
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
You are scraping detailed information for ONE scholarship from the OASIS portal.

IMPORTANT: We need to capture ALL application questions so the student can prepare answers BEFORE the agent fills out the form.

SCHOLARSHIP: {scholarship_title}

STEP 1: Navigate to dashboard
- Go to https://aises.awardspring.com/ACTIONS/Welcome.cfm

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
  "organization": "AISES/Cobell",
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
    "fafsa_required": true,
    "field_of_study": ["Computer Science", "Engineering"],
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

    parser = argparse.ArgumentParser(description="Scrape detailed OASIS scholarship info")
    parser.add_argument("--session-id", required=True, help="Session ID from database")
    parser.add_argument("--scholarship", help="Scrape single scholarship by title")
    parser.add_argument("--output", help="Output JSON file path")

    args = parser.parse_args()

    output_file = args.output or Path.home() / "Development" / "scholarships-plus" / "data" / "aises_cobell" / "detailed_scholarships.json"

    if args.scholarship:
        asyncio.run(scrape_single_scholarship(args.session_id, args.scholarship, args.output))
    else:
        asyncio.run(scrape_detailed_scholarships(args.session_id, str(output_file)))
