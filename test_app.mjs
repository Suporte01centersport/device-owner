import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:3000');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Screenshot full page
await page.screenshot({ path: '/tmp/mdm_full.png', fullPage: true });
await page.screenshot({ path: '/tmp/mdm_top.png' });

// Scroll mid
await page.evaluate(() => window.scrollTo(0, 1000));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mdm_mid.png' });

// Scroll bottom
await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mdm_bottom.png' });

// Discover elements
const buttons = await page.locator('button').all();
console.log(`=== BUTTONS (${buttons.length}) ===`);
for (const b of buttons) {
  const text = ((await b.textContent()) || 'no text').trim().slice(0, 80);
  const visible = await b.isVisible();
  console.log(`  Button: '${text}' | visible=${visible}`);
}

const tabs = await page.locator('[role="tab"], .tab, [class*="tab"]').all();
console.log(`\n=== TABS (${tabs.length}) ===`);
for (const t of tabs) {
  const text = ((await t.textContent()) || 'no text').trim().slice(0, 80);
  const visible = await t.isVisible();
  console.log(`  Tab: '${text}' | visible=${visible}`);
}

const inputs = await page.locator('input, textarea, select').all();
console.log(`\n=== INPUTS (${inputs.length}) ===`);
for (const i of inputs) {
  const type = (await i.getAttribute('type')) || 'text';
  const placeholder = (await i.getAttribute('placeholder')) || '';
  const visible = await i.isVisible();
  console.log(`  Input: type=${type} placeholder='${placeholder}' visible=${visible}`);
}

const modals = await page.locator('[role="dialog"], .modal, [class*="modal"]').all();
console.log(`\n=== MODALS (${modals.length}) ===`);
for (const m of modals) {
  const visible = await m.isVisible();
  console.log(`  Modal: visible=${visible}`);
}

// Now let's click on each visible tab/section to test them
const navLinks = await page.locator('nav a, nav button, [class*="nav"] a, [class*="nav"] button').all();
console.log(`\n=== NAV LINKS (${navLinks.length}) ===`);
for (const n of navLinks) {
  const text = ((await n.textContent()) || '').trim().slice(0, 80);
  const visible = await n.isVisible();
  console.log(`  Nav: '${text}' | visible=${visible}`);
}

await browser.close();
