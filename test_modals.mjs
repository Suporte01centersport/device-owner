import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:3000');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

// Test 1: Click "Enviar Mensagem Global" on Dashboard
console.log('=== TEST: Enviar Mensagem Global ===');
await page.locator('button:has-text("Enviar Mensagem Global")').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/mdm_modal_msg.png' });
// Try to close it
const closeBtn = page.locator('button:has-text("Fechar"), button:has-text("Cancelar"), button:has-text("×"), [class*="close"]').first();
if (await closeBtn.isVisible()) {
  await closeBtn.click();
  await page.waitForTimeout(500);
}

// Test 2: Go to Dispositivos and click Deletar
console.log('=== TEST: Dispositivos - Deletar ===');
await page.locator('button:has-text("Dispositivos")').first().click();
await page.waitForTimeout(2000);
const deleteBtn = page.locator('button:has-text("Deletar")').first();
if (await deleteBtn.isVisible()) {
  await deleteBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/mdm_modal_delete.png' });
  // Close
  const cancelBtn = page.locator('button:has-text("Cancelar"), button:has-text("Não"), button:has-text("Fechar")').first();
  if (await cancelBtn.isVisible()) {
    await cancelBtn.click();
    await page.waitForTimeout(500);
  }
}

// Test 3: Click Formatar Celular
console.log('=== TEST: Formatar Celular ===');
const formatBtn = page.locator('button:has-text("Formatar Celular")').first();
if (await formatBtn.isVisible()) {
  await formatBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/mdm_modal_format.png' });
  const cancelBtn2 = page.locator('button:has-text("Cancelar"), button:has-text("Não"), button:has-text("Fechar")').first();
  if (await cancelBtn2.isVisible()) {
    await cancelBtn2.click();
    await page.waitForTimeout(500);
  }
}

// Test 4: Click "Adicionar Dispositivo"
console.log('=== TEST: Adicionar Dispositivo ===');
const addBtn = page.locator('button:has-text("Adicionar Dispositivo")').first();
if (await addBtn.isVisible()) {
  await addBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/mdm_modal_add.png' });
  const cancelBtn3 = page.locator('button:has-text("Cancelar"), button:has-text("Fechar"), button:has-text("×")').first();
  if (await cancelBtn3.isVisible()) {
    await cancelBtn3.click();
    await page.waitForTimeout(500);
  }
}

// Test 5: Click Suporte on device
console.log('=== TEST: Suporte ===');
const supBtn = page.locator('button:has-text("Suporte")').first();
if (await supBtn.isVisible()) {
  await supBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/mdm_modal_suporte.png' });
  const cancelBtn4 = page.locator('button:has-text("Cancelar"), button:has-text("Fechar"), button:has-text("Voltar")').first();
  if (await cancelBtn4.isVisible()) {
    await cancelBtn4.click();
    await page.waitForTimeout(500);
  }
}

// Test 6: Click Atualizar on device
console.log('=== TEST: Atualizar ===');
const updBtn = page.locator('button:has-text("Atualizar")').first();
if (await updBtn.isVisible()) {
  await updBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/mdm_modal_update.png' });
  const cancelBtn5 = page.locator('button:has-text("Cancelar"), button:has-text("Fechar")').first();
  if (await cancelBtn5.isVisible()) {
    await cancelBtn5.click();
    await page.waitForTimeout(500);
  }
}

// Test 7: Go to Políticas and click "Aplicar e Salvar"
console.log('=== TEST: Políticas - Aplicar ===');
await page.locator('button:has-text("Políticas")').first().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/mdm_politicas_full.png', fullPage: true });
const applyBtn = page.locator('button:has-text("Aplicar")').first();
if (await applyBtn.isVisible()) {
  await applyBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/mdm_modal_apply.png' });
}

// Test 8: Notification bell click
console.log('=== TEST: Header icons ===');
await page.locator('button:has-text("🔕")').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/mdm_notif.png' });

// Test 9: Chat bubble
await page.locator('button:has-text("💬")').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/mdm_chat.png' });

// Test 10: Dados salvos dropdown
await page.locator('button:has-text("Dados salvos")').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/mdm_dados.png' });

// Test 11: User menu
await page.locator('button:has-text("Administrador")').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/mdm_usermenu.png' });

await browser.close();
console.log('\nAll modal tests done!');
