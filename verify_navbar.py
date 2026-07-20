import os
from playwright.sync_api import sync_playwright, expect

def verify_navbar():
    # Create verification directory
    os.makedirs("verification", exist_ok=True)

    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Go to localhost
            print("Navigating to login page (5173)...")
            page.goto("http://localhost:5173/")

            # Wait for page to load
            page.wait_for_load_state("networkidle")

            # Login to see navbar (Navbar is likely protected or only full version visible after login)
            # Check if we are at login
            if page.get_by_placeholder("you@example.com").is_visible():
                print("Logging in...")
                page.get_by_placeholder("you@example.com").fill("test@test.com")
                page.get_by_placeholder("••••••••").fill("password")
                page.get_by_role("button", name="Sign In").click()

                page.wait_for_load_state("networkidle")

            # Wait for Navbar to be visible.
            print("Waiting for Navbar...")
            # The logo alt is "Logo".
            expect(page.get_by_alt_text("Logo")).to_be_visible(timeout=10000)

            # Take screenshot of the top part (Navbar)
            print("Taking screenshot...")
            page.screenshot(path="verification/navbar_verification.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_navbar()
