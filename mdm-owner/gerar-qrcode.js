#!/usr/bin/env node

/**
 * Gerador de QR Code no Terminal
 * 
 * Uso:
 *   node gerar-qrcode.js
 *   node gerar-qrcode.js "https://outro-link.com"
 */

const qrcode = require('qrcode-terminal');

// Link padrão do APK
const DEFAULT_LINK = 'https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk';

// Pegar link da linha de comando ou usar o padrão
const link = process.argv[2] || DEFAULT_LINK;

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║           📱 Gerador de QR Code - MDM Launcher              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`📍 Link: ${link}\n`);
console.log('📱 Escaneie o QR Code abaixo com seu dispositivo Android:\n');

// Gerar QR Code no terminal
qrcode.generate(link, { small: true }, (qrcode) => {
    console.log(qrcode);
});

console.log('\n💡 Dica: Para gerar QR code de outro link:');
console.log('   node gerar-qrcode.js "https://seu-link-aqui.com"\n');

