const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Criar servidor HTTP para API REST
const server = http.createServer((req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    
    if (path === '/api/devices/status' && req.method === 'GET') {
        // Endpoint para status dos dispositivos (fallback HTTP)
        const devices = Array.from(persistentDevices.values()).map(device => ({
            ...device,
            // Garantir que todas as informações detalhadas estejam incluídas
            name: device.name || device.model || 'Dispositivo Desconhecido',
            model: device.model || 'unknown',
            androidVersion: device.androidVersion || 'unknown',
            manufacturer: device.manufacturer || 'unknown',
            batteryLevel: device.batteryLevel || 0,
            isDeviceOwner: device.isDeviceOwner || false,
            isProfileOwner: device.isProfileOwner || false,
            isKioskMode: device.isKioskMode || false,
            appVersion: device.appVersion || '1.0.0',
            timezone: device.timezone || 'unknown',
            language: device.language || 'unknown',
            country: device.country || 'unknown',
            networkType: device.networkType || 'unknown',
            wifiSSID: device.wifiSSID || null,
            isWifiEnabled: device.isWifiEnabled || false,
            isBluetoothEnabled: device.isBluetoothEnabled || false,
            isLocationEnabled: device.isLocationEnabled || false,
            isDeveloperOptionsEnabled: device.isDeveloperOptionsEnabled || false,
            isAdbEnabled: device.isAdbEnabled || false,
            isUnknownSourcesEnabled: device.isUnknownSourcesEnabled || false,
            installedAppsCount: device.installedAppsCount || 0,
            installedApps: device.installedApps || [],
            storageTotal: device.storageTotal || 0,
            storageUsed: device.storageUsed || 0,
            memoryTotal: device.memoryTotal || 0,
            memoryUsed: device.memoryUsed || 0,
            cpuArchitecture: device.cpuArchitecture || 'unknown',
            screenResolution: device.screenResolution || 'unknown',
            screenDensity: device.screenDensity || 0,
            batteryStatus: device.batteryStatus || 'unknown',
            isCharging: device.isCharging || false,
            serialNumber: device.serialNumber || null,
            imei: device.imei || null,
            macAddress: device.macAddress || null,
            ipAddress: device.ipAddress || null,
            apiLevel: device.apiLevel || 0
        }));
        
        const response = {
            devices: devices,
            serverStats: {
                uptime: Date.now() - serverStats.startTime,
                totalConnections: serverStats.totalConnections,
                activeConnections: serverStats.activeConnections,
                totalMessages: serverStats.totalMessages,
                totalDevices: persistentDevices.size,
                connectedDevices: connectedDevices.size,
                webClients: webClients.size
            },
            timestamp: Date.now()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        
    } else if (path.startsWith('/api/devices/') && req.method === 'POST') {
        // Endpoints para comandos de dispositivos
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const deviceId = path.split('/')[3];
                
                if (path.includes('/restrictions/apply')) {
                    handleApplyRestrictions({ deviceId, restrictions: data.restrictions }, { connectionId: 'http_api' });
                } else if (path.includes('/restrictions/remove')) {
                    handleRemoveRestrictions({ deviceId }, { connectionId: 'http_api' });
                } else if (path.includes('/lock')) {
                    handleLockDevice({ deviceId }, { connectionId: 'http_api' });
                } else if (path.includes('/unlock')) {
                    handleUnlockDevice({ deviceId }, { connectionId: 'http_api' });
                } else if (path.includes('/delete')) {
                    handleDeleteDevice({ deviceId }, { connectionId: 'http_api' });
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Comando enviado com sucesso' }));
                
            } catch (error) {
                log.error('Erro ao processar requisição HTTP', { error: error.message });
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
    }
});

const wss = new WebSocket.Server({ 
    server: server, // Usar o mesmo servidor HTTP
    perMessageDeflate: false, // Desabilitar compressão para melhor performance
    maxPayload: 1024 * 1024, // 1MB max payload
    handshakeTimeout: 10000, // 10 segundos timeout
    keepAlive: true,
    keepAliveInitialDelay: 30000 // 30 segundos
});

// Armazenar dispositivos conectados
const connectedDevices = new Map();
const webClients = new Set();

// Armazenar dispositivos persistentes (mesmo quando desconectados)
const persistentDevices = new Map();

// Senha de administrador global
let globalAdminPassword = '';

// Arquivo para persistência
const DEVICES_FILE = path.join(__dirname, 'devices.json');
const ADMIN_PASSWORD_FILE = path.join(__dirname, 'admin_password.json');
const supportMessagesPath = path.join(__dirname, 'support_messages.json');

// Estatísticas do servidor
const serverStats = {
    totalConnections: 0,
    activeConnections: 0,
    totalMessages: 0,
    startTime: Date.now(),
    lastHeartbeat: Date.now()
};

// Logging melhorado
const log = {
    info: (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    },
    error: (message, error = null) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR: ${message}`, error ? error.stack || error : '');
    },
    warn: (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] WARN: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    },
    debug: (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
};

// Funções de persistência
function loadDevicesFromFile() {
    try {
        if (fs.existsSync(DEVICES_FILE)) {
            const data = fs.readFileSync(DEVICES_FILE, 'utf8');
            const devices = JSON.parse(data);
            
            // Converter array para Map
            devices.forEach(device => {
                persistentDevices.set(device.deviceId, device);
            });
            
            log.info(`Dispositivos carregados do arquivo`, { count: devices.length });
        } else {
            log.info('Arquivo de dispositivos não encontrado, iniciando com lista vazia');
        }
    } catch (error) {
        log.error('Erro ao carregar dispositivos do arquivo', error);
    }
}

function saveDevicesToFile() {
    try {
        const devices = Array.from(persistentDevices.values());
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
        log.debug(`Dispositivos salvos no arquivo`, { count: devices.length });
    } catch (error) {
        log.error('Erro ao salvar dispositivos no arquivo', error);
    }
}

function loadAdminPasswordFromFile() {
    try {
        console.log('=== DEBUG: loadAdminPasswordFromFile ===');
        console.log('Arquivo existe?', fs.existsSync(ADMIN_PASSWORD_FILE));
        if (fs.existsSync(ADMIN_PASSWORD_FILE)) {
            const data = fs.readFileSync(ADMIN_PASSWORD_FILE, 'utf8');
            console.log('Conteúdo do arquivo:', data);
            const passwordData = JSON.parse(data);
            globalAdminPassword = passwordData.password || '';
            console.log('Senha carregada:', globalAdminPassword);
            log.info('Senha de administrador carregada do arquivo');
        } else {
            console.log('Arquivo não encontrado');
            log.info('Arquivo de senha de administrador não encontrado, iniciando sem senha');
        }
    } catch (error) {
        console.error('Erro ao carregar senha:', error);
        log.error('Erro ao carregar senha de administrador do arquivo', error);
    }
}

function saveAdminPasswordToFile() {
    try {
        const passwordData = {
            password: globalAdminPassword,
            updatedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(ADMIN_PASSWORD_FILE, JSON.stringify(passwordData, null, 2));
        log.debug('Senha de administrador salva no arquivo');
    } catch (error) {
        log.error('Erro ao salvar senha de administrador no arquivo', error);
    }
}

// Função para limpar dados de aplicativos com valores null
function cleanInstalledAppsData() {
    let cleanedCount = 0;
    
    persistentDevices.forEach((device, deviceId) => {
        if (device.installedApps && Array.isArray(device.installedApps)) {
            const originalLength = device.installedApps.length;
            const validApps = device.installedApps.filter(app => 
                app && 
                typeof app === 'object' && 
                app.appName && 
                app.packageName &&
                app.appName.trim() !== '' &&
                app.packageName.trim() !== ''
            );
            
            if (validApps.length !== originalLength) {
                device.installedApps = validApps;
                device.installedAppsCount = validApps.length;
                cleanedCount++;
                
                log.info(`Dados de aplicativos limpos para dispositivo`, {
                    deviceId: deviceId,
                    originalLength: originalLength,
                    validApps: validApps.length,
                    removedNulls: originalLength - validApps.length
                });
            }
        }
    });
    
    if (cleanedCount > 0) {
        saveDevicesToFile();
        log.info(`Limpeza de dados concluída`, { 
            devicesCleaned: cleanedCount,
            totalDevices: persistentDevices.size
        });
    }
}

// Carregar dispositivos ao iniciar
loadDevicesFromFile();

// Carregar senha de administrador salva na inicialização
loadAdminPasswordFromFile();
console.log('=== DEBUG: Após carregamento ===');
console.log('globalAdminPassword:', globalAdminPassword);
console.log('Tipo:', typeof globalAdminPassword);
console.log('Tamanho:', globalAdminPassword ? globalAdminPassword.length : 0);

// Limpar dados existentes com valores null
cleanInstalledAppsData();

wss.on('connection', ws => {
    serverStats.totalConnections++;
    serverStats.activeConnections++;
    
    // Adicionar informações de conexão
    ws.connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    ws.connectedAt = Date.now();
    ws.lastActivity = Date.now();
    ws.messageCount = 0;
    
    log.info(`Nova conexão estabelecida`, {
        connectionId: ws.connectionId,
        remoteAddress: ws._socket?.remoteAddress,
        userAgent: ws._socket?.upgradeReq?.headers?.['user-agent'],
        totalConnections: serverStats.totalConnections,
        activeConnections: serverStats.activeConnections
    });

    ws.on('message', message => {
        try {
            ws.lastActivity = Date.now();
            ws.messageCount++;
            serverStats.totalMessages++;
            
            const data = JSON.parse(message);
            console.log('=== MENSAGEM WEBSOCKET RECEBIDA ===');
            console.log('Tipo:', data.type);
            console.log('Data completa:', data);
            console.log('Connection ID:', ws.connectionId);
            console.log('Tipo de conexão:', ws.connectionType);
            
            log.debug(`Mensagem recebida`, {
                connectionId: ws.connectionId,
                type: data.type,
                size: message.length
            });
            
            handleMessage(ws, data);
        } catch (error) {
            log.error('Erro ao processar mensagem', {
                connectionId: ws.connectionId,
                message: message.toString(),
                error: error.message
            });
            
            // Enviar erro de volta para o cliente
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Mensagem inválida recebida',
                    timestamp: Date.now()
                }));
            }
        }
    });

    ws.on('close', (code, reason) => {
        serverStats.activeConnections--;
        
        log.info(`Conexão fechada`, {
            connectionId: ws.connectionId,
            code: code,
            reason: reason?.toString(),
            duration: Date.now() - ws.connectedAt,
            messagesReceived: ws.messageCount,
            activeConnections: serverStats.activeConnections
        });
        
        // Remover dispositivo se for um dispositivo Android
        for (const [deviceId, deviceWs] of connectedDevices.entries()) {
            if (deviceWs === ws) {
                connectedDevices.delete(deviceId);
                
                // Atualizar status para offline no armazenamento persistente
                if (persistentDevices.has(deviceId)) {
                    persistentDevices.set(deviceId, {
                        ...persistentDevices.get(deviceId),
                        status: 'offline',
                        lastSeen: Date.now()
                    });
                    
                    // Salvar no arquivo
                    saveDevicesToFile();
                }
                
                log.info(`Dispositivo desconectado`, { deviceId });
                
                // Notificar clientes web
                notifyWebClients({
                    type: 'device_disconnected',
                    deviceId: deviceId,
                    timestamp: Date.now()
                });
                break;
            }
        }
        
        // Remover cliente web
        webClients.delete(ws);
    });

    ws.on('error', error => {
        log.error('Erro na conexão WebSocket', {
            connectionId: ws.connectionId,
            error: error.message,
            stack: error.stack
        });
    });

    ws.on('pong', () => {
        ws.lastActivity = Date.now();
        log.debug('Pong recebido', { connectionId: ws.connectionId });
        
        // Cancelar timeout de inatividade e reconfigurar
        if (ws.inactivityTimeout) {
            clearTimeout(ws.inactivityTimeout);
        }
        ws.inactivityTimeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                log.warn('Fechando conexão inativa após pong', { connectionId: ws.connectionId });
                ws.close(1000, 'Inactive connection');
            }
        }, 10 * 60 * 1000); // 10 minutos
    });

    // Identificar tipo de cliente
    ws.isDevice = false;
    ws.isWebClient = false;
    
    // Configurar timeout para conexões inativas - mais longo para dispositivos
    ws.inactivityTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            log.warn('Fechando conexão inativa', { connectionId: ws.connectionId });
            ws.close(1000, 'Inactive connection');
        }
    }, 10 * 60 * 1000); // 10 minutos - mais tempo para dispositivos
});

function handleMessage(ws, data) {
    console.log('=== HANDLE MESSAGE ===');
    console.log('Processando tipo:', data.type);
    console.log('É dispositivo?', ws.isDevice);
    console.log('Device ID:', ws.deviceId);
    
    // Atualizar lastSeen para dispositivos Android
    if (ws.isDevice && ws.deviceId) {
        updateDeviceLastSeen(ws.deviceId);
    }
    
    switch (data.type) {
        case 'device_status':
            handleDeviceStatus(ws, data);
            break;
        case 'device_restrictions':
            handleDeviceRestrictions(ws, data);
            break;
        case 'ping':
            handlePing(ws, data);
            break;
        case 'web_client':
            handleWebClient(ws, data);
            break;
        case 'delete_device':
            handleDeleteDevice(ws, data);
            break;
        case 'update_app_permissions':
            handleUpdateAppPermissions(ws, data);
            break;
        case 'location_update':
            handleLocationUpdate(ws, data);
            break;
        case 'request_location':
            handleRequestLocation(ws, data);
            break;
        case 'toggle_location_tracking':
            handleToggleLocationTracking(ws, data);
            break;
        case 'set_location_interval':
            handleSetLocationInterval(ws, data);
            break;
        case 'enable_location':
            handleEnableLocation(ws, data);
            break;
        case 'send_test_notification':
            handleSendTestNotification(ws, data);
            break;
        case 'notification_received':
            handleNotificationReceived(ws, data);
            break;
        case 'geofence_event':
            handleGeofenceEvent(ws, data);
            break;
        case 'reboot_device':
            handleRebootDevice(ws, data);
            break;
        case 'set_admin_password':
            handleSetAdminPassword(ws, data);
            break;
        case 'get_admin_password':
            console.log('=== DEBUG: get_admin_password recebido ===');
            console.log('Cliente é web client?', ws.isWebClient);
            console.log('globalAdminPassword atual:', globalAdminPassword);
            handleGetAdminPassword(ws, data);
            break;
        case 'support_message':
            handleSupportMessage(ws, data);
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

// Função para atualizar lastSeen de um dispositivo
function updateDeviceLastSeen(deviceId) {
    if (persistentDevices.has(deviceId)) {
        const device = persistentDevices.get(deviceId);
        const now = Date.now();
        
        // Atualizar lastSeen e garantir que status seja online se conectado
        persistentDevices.set(deviceId, {
            ...device,
            lastSeen: now,
            status: connectedDevices.has(deviceId) ? 'online' : device.status
        });
        
    }
}

function handleDeviceStatus(ws, data) {
    const deviceId = data.data.deviceId;
    const now = Date.now();
    
    console.log('=== DEVICE STATUS RECEBIDO ===');
    console.log('Device ID:', deviceId);
    console.log('Device Owner:', data.data.isDeviceOwner);
    console.log('Profile Owner:', data.data.isProfileOwner);
    console.log('Apps instalados:', data.data.installedApps?.length || 0);
    console.log('Apps permitidos:', data.data.allowedApps?.length || 0);
    console.log('Allowed Apps:', data.data.allowedApps);
    console.log('Bateria:', data.data.batteryLevel);
    console.log('Modelo:', data.data.model);
    console.log('Android Version:', data.data.androidVersion);
    console.log('===============================');
    
    // Marcar como dispositivo Android
    ws.isDevice = true;
    ws.deviceId = deviceId;
    
    console.log('Dispositivo marcado como Android:', ws.isDevice);
    console.log('DeviceId do WebSocket:', ws.deviceId);
    
    // Armazenar informações detalhadas do dispositivo
    ws.deviceInfo = data.data;
    
    // Armazenar dispositivo conectado
    connectedDevices.set(deviceId, ws);
    
    // Armazenar dispositivo persistente com informações completas
    persistentDevices.set(deviceId, {
        ...data.data,
        status: 'online',
        lastSeen: now, // Sempre atualizar com timestamp atual
        connectionId: ws.connectionId,
        connectedAt: ws.connectedAt
    });
    
    // Salvar no arquivo
    saveDevicesToFile();
    
    // Enviar senha de administrador se estiver definida
    if (globalAdminPassword) {
        const message = {
            type: 'set_admin_password',
            data: { password: globalAdminPassword }
        };
        console.log(`=== DEBUG: Enviando senha para dispositivo ${deviceId} ===`);
        console.log('WebSocket readyState:', ws.readyState);
        console.log('Mensagem a ser enviada:', message);
        ws.send(JSON.stringify(message));
        console.log(`Senha de administrador enviada automaticamente para dispositivo ${deviceId}:`, message);
    } else {
        console.log(`Nenhuma senha de administrador definida para enviar ao dispositivo ${deviceId}`);
    }
    
    log.info(`Dispositivo conectado`, {
        deviceId: deviceId,
        connectionId: ws.connectionId,
        deviceInfo: {
            name: data.data.name,
            model: data.data.model,
            androidVersion: data.data.androidVersion,
            manufacturer: data.data.manufacturer,
            installedAppsCount: data.data.installedAppsCount,
            installedAppsLength: data.data.installedApps?.length || 0
        }
    });
    
    // Debug: verificar se installedApps está sendo recebido
    log.info(`=== DADOS RECEBIDOS DO DISPOSITIVO ===`, {
        deviceId: deviceId,
        installedAppsCount: data.data.installedAppsCount,
        installedAppsExists: !!data.data.installedApps,
        installedAppsType: typeof data.data.installedApps,
        installedAppsLength: data.data.installedApps?.length || 0,
        allowedAppsExists: !!data.data.allowedApps,
        allowedAppsLength: data.data.allowedApps?.length || 0,
        firstApp: data.data.installedApps?.[0] ? {
            name: data.data.installedApps[0].appName,
            package: data.data.installedApps[0].packageName
        } : 'null'
    });
    
    if (data.data.installedApps && Array.isArray(data.data.installedApps)) {
        // Filtrar elementos null e inválidos antes de processar
        const validApps = data.data.installedApps.filter(app => 
            app && 
            typeof app === 'object' && 
            app.appName && 
            app.packageName &&
            app.appName.trim() !== '' &&
            app.packageName.trim() !== ''
        );
        
        log.info(`Apps recebidos do dispositivo`, {
            deviceId: deviceId,
            totalReceived: data.data.installedApps.length,
            validApps: validApps.length,
            nullElements: data.data.installedApps.length - validApps.length,
            first3: validApps.slice(0, 3).map(app => ({
                name: app.appName,
                package: app.packageName,
                system: app.isSystemApp
            }))
        });
        
        // Atualizar o array para remover elementos null e inválidos
        data.data.installedApps = validApps;
        
        // Atualizar o contador para refletir apenas apps válidos
        data.data.installedAppsCount = validApps.length;
    } else {
        log.warn(`PROBLEMA: installedApps não é um array válido`, { 
            deviceId: deviceId,
            installedApps: data.data.installedApps,
            type: typeof data.data.installedApps
        });
        
        // Se não há apps válidos, definir como array vazio
        data.data.installedApps = [];
        data.data.installedAppsCount = 0;
    }
    
    // Notificar clientes web
    notifyWebClients({
        type: 'device_connected',
        device: data.data,
        timestamp: Date.now()
    });
}

function handleDeviceRestrictions(ws, data) {
    log.info(`Restrições do dispositivo atualizadas`, {
        deviceId: ws.deviceId,
        connectionId: ws.connectionId,
        restrictions: data.data
    });
    
    // Notificar clientes web
    notifyWebClients({
        type: 'device_restrictions_updated',
        deviceId: ws.deviceId,
        restrictions: data.data,
        timestamp: Date.now()
    });
}

function handlePing(ws, data) {
    log.debug('Ping recebido', { connectionId: ws.connectionId });
    
    // Responder com pong imediatamente
    const pongMessage = {
        type: 'pong',
        timestamp: Date.now(),
        serverTime: Date.now()
    };
    
    try {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(pongMessage));
            log.debug('Pong enviado', { connectionId: ws.connectionId });
            
            // Atualizar lastSeen para dispositivos
            if (ws.connectionType === 'device' && ws.deviceId) {
                updateDeviceLastSeen(ws.deviceId);
            }
        } else {
            log.warn('WebSocket não está aberto para enviar pong', { 
                connectionId: ws.connectionId,
                readyState: ws.readyState 
            });
        }
    } catch (error) {
        log.error('Erro ao enviar pong', { 
            connectionId: ws.connectionId, 
            error: error.message 
        });
    }
}

function handleWebClient(ws, data) {
    // Marcar como cliente web
    ws.isWebClient = true;
    webClients.add(ws);
    
    log.info('Cliente web conectado', {
        connectionId: ws.connectionId,
        totalWebClients: webClients.size
    });
    
    // Enviar lista de dispositivos (conectados e desconectados)
    const devices = Array.from(persistentDevices.values()).map(device => ({
        ...device,
        // Manter informações detalhadas
        name: device.name,
        model: device.model,
        androidVersion: device.androidVersion,
        manufacturer: device.manufacturer,
        batteryLevel: device.batteryLevel,
        isDeviceOwner: device.isDeviceOwner,
        isProfileOwner: device.isProfileOwner,
        isKioskMode: device.isKioskMode,
        appVersion: device.appVersion,
        timezone: device.timezone,
        language: device.language,
        country: device.country,
        networkType: device.networkType,
        wifiSSID: device.wifiSSID,
        isWifiEnabled: device.isWifiEnabled,
        isBluetoothEnabled: device.isBluetoothEnabled,
        isLocationEnabled: device.isLocationEnabled,
        isDeveloperOptionsEnabled: device.isDeveloperOptionsEnabled,
        isAdbEnabled: device.isAdbEnabled,
        isUnknownSourcesEnabled: device.isUnknownSourcesEnabled,
        installedAppsCount: device.installedAppsCount,
        installedApps: device.installedApps || [],
        storageTotal: device.storageTotal,
        storageUsed: device.storageUsed,
        memoryTotal: device.memoryTotal,
        memoryUsed: device.memoryUsed,
        cpuArchitecture: device.cpuArchitecture,
        screenResolution: device.screenResolution,
        screenDensity: device.screenDensity,
        batteryStatus: device.batteryStatus,
        isCharging: device.isCharging,
        serialNumber: device.serialNumber,
        imei: device.imei,
        macAddress: device.macAddress,
        ipAddress: device.ipAddress,
        apiLevel: device.apiLevel
    }));
    
    const response = {
        type: 'devices_list',
        devices: devices,
        adminPassword: globalAdminPassword,
        serverStats: {
            totalDevices: persistentDevices.size,
            connectedDevices: connectedDevices.size,
            totalWebClients: webClients.size,
            serverUptime: Date.now() - serverStats.startTime
        },
        timestamp: Date.now()
    };
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
    }
}



function handleDeleteDevice(ws, data) {
    const { deviceId } = data;
    
    // Verificar se o dispositivo existe
    if (!persistentDevices.has(deviceId)) {
        log.warn(`Dispositivo não encontrado para deleção`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
        return;
    }
    
    // Remover das listas
    persistentDevices.delete(deviceId);
    connectedDevices.delete(deviceId);
    
    // Salvar no arquivo
    saveDevicesToFile();
    
    log.info(`Dispositivo deletado permanentemente`, {
        deviceId: deviceId,
        connectionId: ws.connectionId
    });
    
    // Notificar clientes web
    notifyWebClients({
        type: 'device_deleted',
        deviceId: deviceId,
        timestamp: Date.now()
    });
}

function handleUpdateAppPermissions(ws, data) {
    const { deviceId, allowedApps } = data;
    
    // Verificar se o dispositivo existe
    if (!persistentDevices.has(deviceId)) {
        log.warn(`Dispositivo não encontrado para atualização de permissões`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
        return;
    }
    
    // Atualizar permissões no armazenamento persistente
    const device = persistentDevices.get(deviceId);
    device.allowedApps = allowedApps || [];
    persistentDevices.set(deviceId, device);
    
    // Salvar no arquivo
    saveDevicesToFile();
    
    log.info(`Permissões de aplicativos atualizadas`, {
        deviceId: deviceId,
        connectionId: ws.connectionId,
        allowedAppsCount: allowedApps?.length || 0,
        allowedApps: allowedApps
    });
    
    // Enviar permissões para o dispositivo Android se estiver conectado
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'update_app_permissions',
            data: {
                allowedApps: allowedApps || []
            },
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(message));
        
        log.info(`Permissões enviadas para o dispositivo Android`, {
            deviceId: deviceId,
            allowedAppsCount: allowedApps?.length || 0
        });
    } else {
        log.warn(`Dispositivo Android não conectado, permissões salvas para envio posterior`, {
            deviceId: deviceId
        });
    }
    
    // Notificar clientes web sobre a atualização
    notifyWebClients({
        type: 'app_permissions_updated',
        deviceId: deviceId,
        allowedApps: allowedApps || [],
        timestamp: Date.now()
    });
}

function handleLocationUpdate(ws, data) {
    const deviceId = data.deviceId;
    
    // Verificar se o dispositivo existe
    if (!persistentDevices.has(deviceId)) {
        log.warn(`Dispositivo não encontrado para atualização de localização`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
        return;
    }
    
    // Atualizar dados de localização no dispositivo persistente
    const device = persistentDevices.get(deviceId);
    device.latitude = data.latitude;
    device.longitude = data.longitude;
    device.locationAccuracy = data.accuracy;
    device.lastLocationUpdate = data.timestamp;
    device.locationProvider = data.provider;
    device.isLocationEnabled = true;
    
    persistentDevices.set(deviceId, device);
    
    // Salvar no arquivo
    saveDevicesToFile();
    
    log.info(`Localização atualizada`, {
        deviceId: deviceId,
        connectionId: ws.connectionId,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        provider: data.provider
    });
    
    // Notificar clientes web sobre a atualização de localização
    notifyWebClients({
        type: 'location_updated',
        deviceId: deviceId,
        location: {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            timestamp: data.timestamp,
            provider: data.provider
        },
        timestamp: Date.now()
    });
}

function handleRequestLocation(ws, data) {
    const { deviceId } = data;
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'request_location',
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(message));
        
        log.info(`Solicitação de localização enviada para dispositivo`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado para solicitação de localização`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    }
}

function handleToggleLocationTracking(ws, data) {
    const { deviceId, enabled } = data;
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'toggle_location_tracking',
            enabled: enabled,
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(message));
        
        log.info(`Comando de rastreamento de localização enviado`, {
            deviceId: deviceId,
            connectionId: ws.connectionId,
            enabled: enabled
        });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado para comando de rastreamento`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    }
}

function handleSetLocationInterval(ws, data) {
    const { deviceId, interval } = data;
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'set_location_interval',
            interval: interval,
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(message));
        
        log.info(`Intervalo de localização configurado`, {
            deviceId: deviceId,
            connectionId: ws.connectionId,
            interval: interval
        });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado para configuração de intervalo`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    }
}

function handleEnableLocation(ws, data) {
    const { deviceId } = data;
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'enable_location',
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(message));
        
        log.info(`Comando de ativação de localização enviado`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado para ativação de localização`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    }
}

function handleSendTestNotification(ws, data) {
    const { deviceId, message } = data;
    
    console.log('=== ENVIANDO NOTIFICAÇÃO DE TESTE ===');
    console.log('Data recebida:', data);
    console.log('Device ID:', deviceId);
    console.log('Mensagem:', message);
    console.log('Tipo da mensagem:', typeof message);
    console.log('Dispositivos conectados:', Array.from(connectedDevices.keys()));
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const notificationMessage = {
            type: 'show_notification',
            title: 'MDM Launcher',
            body: message || 'Notificação de teste',
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(notificationMessage));
        
        // Enviar notificação para todos os clientes web conectados
        const notificationData = {
            type: 'device_notification',
            deviceId: deviceId,
            title: 'Notificação Enviada',
            body: `Notificação enviada para ${deviceId}`,
            timestamp: Date.now()
        };
        
        // Broadcast para todos os clientes web
        webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(notificationData));
            }
        });
        
        log.info(`Notificação de teste enviada`, {
            deviceId: deviceId,
            connectionId: ws.connectionId,
            message: message
        });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
        
        // Notificar clientes web sobre falha no envio
        const errorData = {
            type: 'notification_error',
            deviceId: deviceId,
            title: 'Erro ao Enviar Notificação',
            body: `Dispositivo ${deviceId} não está conectado`,
            timestamp: Date.now()
        };
        
        webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(errorData));
            }
        });
    }
}

function handleNotificationReceived(ws, data) {
    const { deviceId, title, body, timestamp } = data;
    
    console.log('=== NOTIFICAÇÃO RECEBIDA PELO DISPOSITIVO ===');
    console.log('Device ID:', deviceId);
    console.log('Título:', title);
    console.log('Corpo:', body);
    console.log('Timestamp:', timestamp);
    
    // Notificar todos os clientes web sobre o recebimento da notificação
    const confirmationData = {
        type: 'notification_confirmed',
        deviceId: deviceId,
        title: title,
        body: body,
        timestamp: timestamp,
        receivedAt: Date.now()
    };
    
    webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(confirmationData));
        }
    });
    
    log.info(`Notificação confirmada pelo dispositivo`, {
        deviceId: deviceId,
        title: title,
        body: body,
        connectionId: ws.connectionId
    });
}

function handleRebootDevice(ws, data) {
    const { deviceId } = data;
    
    console.log('=== REINICIANDO DISPOSITIVO ===');
    console.log('Device ID:', deviceId);
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'reboot_device',
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(message));
        
        log.info(`Comando de reinicialização enviado`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
    }
}

function notifyWebClients(message) {
    let successCount = 0;
    let errorCount = 0;
    
    webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(message));
                successCount++;
            } catch (error) {
                log.error('Erro ao enviar mensagem para cliente web', {
                    connectionId: client.connectionId,
                    error: error.message
                });
                errorCount++;
            }
        } else {
            // Remover clientes desconectados
            webClients.delete(client);
        }
    });
    
    if (successCount > 0 || errorCount > 0) {
        log.debug('Notificação enviada para clientes web', {
            messageType: message.type,
            successCount: successCount,
            errorCount: errorCount,
            totalClients: webClients.size
        });
    }
}

// Sistema de monitoramento e heartbeat
setInterval(() => {
    serverStats.lastHeartbeat = Date.now();
    
    // Enviar ping ativo para dispositivos conectados
    connectedDevices.forEach((deviceWs, deviceId) => {
        if (deviceWs.readyState === WebSocket.OPEN) {
            try {
                deviceWs.ping();
                log.debug('Ping enviado para dispositivo', { deviceId });
            } catch (error) {
                log.error('Erro ao enviar ping para dispositivo', { deviceId, error: error.message });
            }
        }
    });
    
    // Verificar dispositivos inativos e atualizar status
    const now = Date.now();
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos de inatividade - mais tolerante
    
    persistentDevices.forEach((device, deviceId) => {
        const timeSinceLastSeen = now - device.lastSeen;
        const isConnected = connectedDevices.has(deviceId);
        
        // Se o dispositivo não está conectado via WebSocket OU não foi visto há mais de 10 minutos
        if (!isConnected || timeSinceLastSeen > INACTIVITY_TIMEOUT) {
            if (device.status === 'online') {
                log.info(`Dispositivo marcado como offline por inatividade`, {
                    deviceId: deviceId,
                    timeSinceLastSeen: Math.round(timeSinceLastSeen / 1000),
                    isConnected: isConnected
                });
                
                // Atualizar status para offline
                persistentDevices.set(deviceId, {
                    ...device,
                    status: 'offline',
                    lastSeen: device.lastSeen // Manter o último timestamp visto
                });
            }
        } else if (isConnected && device.status === 'offline') {
            // Se está conectado mas marcado como offline, corrigir
            log.info(`Dispositivo marcado como online (conectado)`, {
                deviceId: deviceId,
                timeSinceLastSeen: Math.round(timeSinceLastSeen / 1000)
            });
            
            persistentDevices.set(deviceId, {
                ...device,
                status: 'online',
                lastSeen: now
            });
        } else if (isConnected && timeSinceLastSeen > (INACTIVITY_TIMEOUT / 2)) {
            // Dispositivo conectado mas inativo há mais de 5 minutos - enviar ping
            const deviceWs = connectedDevices.get(deviceId);
            if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
                try {
                    deviceWs.ping();
                    log.debug(`Ping de verificação enviado para dispositivo inativo`, { 
                        deviceId,
                        timeSinceLastSeen: Math.round(timeSinceLastSeen / 1000)
                    });
                } catch (error) {
                    log.warn(`Erro ao enviar ping de verificação`, { 
                        deviceId, 
                        error: error.message 
                    });
                }
            }
        }
    });
    
    // Salvar mudanças no arquivo
    saveDevicesToFile();
    
    // Enviar ping ativo para dispositivos conectados para manter conexão viva (menos frequente)
    if (Math.random() < 0.3) { // 30% de chance de enviar ping para reduzir carga
        connectedDevices.forEach((deviceWs, deviceId) => {
            if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
                try {
                    deviceWs.ping();
                    log.debug(`Ping enviado para dispositivo`, { deviceId });
                } catch (error) {
                    log.warn(`Erro ao enviar ping para dispositivo`, { 
                        deviceId, 
                        error: error.message 
                    });
                }
            }
        });
    }

    // Enviar status dos dispositivos (persistentes)
    const devices = Array.from(persistentDevices.values()).map(device => ({
        ...device,
        // Manter informações detalhadas
        name: device.name,
        model: device.model,
        androidVersion: device.androidVersion,
        manufacturer: device.manufacturer,
        batteryLevel: device.batteryLevel,
        isDeviceOwner: device.isDeviceOwner,
        isProfileOwner: device.isProfileOwner,
        isKioskMode: device.isKioskMode,
        appVersion: device.appVersion,
        timezone: device.timezone,
        language: device.language,
        country: device.country,
        networkType: device.networkType,
        wifiSSID: device.wifiSSID,
        isWifiEnabled: device.isWifiEnabled,
        isBluetoothEnabled: device.isBluetoothEnabled,
        isLocationEnabled: device.isLocationEnabled,
        isDeveloperOptionsEnabled: device.isDeveloperOptionsEnabled,
        isAdbEnabled: device.isAdbEnabled,
        isUnknownSourcesEnabled: device.isUnknownSourcesEnabled,
        installedAppsCount: device.installedAppsCount,
        installedApps: device.installedApps || [],
        storageTotal: device.storageTotal,
        storageUsed: device.storageUsed,
        memoryTotal: device.memoryTotal,
        memoryUsed: device.memoryUsed,
        cpuArchitecture: device.cpuArchitecture,
        screenResolution: device.screenResolution,
        screenDensity: device.screenDensity,
        batteryStatus: device.batteryStatus,
        isCharging: device.isCharging,
        serialNumber: device.serialNumber,
        imei: device.imei,
        macAddress: device.macAddress,
        ipAddress: device.ipAddress,
        apiLevel: device.apiLevel
    }));
    
    notifyWebClients({
        type: 'devices_status',
        devices: devices,
        serverStats: {
            uptime: Date.now() - serverStats.startTime,
            totalConnections: serverStats.totalConnections,
            activeConnections: serverStats.activeConnections,
            totalMessages: serverStats.totalMessages,
            totalDevices: persistentDevices.size,
            connectedDevices: connectedDevices.size,
            webClients: webClients.size
        },
        timestamp: Date.now()
    });
    
    // Limpar conexões inativas
    const inactiveConnections = [];
    
    wss.clients.forEach(ws => {
        if (now - ws.lastActivity > 5 * 60 * 1000) { // 5 minutos
            inactiveConnections.push(ws.connectionId);
            ws.close(1000, 'Inactive connection');
        }
    });
    
    if (inactiveConnections.length > 0) {
        log.info('Conexões inativas removidas', {
            count: inactiveConnections.length,
            connectionIds: inactiveConnections
        });
    }
    
}, 5000); // A cada 5 segundos para teste

// Log de estatísticas a cada 5 minutos
setInterval(() => {
    log.info('Estatísticas do servidor', {
        uptime: Math.round((Date.now() - serverStats.startTime) / 1000),
        totalConnections: serverStats.totalConnections,
        activeConnections: serverStats.activeConnections,
        totalMessages: serverStats.totalMessages,
        connectedDevices: connectedDevices.size,
        webClients: webClients.size,
        memoryUsage: process.memoryUsage()
    });
}, 5 * 60 * 1000);

// Tratamento de sinais do sistema
process.on('SIGINT', () => {
    log.info('Recebido SIGINT, fechando servidor...');
    
    wss.clients.forEach(ws => {
        ws.close(1000, 'Server shutting down');
    });
    
    wss.close(() => {
        log.info('Servidor WebSocket fechado');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    log.info('Recebido SIGTERM, fechando servidor...');
    
    wss.clients.forEach(ws => {
        ws.close(1000, 'Server shutting down');
    });
    
    wss.close(() => {
        log.info('Servidor WebSocket fechado');
        process.exit(0);
    });
});

// Função para lidar com mensagens de suporte
function handleSupportMessage(ws, data) {
    console.log('=== MENSAGEM DE SUPORTE RECEBIDA ===');
    console.log('Device ID:', data.deviceId);
    console.log('Device Name:', data.deviceName);
    console.log('Message:', data.message);
    console.log('Timestamp:', data.timestamp);
    console.log('WebSocket connection ID:', ws.connectionId);
    console.log('WebSocket is device?', ws.isDevice);
    
    try {
        // Salvar mensagem de suporte em arquivo
        const supportMessage = {
            id: `support_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            message: data.message,
            timestamp: data.timestamp || Date.now(),
            androidVersion: data.androidVersion,
            model: data.model,
            receivedAt: Date.now(),
            status: 'pending'
        };
        
        // Carregar mensagens existentes
        let supportMessages = [];
        try {
            const supportData = fs.readFileSync(supportMessagesPath, 'utf8');
            supportMessages = JSON.parse(supportData);
        } catch (error) {
            console.log('Arquivo de mensagens de suporte não existe, criando novo');
        }
        
        // Adicionar nova mensagem
        supportMessages.push(supportMessage);
        
        // Salvar no arquivo
        fs.writeFileSync(supportMessagesPath, JSON.stringify(supportMessages, null, 2));
        
        console.log('Mensagem de suporte salva:', supportMessage.id);
        
        // Enviar confirmação para o dispositivo
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'support_message_received',
                messageId: supportMessage.id,
                status: 'success',
                timestamp: Date.now()
            }));
        }
        
        // Notificar clientes web sobre nova mensagem de suporte
        broadcastToWebClients({
            type: 'new_support_message',
            data: supportMessage
        });
        
        log.info('Mensagem de suporte processada', {
            messageId: supportMessage.id,
            deviceId: data.deviceId,
            deviceName: data.deviceName
        });
        
    } catch (error) {
        console.error('Erro ao processar mensagem de suporte:', error);
        log.error('Erro ao processar mensagem de suporte', {
            deviceId: data.deviceId,
            error: error.message
        });
        
        // Enviar erro para o dispositivo
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'support_message_error',
                error: 'Erro interno do servidor',
                timestamp: Date.now()
            }));
        }
    }
}

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    log.error('Exceção não capturada', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Promise rejeitada não tratada', { reason, promise });
});

// Iniciar servidor HTTP
server.listen(3002, '0.0.0.0', () => {
    log.info('Servidor HTTP/WebSocket iniciado', {
        port: 3002,
        host: '0.0.0.0',
        pid: process.pid,
        nodeVersion: process.version,
        endpoints: [
            'GET /api/devices/status',
            'POST /api/devices/{deviceId}/restrictions/apply',
            'POST /api/devices/{deviceId}/restrictions/remove',
            'POST /api/devices/{deviceId}/lock',
            'POST /api/devices/{deviceId}/unlock',
            'POST /api/devices/{deviceId}/delete',
            'POST /api/devices/{deviceId}/admin-password'
        ]
    });
});

// Função para definir senha de administrador
function handleSetAdminPassword(ws, data) {
    // Extrair password de data.data se existir, senão de data
    const passwordData = data.data || data;
    const { password, deviceId } = passwordData;
    
    if (!password) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Senha de administrador é obrigatória'
        }));
        return;
    }
    
    // Salvar senha globalmente
    globalAdminPassword = password;
    saveAdminPasswordToFile();
    console.log('Senha de administrador definida globalmente e salva no arquivo');
    
    // Enviar comando para o dispositivo específico
    if (deviceId) {
        const deviceWs = connectedDevices.get(deviceId);
        if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
            deviceWs.send(JSON.stringify({
                type: 'set_admin_password',
                data: { password }
            }));
            console.log(`Senha de administrador enviada para dispositivo ${deviceId}`);
        } else {
            console.log(`Dispositivo ${deviceId} não encontrado ou desconectado`);
        }
    } else {
        // Enviar para todos os dispositivos conectados
        console.log(`=== DEBUG: Enviando senha para ${connectedDevices.size} dispositivos conectados ===`);
        console.log('Dispositivos conectados:', Array.from(connectedDevices.keys()));
        
        connectedDevices.forEach((deviceWs, id) => {
            console.log(`Dispositivo ${id}: readyState=${deviceWs.readyState}, isDevice=${deviceWs.isDevice}`);
            if (deviceWs.readyState === WebSocket.OPEN) {
                const message = {
                    type: 'set_admin_password',
                    data: { password }
                };
                console.log(`Enviando senha para dispositivo ${id}:`, message);
                deviceWs.send(JSON.stringify(message));
                console.log(`Senha de administrador enviada para dispositivo ${id}:`, message);
            } else {
                console.log(`Dispositivo ${id} não está pronto (readyState: ${deviceWs.readyState})`);
            }
        });
    }
}

// Função para obter senha de administrador atual
function handleGetAdminPassword(ws, data) {
    console.log('=== DEBUG: handleGetAdminPassword chamada ===');
    console.log('globalAdminPassword:', globalAdminPassword);
    console.log('Tipo:', typeof globalAdminPassword);
    console.log('Tamanho:', globalAdminPassword ? globalAdminPassword.length : 0);
    console.log('WebSocket readyState:', ws.readyState);
    console.log('WebSocket é web client?', ws.isWebClient);
    
    const response = {
        type: 'admin_password_response',
        password: globalAdminPassword
    };
    
    console.log('Enviando resposta:', response);
    
    ws.send(JSON.stringify(response));
    console.log('Senha de administrador solicitada:', globalAdminPassword ? '***' : 'não definida');
}

function handleGeofenceEvent(ws, data) {
    console.log('=== GEOFENCE EVENT ===');
    console.log('Device ID:', data.deviceId);
    console.log('Zone ID:', data.zoneId);
    console.log('Zone Name:', data.zoneName);
    console.log('Event Type:', data.eventType);
    console.log('Location:', data.latitude, data.longitude);
    
    if (!ws.isDevice) {
        console.log('Erro: Apenas dispositivos podem enviar eventos de geofencing');
        return;
    }
    
    const deviceId = data.deviceId;
    const now = Date.now();
    
    // Atualizar dispositivo com evento de geofencing
    if (persistentDevices.has(deviceId)) {
        const device = persistentDevices.get(deviceId);
        device.lastGeofenceEvent = {
            zoneId: data.zoneId,
            zoneName: data.zoneName,
            eventType: data.eventType,
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: data.timestamp,
            accuracy: data.accuracy
        };
        device.lastSeen = now;
        
        persistentDevices.set(deviceId, device);
        saveDevicesToFile();
        
        console.log(`Evento de geofencing processado: ${data.eventType} - ${data.zoneName}`);
        
        // Notificar clientes web sobre o evento
        const eventData = {
            type: 'geofence_event',
            deviceId: deviceId,
            zoneId: data.zoneId,
            zoneName: data.zoneName,
            eventType: data.eventType,
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: data.timestamp,
            accuracy: data.accuracy
        };
        
        // Enviar para todos os clientes web conectados
        webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(eventData));
            }
        });
        
        console.log(`Evento de geofencing notificado para ${webClients.size} clientes web`);
    } else {
        console.log('Dispositivo não encontrado para evento de geofencing:', deviceId);
    }
}
