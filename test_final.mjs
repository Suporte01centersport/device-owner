import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:3000');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Should see login page
await page.screenshot({ path: '/tmp/mdm_login.png' });
console.log('✅ Login page screenshot saved');

// Login
const emailInput = page.locator('input[type="email"]');
const passInput = page.locator('input[type="password"]');
if (await emailInput.isVisible()) {
  await emailInput.fill('admin@mdm.com');
  await passInput.fill('admin123');
  await page.locator('button:has-text("Entrar")').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/mdm_after_login.png' });
  console.log('✅ After login screenshot saved');
}

// Test new tabs
const newTabs = ['Mapa', 'Geofencing', 'Logs', 'Organizações'];
for (const tab of newTabs) {
  try {
    await page.locator(`button:has-text("${tab}")`).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/mdm_${tab.toLowerCase().replace('ã', 'a').replace('õ', 'o')}.png` });
    console.log(`✅ ${tab} screenshot saved`);
  } catch (e) {
    console.log(`❌ ${tab}: ${e.message.slice(0, 80)}`);
  }
}

// Test dark/light mode toggle
try {
  const themeBtn = page.locator('button[title*="modo"], button[title*="theme"], button[title*="claro"], button[title*="escuro"]').first();
  if (await themeBtn.isVisible()) {
    await themeBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/mdm_light_mode.png' });
    console.log('✅ Light mode screenshot saved');
  } else {
    console.log('⚠️ Theme toggle button not found by title');
  }
} catch (e) {
  console.log(`⚠️ Theme toggle: ${e.message.slice(0, 80)}`);
}

// Test devices search
try {
  await page.locator('button:has-text("Dispositivos")').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/mdm_devices_search.png' });
  console.log('✅ Devices with search screenshot saved');
} catch (e) {
  console.log(`⚠️ Devices: ${e.message.slice(0, 80)}`);
}

// Test Configurações scroll to see kiosk/wallpaper
try {
  await page.locator('button:has-text("Configurações")').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/mdm_config_new.png', fullPage: true });
  console.log('✅ Settings full page screenshot saved');
} catch (e) {
  console.log(`⚠️ Settings: ${e.message.slice(0, 80)}`);
}

await browser.close();
console.log('\nAll tests done!');
