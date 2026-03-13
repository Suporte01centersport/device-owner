from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)

    # Screenshot 1: Full page view
    page.screenshot(path='/tmp/mdm_full.png', full_page=True)

    # Screenshot 2: Top area
    page.screenshot(path='/tmp/mdm_top.png')

    # Scroll down and take more screenshots
    page.evaluate('window.scrollTo(0, 1000)')
    page.wait_for_timeout(500)
    page.screenshot(path='/tmp/mdm_mid.png')

    page.evaluate('window.scrollTo(0, 2000)')
    page.wait_for_timeout(500)
    page.screenshot(path='/tmp/mdm_bottom.png')

    # Now let's find all clickable elements, tabs, buttons
    buttons = page.locator('button').all()
    print(f"=== BUTTONS ({len(buttons)}) ===")
    for b in buttons:
        text = b.text_content().strip()[:80] if b.text_content() else "no text"
        visible = b.is_visible()
        print(f"  Button: '{text}' | visible={visible}")

    # Find tabs/nav items
    tabs = page.locator('[role="tab"], .tab, [class*="tab"]').all()
    print(f"\n=== TABS ({len(tabs)}) ===")
    for t in tabs:
        text = t.text_content().strip()[:80] if t.text_content() else "no text"
        visible = t.is_visible()
        print(f"  Tab: '{text}' | visible={visible}")

    # Find inputs
    inputs = page.locator('input, textarea, select').all()
    print(f"\n=== INPUTS ({len(inputs)}) ===")
    for i in inputs:
        itype = i.get_attribute('type') or 'text'
        placeholder = i.get_attribute('placeholder') or ''
        visible = i.is_visible()
        print(f"  Input: type={itype} placeholder='{placeholder}' visible={visible}")

    # Find modals/dialogs
    modals = page.locator('[role="dialog"], .modal, [class*="modal"]').all()
    print(f"\n=== MODALS ({len(modals)}) ===")
    for m in modals:
        visible = m.is_visible()
        print(f"  Modal: visible={visible}")

    browser.close()
