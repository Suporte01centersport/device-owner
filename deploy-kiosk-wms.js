#!/usr/bin/env node
/**
 * Script para aplicar modo kiosk - envia allowedApps para o servidor MDM
 */
const http = require('http');

const allowedApps = ['com.centersporti.wmsmobile'];

const data = JSON.stringify({ allowedApps });

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/devices/all/app-permissions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('OK: Modo kiosk aplicado com sucesso!');
      console.log('Apps permitidos:', allowedApps.join(', '));
    } else {
      console.error('Erro:', res.statusCode, body);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error('Erro ao conectar ao servidor MDM:', e.message);
  console.error('Certifique-se que o servidor está rodando: npm run dev:all');
  process.exit(1);
});

req.write(data);
req.end();
