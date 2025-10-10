#!/usr/bin/env node

/**
 * Teste de Comandos Remotos
 * Testa todos os comandos UEM para garantir que funcionam corretamente
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3002';
const DEVICE_ID = process.argv[2]; // Device ID passado como argumento

if (!DEVICE_ID) {
    console.error('❌ Uso: node test-device-commands.js <deviceId>');
    console.error('Exemplo: node test-device-commands.js fd07ff3c3f98639c');
    process.exit(1);
}

console.log('\n🧪 TESTE DE COMANDOS REMOTOS');
console.log(`📱 Device ID: ${DEVICE_ID}\n`);

const ws = new WebSocket(WS_URL);

const commands = [
    {
        name: 'Update App Permissions',
        message: {
            type: 'update_app_permissions',
            deviceId: DEVICE_ID,
            allowedApps: ['com.android.settings', 'com.android.chrome'],
            timestamp: Date.now()
        }
    },
    {
        name: 'Set Admin Password',
        message: {
            type: 'set_admin_password',
            data: { password: 'test123' },
            timestamp: Date.now()
        }
    },
    {
        name: 'Request Location',
        message: {
            type: 'request_location',
            deviceId: DEVICE_ID,
            timestamp: Date.now()
        }
    },
    {
        name: 'Show Notification',
        message: {
            type: 'send_test_notification',
            deviceId: DEVICE_ID,
            message: 'Teste de notificação remota',
            timestamp: Date.now()
        }
    }
];

let currentCommandIndex = 0;

ws.on('open', () => {
    console.log('✅ Conectado ao servidor\n');
    
    // Identificar como cliente web
    ws.send(JSON.stringify({ type: 'web_client' }));
    
    // Iniciar testes após 1 segundo
    setTimeout(runNextTest, 1000);
});

function runNextTest() {
    if (currentCommandIndex >= commands.length) {
        console.log('\n✅ Todos os testes completados!');
        console.log('Verifique o dispositivo Android para confirmar que os comandos foram executados.\n');
        ws.close();
        process.exit(0);
        return;
    }
    
    const command = commands[currentCommandIndex];
    console.log(`${currentCommandIndex + 1}. Testando: ${command.name}`);
    console.log(`   Enviando: ${JSON.stringify(command.message).substring(0, 100)}...`);
    
    ws.send(JSON.stringify(command.message));
    console.log(`   ✅ Comando enviado\n`);
    
    currentCommandIndex++;
    
    // Próximo teste após 2 segundos
    setTimeout(runNextTest, 2000);
}

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        
        // Log de respostas relevantes
        if (message.type === 'app_permissions_updated' || 
            message.type === 'location_updated' ||
            message.type === 'notification_confirmed') {
            console.log(`   📩 Resposta: ${message.type}`);
        }
    } catch (e) {
        // Ignorar
    }
});

ws.on('error', (error) => {
    console.error('❌ Erro:', error.message);
    process.exit(1);
});

