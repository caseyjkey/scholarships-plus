#!/usr/bin/env python3
"""
Extract OASIS Session Cookies

This script opens a browser for you to manually log into OASIS,
then extracts the session cookies for use in automated scraping.
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

async def extract_session():
    """Open browser, wait for manual login, extract cookies"""

    print("=" * 60)
    print("OASIS Session Extractor")
    print("=" * 60)
    print()
    print("1. A browser window will open")
    print("2. Please log in to the OASIS portal manually")
    print("3. Complete any human verification/CAPTCHA")
    print("4. Once you see the dashboard, press ENTER in this terminal")
    print()

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        # Navigate to OASIS login
        await page.goto("https://webportalapp.com/sp/login/access_oasis")

        print("✅ Browser opened. Please log in now...")
        print()

        # Wait for user to press ENTER
        input("Press ENTER after you've successfully logged in... ")

        # Extract cookies
        cookies = await context.cookies()

        # Get localStorage
        local_storage = await page.evaluate("() => Object.assign({}, localStorage)")

        # Get sessionStorage
        session_storage = await page.evaluate("() => Object.assign({}, sessionStorage)")

        # Get current URL (in case redirected)
        current_url = page.url

        await browser.close()

        # Create session data
        session_data = {
            "cookies": cookies,
            "localStorage": local_storage,
            "sessionStorage": session_storage,
            "currentUrl": current_url,
            "extractedAt": str(asyncio.get_event_loop().time())
        }

        # Save to file
        output_file = Path.home() / "Development" / "scholarships-plus" / "data" / "oasis_session.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'w') as f:
            json.dump(session_data, f, indent=2)

        print()
        print("=" * 60)
        print("✅ Session extracted successfully!")
        print(f"   Saved to: {output_file}")
        print("=" * 60)
        print()
        print("Session details:")
        print(f"  - Cookies: {len(cookies)} items")
        print(f"  - LocalStorage keys: {len(local_storage)} items")
        print(f"  - SessionStorage keys: {len(session_storage)} items")
        print(f"  - Final URL: {current_url}")
        print()

        # Show authentication cookies
        auth_cookies = [c for c in cookies if 'auth' in c.get('name', '').lower() or 'session' in c.get('name', '').lower()]
        if auth_cookies:
            print("🔑 Authentication cookies found:")
            for cookie in auth_cookies:
                print(f"    - {cookie['name']}: {cookie['value'][:20]}...")
        else:
            print("⚠️  No obvious authentication cookies found")
            print("   Common cookie names to look for:")
            print("     - laravel_session")
            print("     - session")
            print("     - PHPSESSID")
            print("     - oauth_token")
            print()

        return session_data

if __name__ == "__main__":
    asyncio.run(extract_session())
