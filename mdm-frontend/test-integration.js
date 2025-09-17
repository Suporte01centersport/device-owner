#!/usr/bin/env node

/**
 * Script de teste para verificar a integração entre WebSocket e HTTP API
 */

const WebSocket = require('ws');
const http = require('http');

const WEBSOCKET_URL = 'ws://localhost:3002';
const HTTP_URL = 'http://localhost:3002/api';

console.log('🧪 Iniciando testes de integração...\n');

// Teste 1: Conectividade WebSocket
async function testWebSocketConnection() {
    console.log('1️⃣ Testando conexão WebSocket...');
    
    return new Promise((resolve) => {
        const ws = new WebSocket(WEBSOCKET_URL);
        let connected = false;
        
        const timeout = setTimeout(() => {
            if (!connected) {
                console.log('❌ WebSocket: Timeout de conexão');
                ws.close();
                resolve(false);
            }
        }, 5000);
        
        ws.on('open', () => {
            connected = true;
            clearTimeout(timeout);
            console.log('✅ WebSocket: Conectado com sucesso');
            
            // Enviar mensagem de teste
            const testMessage = {
                type: 'web_client',
                timestamp: Date.now()
            };
            
            ws.send(JSON.stringify(testMessage));
            console.log('✅ WebSocket: Mensagem de teste enviada');
            
            ws.close();
            resolve(true);
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log('❌ WebSocket: Erro de conexão:', error.message);
            resolve(false);
        });
    });
}

// Teste 2: API HTTP
async function testHttpAPI() {
    console.log('\n2️⃣ Testando API HTTP...');
    
    return new Promise((resolve) => {
        const req = http.get(`${HTTP_URL}/devices/status`, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    console.log('✅ HTTP API: Resposta recebida');
                    console.log(`   - Dispositivos conectados: ${jsonData.devices?.length || 0}`);
                    console.log(`   - Uptime do servidor: ${Math.round(jsonData.serverStats?.uptime / 1000)}s`);
                    resolve(true);
                } catch (error) {
                    console.log('❌ HTTP API: Erro ao processar resposta:', error.message);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.log('❌ HTTP API: Erro de conexão:', error.message);
            resolve(false);
        });
        
        req.setTimeout(5000, () => {
            console.log('❌ HTTP API: Timeout de conexão');
            req.destroy();
            resolve(false);
        });
    });
}

// Teste 3: Comando via HTTP
async function testHttpCommand() {
    console.log('\n3️⃣ Testando comando via HTTP...');
    
    return new Promise((resolve) => {
        const testData = JSON.stringify({
            restrictions: {
                wifiDisabled: false,
                bluetoothDisabled: false
            }
        });
        
        const options = {
            hostname: 'localhost',
            port: 3002,
            path: '/api/devices/test-device/restrictions/apply',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(testData)
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.success) {
                        console.log('✅ HTTP Command: Comando enviado com sucesso');
                        resolve(true);
                    } else {
                        console.log('❌ HTTP Command: Erro no comando:', jsonData.error);
                        resolve(false);
                    }
                } catch (error) {
                    console.log('❌ HTTP Command: Erro ao processar resposta:', error.message);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.log('❌ HTTP Command: Erro de conexão:', error.message);
            resolve(false);
        });
        
        req.write(testData);
        req.end();
        
        req.setTimeout(5000, () => {
            console.log('❌ HTTP Command: Timeout de conexão');
            req.destroy();
            resolve(false);
        });
    });
}

// Teste 4: Simulação de dispositivo Android
async function testAndroidSimulation() {
    console.log('\n4️⃣ Simulando dispositivo Android...');
    
    return new Promise((resolve) => {
        const ws = new WebSocket(WEBSOCKET_URL);
        let connected = false;
        
        const timeout = setTimeout(() => {
            if (!connected) {
                console.log('❌ Android Sim: Timeout de conexão');
                ws.close();
                resolve(false);
            }
        }, 5000);
        
        ws.on('open', () => {
            connected = true;
            clearTimeout(timeout);
            console.log('✅ Android Sim: Conectado como dispositivo');
            
            // Simular status do dispositivo
            const deviceStatus = {
                type: 'device_status',
                data: {
                    deviceId: 'test-android-device',
                    name: 'Test Android Device',
                    model: 'Test Model',
                    androidVersion: '13',
                    manufacturer: 'Test Manufacturer',
                    batteryLevel: 85,
                    isCharging: false,
                    isDeviceOwner: true,
                    timestamp: Date.now()
                }
            };
            
            ws.send(JSON.stringify(deviceStatus));
            console.log('✅ Android Sim: Status do dispositivo enviado');
            
            // Simular ping
            setTimeout(() => {
                const pingMessage = {
                    type: 'ping',
                    timestamp: Date.now()
                };
                ws.send(JSON.stringify(pingMessage));
                console.log('✅ Android Sim: Ping enviado');
                
                setTimeout(() => {
                    ws.close();
                    resolve(true);
                }, 1000);
            }, 1000);
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            console.log('❌ Android Sim: Erro de conexão:', error.message);
            resolve(false);
        });
    });
}

// Executar todos os testes
async function runAllTests() {
    const results = [];
    
    results.push(await testWebSocketConnection());
    results.push(await testHttpAPI());
    results.push(await testHttpCommand());
    results.push(await testAndroidSimulation());
    
    console.log('\n📊 Resultados dos Testes:');
    console.log('========================');
    
    const testNames = [
        'WebSocket Connection',
        'HTTP API',
        'HTTP Command',
        'Android Simulation'
    ];
    
    let passed = 0;
    results.forEach((result, index) => {
        const status = result ? '✅ PASSOU' : '❌ FALHOU';
        console.log(`${index + 1}. ${testNames[index]}: ${status}`);
        if (result) passed++;
    });
    
    console.log(`\n🎯 Resumo: ${passed}/${results.length} testes passaram`);
    
    if (passed === results.length) {
        console.log('🎉 Todos os testes passaram! Sistema funcionando corretamente.');
        process.exit(0);
    } else {
        console.log('⚠️  Alguns testes falharam. Verifique o servidor e tente novamente.');
        process.exit(1);
    }
}

// Verificar se o servidor está rodando
async function checkServer() {
    console.log('🔍 Verificando se o servidor está rodando...');
    
    return new Promise((resolve) => {
        const req = http.get('http://localhost:3002/api/devices/status', (res) => {
            console.log('✅ Servidor está rodando na porta 3002');
            resolve(true);
        });
        
        req.on('error', (error) => {
            console.log('❌ Servidor não está rodando ou não está acessível');
            console.log('   Certifique-se de executar: node server/websocket.js');
            resolve(false);
        });
        
        req.setTimeout(3000, () => {
            console.log('❌ Timeout ao verificar servidor');
            req.destroy();
            resolve(false);
        });
    });
}

// Executar verificação e testes
async function main() {
    const serverRunning = await checkServer();
    
    if (!serverRunning) {
        console.log('\n💡 Para iniciar o servidor:');
        console.log('   cd mdm-frontend');
        console.log('   node server/websocket.js');
        process.exit(1);
    }
    
    await runAllTests();
}

main().catch(console.error);
