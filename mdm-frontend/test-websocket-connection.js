const WebSocket = require('ws');

// Teste de conexão WebSocket
const testWebSocketConnection = () => {
    console.log('🔌 Testando conexão WebSocket...');
    
    const ws = new WebSocket('ws://localhost:3002');
    
    ws.on('open', () => {
        console.log('✅ WebSocket conectado com sucesso!');
        
        // Identificar como cliente web
        ws.send(JSON.stringify({
            type: 'web_client',
            timestamp: Date.now()
        }));
        
        // Simular dados de dispositivo Android
        setTimeout(() => {
            console.log('📱 Simulando dispositivo Android...');
            ws.send(JSON.stringify({
                type: 'device_status',
                data: {
                    deviceId: 'test-device-123',
                    name: 'Emulador Android Studio',
                    model: 'Android SDK built for x86_64',
                    manufacturer: 'Google',
                    androidVersion: '14',
                    apiLevel: 34,
                    serialNumber: 'emulator-5554',
                    imei: '123456789012345',
                    macAddress: '02:00:00:00:00:00',
                    ipAddress: '10.0.2.15',
                    batteryLevel: 85,
                    batteryStatus: 'charging',
                    isCharging: true,
                    storageTotal: 32000000000,
                    storageUsed: 16000000000,
                    memoryTotal: 4000000000,
                    memoryUsed: 2000000000,
                    cpuArchitecture: 'x86_64',
                    screenResolution: '1080x1920',
                    screenDensity: 420,
                    networkType: 'wifi',
                    wifiSSID: 'TestWiFi',
                    isWifiEnabled: true,
                    isBluetoothEnabled: false,
                    isLocationEnabled: true,
                    isDeveloperOptionsEnabled: true,
                    isAdbEnabled: true,
                    isUnknownSourcesEnabled: true,
                    installedAppsCount: 45,
                    timezone: 'America/Sao_Paulo',
                    language: 'pt-BR',
                    country: 'BR',
                    isDeviceOwner: true,
                    isProfileOwner: false,
                    isKioskMode: false,
                    appVersion: '1.0.0'
                },
                timestamp: Date.now()
            }));
        }, 2000);
        
        // Testar aplicação de restrições
        setTimeout(() => {
            console.log('🔒 Testando aplicação de restrições...');
            ws.send(JSON.stringify({
                deviceId: 'test-device-123',
                restrictions: {
                    wifiDisabled: true,
                    cameraDisabled: true,
                    statusBarDisabled: true
                },
                timestamp: Date.now()
            }));
        }, 5000);
        
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('📨 Mensagem recebida:', message.type);
            
            if (message.type === 'devices_list') {
                console.log('📋 Lista de dispositivos:', message.devices.length);
                message.devices.forEach(device => {
                    console.log(`  - ${device.name} (${device.deviceId}) - ${device.status}`);
                });
            }
            
            if (message.type === 'devices_status') {
                console.log('📊 Status dos dispositivos atualizado');
            }
            
        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 WebSocket desconectado');
    });
    
    ws.on('error', (error) => {
        console.error('❌ Erro no WebSocket:', error);
    });
    
    // Fechar conexão após 10 segundos
    setTimeout(() => {
        console.log('🔌 Fechando conexão de teste...');
        ws.close();
        process.exit(0);
    }, 10000);
};

// Teste de API HTTP
const testHttpAPI = async () => {
    console.log('🌐 Testando API HTTP...');
    
    try {
        const response = await fetch('http://localhost:3002/api/devices/status');
        const data = await response.json();
        
        console.log('✅ API HTTP funcionando!');
        console.log('📊 Estatísticas do servidor:', data.serverStats);
        console.log('📱 Dispositivos encontrados:', data.devices.length);
        
        data.devices.forEach(device => {
            console.log(`  - ${device.name} (${device.deviceId}) - ${device.status}`);
        });
        
    } catch (error) {
        console.error('❌ Erro na API HTTP:', error);
    }
};

// Executar testes
console.log('🚀 Iniciando testes de conectividade...\n');

// Testar API HTTP primeiro
testHttpAPI().then(() => {
    console.log('\n');
    // Depois testar WebSocket
    testWebSocketConnection();
});
