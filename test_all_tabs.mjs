import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:3000');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

const tabs = [
  { name: 'dispositivos', text: 'Dispositivos' },
  { name: 'apps', text: 'Apps liberados' },
  { name: 'uem', text: 'UEM' },
  { name: 'politicas', text: 'Políticas' },
  { name: 'usuarios', text: 'Usuários' },
  { name: 'alertas', text: 'Alertas' },
  { name: 'agendamentos', text: 'Agendamentos' },
  { name: 'compliance', text: 'Compliance' },
  { name: 'configuracoes', text: 'Configurações' },
];

for (const tab of tabs) {
  try {
    const btn = page.locator(`button:has-text("${tab.text}")`).first();
    await btn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/mdm_${tab.name}.png`, fullPage: true });
    console.log(`✅ ${tab.name}: screenshot saved`);

    // Check for visible inputs, buttons, modals in this tab
    const visibleButtons = await page.locator('button:visible').count();
    const visibleInputs = await page.locator('input:visible, textarea:visible, select:visible').count();
    const visibleModals = await page.locator('[role="dialog"]:visible, .modal:visible').count();
    console.log(`   buttons=${visibleButtons} inputs=${visibleInputs} modals=${visibleModals}`);
  } catch (e) {
    console.log(`❌ ${tab.name}: ${e.message.slice(0, 100)}`);
  }
}

// Now test clicking action buttons on Dispositivos page
console.log('\n=== TESTING DISPOSITIVOS ACTIONS ===');
const dispBtn = page.locator('button:has-text("Dispositivos")').first();
await dispBtn.click();
await page.waitForTimeout(2000);

// Look for device cards or action buttons
const actionButtons = await page.locator('button:visible').allTextContents();
console.log('Visible buttons on Dispositivos:', actionButtons.map(t => t.trim().slice(0, 50)));

// Go to Configurações and scroll to check all sections
console.log('\n=== TESTING CONFIGURAÇÕES ===');
const configBtn = page.locator('button:has-text("Configurações")').first();
await configBtn.click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `/tmp/mdm_config_top.png` });
await page.evaluate(() => window.scrollTo(0, 1000));
await page.waitForTimeout(500);
await page.screenshot({ path: `/tmp/mdm_config_mid.png` });
await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(500);
await page.screenshot({ path: `/tmp/mdm_config_bot.png` });

await browser.close();
console.log('\nDone!');
