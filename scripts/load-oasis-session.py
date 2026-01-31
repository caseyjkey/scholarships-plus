#!/usr/bin/env python3
"""
Load OASIS Session and Verify

This script loads saved session cookies and verifies they work.
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def load_and_verify():
    """Load session cookies and verify login"""

    session_file = Path.home() / "Development" / "scholarships-plus" / "data" / "oasis_session.json"

    if not session_file.exists():
        print(f"❌ Session file not found: {session_file}")
        print("   Run extract-oasis-session.py first")
        return None

    # Load session
    with open(session_file, 'r') as f:
        session_data = json.load(f)

    print("=" * 60)
    print("OASIS Session Verifier")
    print("=" * 60)
    print()
    print(f"Loading session from: {session_file}")
    print()

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()

        # Add cookies
        await context.add_cookies(session_data['cookies'])

        page = await context.new_page()

        # Set localStorage and sessionStorage before navigating
        await page.goto("https://webportalapp.com/sp/login/access_oasis")

        # Inject localStorage
        if session_data.get('localStorage'):
            await page.evaluate(f"""
                () => {{
                    const data = {json.dumps(session_data['localStorage'])};
                    for (const [key, value] of Object.entries(data)) {{
                        localStorage.setItem(key, value);
                    }}
                }}
            """)

        # Inject sessionStorage
        if session_data.get('sessionStorage'):
            await page.evaluate(f"""
                () => {{
                    const data = {json.dumps(session_data['sessionStorage'])};
                    for (const [key, value] of Object.entries(data)) {{
                        sessionStorage.setItem(key, value);
                    }}
                }}
            """)

        # Navigate to dashboard
        print("Navigating to dashboard...")
        await page.goto("https://aises.awardspring.com/ACTIONS/Welcome.cfm")

        # Wait a moment for page to load
        await asyncio.sleep(3)

        # Check if we're logged in
        page_content = await page.content()
        current_url = page.url

        print()
        print("Current URL:", current_url)

        if 'login' in current_url.lower() or 'sign in' in page_content.lower():
            print("❌ Session is invalid or expired")
            print("   Please run extract-oasis-session.py again")
            await browser.close()
            return None
        else:
            print("✅ Session is valid! Logged in successfully.")
            print()

            # Show what we can see
            if 'scholarship' in page_content.lower() or 'application' in page_content.lower():
                print("🎯 Scholarship applications visible!")
            else:
                print("📄 Dashboard loaded")

        # Keep browser open for inspection
        print()
        print("Browser will stay open for 10 seconds for inspection...")
        await asyncio.sleep(10)

        await browser.close()

    return session_data

if __name__ == "__main__":
    asyncio.run(load_and_verify())
