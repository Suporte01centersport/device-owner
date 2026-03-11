from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Capture console errors
    console_messages = []
    page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: console_messages.append(f"[PAGE ERROR] {err}"))

    page.goto('http://localhost:3000', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)  # Extra wait for hydration

    page.screenshot(path='/tmp/page_screenshot.png', full_page=True)

    # Print console messages
    print("=== CONSOLE MESSAGES ===")
    for msg in console_messages:
        print(msg)

    # Check if page has visible content
    body_text = page.inner_text('body')
    print(f"\n=== BODY TEXT LENGTH: {len(body_text)} ===")
    if len(body_text) < 50:
        print(f"Body text: {body_text[:200]}")
    else:
        print(f"Body text (first 200 chars): {body_text[:200]}")

    browser.close()
