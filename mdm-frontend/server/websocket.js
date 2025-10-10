// Carregar variáveis de ambiente do arquivo .env
require('dotenv').config();

const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const DiscoveryServer = require('./discovery-server');

// PostgreSQL imports
const DeviceModel = require('./database/models/Device');
const DeviceGroupModel = require('./database/models/DeviceGroup');
const { query, transaction } = require('./database/config');

// Classes de otimização integradas
class PingThrottler {
    constructor(maxPingsPerMinute = 60) {
        this.maxPingsPerMinute = maxPingsPerMinute;
        this.pingHistory = new Map(); // deviceId -> timestamps[]
    }
    
    canPing(deviceId) {
        const now = Date.now();
        const devicePings = this.pingHistory.get(deviceId) || [];
        
        // Remover pings antigos (mais de 1 minuto)
        const recentPings = devicePings.filter(timestamp => now - timestamp < 60000);
        
        if (recentPings.length >= this.maxPingsPerMinute) {
            return false; // Rate limit atingido
        }
        
        recentPings.push(now);
        this.pingHistory.set(deviceId, recentPings);
        return true;
    }
}

class AdaptiveTimeout {
    constructor() {
        this.latencyHistory = new Map(); // deviceId -> latencies[]
        this.baseTimeout = 30000; // 30s base
        this.maxTimeout = 120000; // 2 minutos máximo
        this.minTimeout = 15000; // 15s mínimo
    }
    
    updateLatency(deviceId, latency) {
        const history = this.latencyHistory.get(deviceId) || [];
        history.push(latency);
        
        // Manter apenas últimos 10 valores
        if (history.length > 10) {
            history.shift();
        }
        
        this.latencyHistory.set(deviceId, history);
    }
    
    getTimeout(deviceId) {
        const history = this.latencyHistory.get(deviceId) || [];
        if (history.length === 0) {
            return this.baseTimeout;
        }
        
        // Calcular latência média
        const avgLatency = history.reduce((sum, lat) => sum + lat, 0) / history.length;
        
        // Ajustar timeout baseado na latência (latência alta = timeout maior)
        const adaptiveTimeout = this.baseTimeout + (avgLatency * 2);
        
        return Math.max(this.minTimeout, Math.min(this.maxTimeout, adaptiveTimeout));
    }
}

class ConfigurableLogger {
    constructor(level = 'info') {
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        this.currentLevel = this.levels[level] || this.levels.info;
    }
    
    setLevel(level) {
        this.currentLevel = this.levels[level] || this.levels.info;
    }
    
    log(level, message, data = {}) {
        if (this.levels[level] <= this.currentLevel) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
        }
    }
    
    error(message, data) { this.log('error', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    info(message, data) { this.log('info', message, data); }
    debug(message, data) { this.log('debug', message, data); }
}

class ConnectionHealthMonitor {
    constructor() {
        this.metrics = new Map(); // deviceId -> metrics
    }
    
    recordConnection(deviceId, success, latency = 0) {
        const metrics = this.metrics.get(deviceId) || {
            totalAttempts: 0,
            successfulConnections: 0,
            failedConnections: 0,
            avgLatency: 0,
            lastSeen: 0
        };
        
        metrics.totalAttempts++;
        metrics.lastSeen = Date.now();
        
        if (success) {
            metrics.successfulConnections++;
            if (latency > 0) {
                metrics.avgLatency = (metrics.avgLatency + latency) / 2;
            }
        } else {
            metrics.failedConnections++;
        }
        
        this.metrics.set(deviceId, metrics);
    }
    
    getHealthScore(deviceId) {
        const metrics = this.metrics.get(deviceId);
        if (!metrics || metrics.totalAttempts === 0) {
            return 1.0; // Score perfeito se não há histórico
        }
        
        const successRate = metrics.successfulConnections / metrics.totalAttempts;
        const latencyScore = Math.max(0, 1 - (metrics.avgLatency / 5000)); // Penalizar latência > 5s
        
        return (successRate * 0.7) + (latencyScore * 0.3);
    }
    
    getUnhealthyDevices(threshold = 0.5) {
        const unhealthy = [];
        for (const [deviceId, metrics] of this.metrics) {
            if (this.getHealthScore(deviceId) < threshold) {
                unhealthy.push({ deviceId, score: this.getHealthScore(deviceId), metrics });
            }
        }
        return unhealthy;
    }
}

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
        
    } else if (path === '/api/connection/health' && req.method === 'GET') {
        // Endpoint para monitoramento de saúde da conexão
        const unhealthyDevices = healthMonitor.getUnhealthyDevices(0.5);
        const healthStats = {
            totalDevices: persistentDevices.size,
            connectedDevices: connectedDevices.size,
            unhealthyDevices: unhealthyDevices.length,
            unhealthyDevicesList: unhealthyDevices,
            serverUptime: Date.now() - serverStats.startTime,
            config: {
                logLevel: config.LOG_LEVEL,
                maxPingsPerMinute: config.MAX_PINGS_PER_MINUTE,
                heartbeatInterval: config.HEARTBEAT_INTERVAL,
                pingProbability: config.PING_PROBABILITY,
                healthScoreThreshold: config.HEALTH_SCORE_THRESHOLD
            },
            pingThrottlerStats: {
                maxPingsPerMinute: config.MAX_PINGS_PER_MINUTE,
                activeThrottles: pingThrottler.pingHistory.size
            },
            adaptiveTimeoutStats: {
                devicesWithHistory: adaptiveTimeout.latencyHistory.size
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthStats));
        
    } else if (path.startsWith('/api/devices/') && req.method === 'POST') {
        // Endpoints para comandos de dispositivos
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
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
                    await handleDeleteDevice({ deviceId }, { connectionId: 'http_api' });
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

// Inicializar sistemas de otimização
const pingThrottler = new PingThrottler(config.MAX_PINGS_PER_MINUTE);
const adaptiveTimeout = new AdaptiveTimeout();
const logger = new ConfigurableLogger(config.LOG_LEVEL);
const healthMonitor = new ConnectionHealthMonitor();

// Log de inicialização das otimizações
logger.info('Sistemas de otimização inicializados', {
    logLevel: config.LOG_LEVEL,
    maxPingsPerMinute: config.MAX_PINGS_PER_MINUTE,
    adaptiveTimeoutEnabled: true,
    healthMonitoringEnabled: true,
    heartbeatInterval: config.HEARTBEAT_INTERVAL
});

// Logging melhorado
// Sistema de logging otimizado (usando o novo logger configurável)
const log = {
    info: (message, data = null) => logger.info(message, data),
    error: (message, error = null) => logger.error(message, error),
    warn: (message, data = null) => logger.warn(message, data),
    debug: (message, data = null) => logger.debug(message, data)
};

// Funções de persistência PostgreSQL
async function loadDevicesFromDatabase() {
    try {
        const devices = await DeviceModel.findAll();
        
        // Converter array para Map para compatibilidade
        devices.forEach(device => {
            // Debug: verificar deviceId
            console.log('🔍 Dispositivo carregado:', {
                id: device.id,
                deviceId: device.deviceId,
                name: device.name,
                model: device.model,
                deviceIdType: typeof device.deviceId,
                deviceIdLength: device.deviceId ? device.deviceId.length : 'N/A'
            });
            
            if (!device.deviceId || device.deviceId === 'null' || device.deviceId === 'undefined') {
                console.warn('⚠️ DeviceId inválido encontrado:', device.deviceId);
                return; // Pular dispositivos com deviceId inválido
            }
            
            persistentDevices.set(device.deviceId, device);
        });
        
        log.info(`Dispositivos carregados do PostgreSQL`, { count: devices.length });
    } catch (error) {
        log.error('Erro ao carregar dispositivos do PostgreSQL', error);
    }
}

async function saveDeviceToDatabase(deviceData) {
    try {
        await DeviceModel.upsert(deviceData);
        log.debug(`Dispositivo salvo no PostgreSQL`, { deviceId: deviceData.deviceId });
    } catch (error) {
        log.error('Erro ao salvar dispositivo no PostgreSQL', error);
    }
}

function loadAdminPasswordFromFile() {
    try {
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
        // Dados já salvos no PostgreSQL via saveDeviceToDatabase
        log.info(`Limpeza de dados concluída`, { 
            devicesCleaned: cleanedCount,
            totalDevices: persistentDevices.size
        });
    }
}

// Carregar dispositivos ao iniciar
loadDevicesFromDatabase();

// Carregar senha de administrador salva na inicialização
loadAdminPasswordFromFile();
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

    ws.on('message', async (message) => {
        try {
            ws.lastActivity = Date.now();
            ws.messageCount++;
            serverStats.totalMessages++;
            
            const data = JSON.parse(message);
            console.log('Tipo:', data.type);
            console.log('Data completa:', data);
            console.log('Connection ID:', ws.connectionId);
            console.log('Tipo de conexão:', ws.connectionType);
            
            log.debug(`Mensagem recebida`, {
                connectionId: ws.connectionId,
                type: data.type,
                size: message.length
            });
            
            await handleMessage(ws, data);
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
                    // Dados já salvos no PostgreSQL via saveDeviceToDatabase
                }
                
                log.info(`Dispositivo desconectado`, { deviceId });
                
                // Limpar dados sensíveis quando desconectado
                if (persistentDevices.has(deviceId)) {
                    const device = persistentDevices.get(deviceId);
                    persistentDevices.set(deviceId, {
                        ...device,
                        status: 'offline',
                        lastSeen: Date.now(),
                        // Limpar dados sensíveis - manter apenas identificação básica
                        batteryLevel: 0,
                        storageTotal: 0,
                        storageUsed: 0,
                        installedAppsCount: 0,
                        allowedApps: [],
                        isCharging: false
                    });
                    log.info('Dados limpos para dispositivo offline', { deviceId });
                }
                
                // Notificar clientes web IMEDIATAMENTE sobre desconexão
                notifyWebClients({
                    type: 'device_disconnected',
                    deviceId: deviceId,
                    timestamp: Date.now(),
                    reason: 'websocket_closed'
                });
                
                // Também enviar atualização de status para garantir que a UI seja atualizada
                notifyWebClients({
                    type: 'device_status_update',
                    deviceId: deviceId,
                    status: 'offline',
                    lastSeen: Date.now(),
                    reason: 'websocket_closed'
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

async function handleMessage(ws, data) {
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
            // Registrar conexão bem-sucedida no monitor de saúde
            if (ws.deviceId) {
                healthMonitor.recordConnection(ws.deviceId, true);
            }
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
            await handleDeleteDevice(ws, data);
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
        case 'clear_location_history':
            handleClearLocationHistory(ws, data);
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
    
    console.log('📥 ═══════════════════════════════════════════════');
    console.log('📥 DEVICE_STATUS RECEBIDO DO LAUNCHER');
    console.log('📥 ═══════════════════════════════════════════════');
    console.log(`   DeviceId: ${deviceId}`);
    console.log(`   Nome recebido: "${data.data.name}"`);
    console.log(`   Modelo: ${data.data.model}`);
    console.log(`   🔢 SERIAL NUMBER: "${data.data.serialNumber}"`);
    console.log('📥 ═══════════════════════════════════════════════');
    
    log.info(`Device status received`, {
        deviceId,
        name: data.data.name,
        model: data.data.model,
        isDeviceOwner: data.data.isDeviceOwner,
        installedAppsCount: data.data.installedApps?.length || 0,
        allowedAppsCount: data.data.allowedApps?.length || 0,
        batteryLevel: data.data.batteryLevel,
        androidVersion: data.data.androidVersion
    });
    
    // Verificar se deviceId é válido
    if (!deviceId || deviceId === 'null' || deviceId === 'undefined') {
        console.error('❌ DeviceId inválido:', deviceId);
        return;
    }
    
    // Marcar como dispositivo Android
    ws.isDevice = true;
    ws.deviceId = deviceId;
    
    console.log('Dispositivo marcado como Android:', ws.isDevice);
    console.log('DeviceId do WebSocket:', ws.deviceId);
    
    // Armazenar informações detalhadas do dispositivo
    ws.deviceInfo = data.data;
    
    // Verificar se dispositivo já existe
    const existingDevice = persistentDevices.get(deviceId);
    const isReconnection = existingDevice !== undefined;
    
    if (isReconnection) {
        console.log('🔄 ═══════════════════════════════════════════════');
        console.log('🔄 RECONEXÃO DETECTADA');
        console.log('🔄 ═══════════════════════════════════════════════');
        console.log(`   DeviceId: ${deviceId}`);
        console.log(`   Nome ANTERIOR: "${existingDevice.name}"`);
        console.log(`   Nome NOVO: "${data.data.name}"`);
        console.log(`   Nome mudou? ${existingDevice.name !== data.data.name ? 'SIM' : 'NÃO'}`);
        console.log(`   Modelo: ${data.data.model}`);
        console.log(`   Status anterior: ${existingDevice.status}`);
        console.log(`   Última vez visto: ${existingDevice.lastSeen ? new Date(existingDevice.lastSeen).toISOString() : 'nunca'}`);
        console.log(`   Tempo offline: ${existingDevice.lastSeen ? Math.round((now - existingDevice.lastSeen) / 1000) + 's' : 'desconhecido'}`);
        console.log('🔄 ═══════════════════════════════════════════════');
    } else {
        console.log('🆕 ═══════════════════════════════════════════════');
        console.log('🆕 NOVO DISPOSITIVO DETECTADO');
        console.log('🆕 ═══════════════════════════════════════════════');
        console.log(`   DeviceId: ${deviceId}`);
        console.log(`   Nome: ${data.data.name}`);
        console.log(`   Modelo: ${data.data.model}`);
        console.log(`   Fabricante: ${data.data.manufacturer}`);
        console.log(`   Android: ${data.data.androidVersion}`);
        console.log('🆕 ═══════════════════════════════════════════════');
    }
    
    // Armazenar dispositivo conectado
    connectedDevices.set(deviceId, ws);
    
    // Armazenar dispositivo persistente com informações completas
    const deviceData = {
        ...data.data,
        status: 'online',
        lastSeen: now, // Sempre atualizar com timestamp atual
        connectionId: ws.connectionId,
        connectedAt: ws.connectedAt
    };
    
    console.log('💾 Salvando dados do dispositivo no PostgreSQL...');
    
    // Verificar se o nome mudou (sempre, não apenas em reconexões)
    const nameChanged = existingDevice && existingDevice.name !== data.data.name;
    
    if (nameChanged) {
        console.log('🔔 Nome mudou durante atualização de status!');
        console.log(`   Nome anterior: "${existingDevice.name}"`);
        console.log(`   Nome novo: "${data.data.name}"`);
    }
    
    persistentDevices.set(deviceId, deviceData);
    
    // Salvar no PostgreSQL
    saveDeviceToDatabase(deviceData);
    
    // Se o nome mudou, notificar especificamente sobre a mudança
    if (nameChanged) {
        console.log('📝 ═══════════════════════════════════════════════');
        console.log('📝 NOME DO DISPOSITIVO ALTERADO!');
        console.log('📝 ═══════════════════════════════════════════════');
        console.log(`   DeviceId: ${deviceId}`);
        console.log(`   Nome anterior: "${existingDevice.name}"`);
        console.log(`   Nome novo: "${data.data.name}"`);
        console.log('📝 ═══════════════════════════════════════════════');
        
        // Notificar clientes web sobre mudança de nome COM OS DADOS COMPLETOS DO DISPOSITIVO
        notifyWebClients({
            type: 'device_name_changed',
            deviceId: deviceId,
            oldName: existingDevice.name,
            newName: data.data.name,
            device: deviceData,
            timestamp: now
        });
        
        // TAMBÉM enviar device_connected para garantir atualização imediata na UI
        notifyWebClients({
            type: 'device_connected',
            device: deviceData,
            timestamp: now
        });
        
        console.log('📤 Notificações de mudança de nome enviadas aos clientes web');
    }
    
    // Enviar senha de administrador se estiver definida
    if (globalAdminPassword) {
        const message = {
            type: 'set_admin_password',
            data: { password: globalAdminPassword }
        };
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
    
    // Notificar todos os clientes web sobre o novo dispositivo conectado
    const connectedDeviceData = persistentDevices.get(deviceId);
    if (connectedDeviceData) {
        console.log('📤 Notificando clientes web sobre dispositivo conectado...');
        console.log('Número de clientes web:', webClients.size);
        console.log('Dados a enviar:', {
            deviceId: connectedDeviceData.deviceId,
            batteryLevel: connectedDeviceData.batteryLevel,
            installedAppsCount: connectedDeviceData.installedAppsCount
        });
        
        let sentCount = 0;
        webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'device_connected',
                    device: connectedDeviceData
                }));
                sentCount++;
            }
        });
        console.log(`✅ Notificação enviada para ${sentCount} clientes web`);
    } else {
        console.warn('⚠️ connectedDeviceData é null para deviceId:', deviceId);
    }
    
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
    const statusDeviceData = persistentDevices.get(deviceId);
    if (statusDeviceData) {
        console.log('Device ID:', deviceId);
        console.log('Bateria:', statusDeviceData.batteryLevel);
        console.log('Apps instalados:', statusDeviceData.installedAppsCount);
        console.log('Apps permitidos:', statusDeviceData.allowedApps?.length || 0);
        console.log('Armazenamento total:', statusDeviceData.storageTotal);
        console.log('Armazenamento usado:', statusDeviceData.storageUsed);
        console.log('=======================================================');
        
        // Enviar dados completos do dispositivo
        notifyWebClients({
            type: 'device_connected',
            device: statusDeviceData,
            timestamp: Date.now()
        });
        
        // Também enviar atualização de status
        notifyWebClients({
            type: 'device_status',
            device: statusDeviceData,
            timestamp: Date.now()
        });
    }
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
    const startTime = Date.now();
    log.debug('Ping recebido', { connectionId: ws.connectionId });
    
    // Registrar latência para timeout adaptativo
    if (ws.deviceId && data.timestamp) {
        const latency = startTime - data.timestamp;
        adaptiveTimeout.updateLatency(ws.deviceId, latency);
        healthMonitor.recordConnection(ws.deviceId, true, latency);
    }
    
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
        
        // Registrar falha no monitor de saúde
        if (ws.deviceId) {
            healthMonitor.recordConnection(ws.deviceId, false);
        }
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
    
    console.log('=== ENVIANDO LISTA DE DISPOSITIVOS PARA CLIENTE WEB ===');
    console.log('Número de dispositivos:', devices.length);
    if (devices.length > 0) {
        console.log('Primeiro dispositivo:', {
            deviceId: devices[0].deviceId,
            name: devices[0].name,
            model: devices[0].model,
            status: devices[0].status,
            batteryLevel: devices[0].batteryLevel,
            installedAppsCount: devices[0].installedAppsCount,
            hasInstalledApps: !!devices[0].installedApps,
            installedAppsLength: devices[0].installedApps?.length
        });
    }
    console.log('=======================================================');
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
    }
}



async function handleDeleteDevice(ws, data) {
    const { deviceId } = data;
    
    // Validar deviceId
    if (!deviceId || deviceId === 'null' || deviceId === 'undefined' || deviceId === null) {
        log.error(`DeviceId inválido recebido para deleção`, {
            deviceId: deviceId,
            deviceIdType: typeof deviceId,
            connectionId: ws.connectionId,
            dataReceived: data
        });
        
        // Enviar resposta de erro para o cliente
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'delete_device_response',
                success: false,
                error: 'ID do dispositivo inválido ou não fornecido',
                deviceId: deviceId
            }));
        }
        return;
    }
    
    // Verificar se o dispositivo existe
    if (!persistentDevices.has(deviceId)) {
        log.warn(`Dispositivo não encontrado para deleção`, {
            deviceId: deviceId,
            connectionId: ws.connectionId,
            availableDevices: Array.from(persistentDevices.keys())
        });
        
        // Enviar resposta de erro para o cliente
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'delete_device_response',
                success: false,
                error: 'Dispositivo não encontrado no servidor',
                deviceId: deviceId
            }));
        }
        return;
    }
    
    try {
        // Obter dados do dispositivo antes de deletar (para logs)
        const deviceData = persistentDevices.get(deviceId);
        
        // Deletar do banco PostgreSQL PRIMEIRO
        await DeviceModel.delete(deviceId);
        log.info(`Dispositivo deletado do PostgreSQL`, { deviceId });
        
        // Remover das listas em memória
        persistentDevices.delete(deviceId);
        connectedDevices.delete(deviceId);
        
        log.info(`Dispositivo deletado permanentemente`, {
            deviceId: deviceId,
            deviceName: deviceData?.name || 'desconhecido',
            connectionId: ws.connectionId
        });
        
        // Enviar confirmação para o cliente que solicitou a deleção
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'delete_device_response',
                success: true,
                message: 'Dispositivo deletado com sucesso',
                deviceId: deviceId
            }));
        }
        
        // Notificar TODOS os clientes web sobre a deleção
        notifyWebClients({
            type: 'device_deleted',
            deviceId: deviceId,
            deviceName: deviceData?.name || 'desconhecido',
            timestamp: Date.now()
        });
        
    } catch (error) {
        log.error(`Erro ao deletar dispositivo`, {
            deviceId: deviceId,
            error: error.message,
            connectionId: ws.connectionId
        });
        
        // Enviar erro para o cliente
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'delete_device_response',
                success: false,
                error: 'Erro interno do servidor',
                deviceId: deviceId
            }));
        }
    }
}

function handleUpdateAppPermissions(ws, data) {
    const { deviceId, allowedApps } = data;
    
    console.log('=== UPDATE APP PERMISSIONS RECEBIDO ===');
    console.log('DeviceId:', deviceId);
    console.log('AllowedApps:', allowedApps);
    console.log('Tipo de dados:', typeof allowedApps);
    console.log('É array?', Array.isArray(allowedApps));
    console.log('=====================================');
    
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
    
    console.log('=== DADOS ATUALIZADOS NO DISPOSITIVO ===');
    console.log('DeviceId:', deviceId);
    console.log('AllowedApps atualizados:', device.allowedApps);
    console.log('========================================');
    
    // Salvar no PostgreSQL
    saveDeviceToDatabase(device);
    
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
        
        console.log('=== ENVIANDO MENSAGEM PARA ANDROID ===');
        console.log('DeviceId:', deviceId);
        console.log('Mensagem:', JSON.stringify(message, null, 2));
        console.log('WebSocket estado:', deviceWs.readyState);
        console.log('=====================================');
        
        deviceWs.send(JSON.stringify(message));
        
        log.info(`Permissões enviadas para o dispositivo Android`, {
            deviceId: deviceId,
            allowedAppsCount: allowedApps?.length || 0
        });
    } else {
        console.log('=== DISPOSITIVO ANDROID NÃO CONECTADO ===');
        console.log('DeviceId:', deviceId);
        console.log('DeviceWs existe:', !!deviceWs);
        console.log('WebSocket estado:', deviceWs?.readyState);
        console.log('=========================================');
        
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
    
    // Salvar no PostgreSQL
    saveDeviceToDatabase(deviceData);
    
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

function handleClearLocationHistory(ws, data) {
    const { deviceId } = data;
    
    console.log('🗑️ ═══════════════════════════════════════════════');
    console.log('🗑️ COMANDO: LIMPAR HISTÓRICO DE LOCALIZAÇÃO');
    console.log('🗑️ ═══════════════════════════════════════════════');
    console.log(`   DeviceId: ${deviceId}`);
    console.log('🗑️ ═══════════════════════════════════════════════');
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'clear_location_history',
            timestamp: Date.now()
        };
        
        deviceWs.send(JSON.stringify(message));
        
        console.log('✅ Comando de limpeza de histórico enviado para o dispositivo');
        
        log.info(`Comando de limpeza de histórico de localização enviado`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
        
        // Notificar clientes web sobre a limpeza
        notifyWebClients({
            type: 'location_history_cleared',
            deviceId: deviceId,
            timestamp: Date.now()
        });
        
    } else {
        console.error('❌ Dispositivo não encontrado ou desconectado');
        log.warn(`Dispositivo não encontrado ou desconectado para limpeza de histórico`, {
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
    
    console.log('=== NOTIFICANDO CLIENTES WEB ===');
    console.log('Tipo da mensagem:', message.type);
    console.log('Número de clientes web:', webClients.size);
    
    if (message.type === 'device_connected' && message.device) {
        console.log('📤 Enviando device_connected aos clientes web:', {
            deviceId: message.device.deviceId,
            name: message.device.name,
            batteryLevel: message.device.batteryLevel,
            installedAppsCount: message.device.installedAppsCount,
            allowedAppsCount: message.device.allowedApps?.length || 0,
            storageTotal: message.device.storageTotal,
            storageUsed: message.device.storageUsed
        });
    }
    
    if (message.type === 'device_name_changed') {
        console.log('📝 Enviando device_name_changed aos clientes web:', {
            deviceId: message.deviceId,
            oldName: message.oldName,
            newName: message.newName,
            hasDevice: !!message.device
        });
    }
    
    webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(message));
                successCount++;
                console.log(`Mensagem enviada para cliente ${client.connectionId}`);
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
            console.log(`Cliente ${client.connectionId} removido (desconectado)`);
        }
    });
    
    console.log(`Resultado: ${successCount} sucessos, ${errorCount} erros`);
    console.log('================================');
    
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
    
    // Enviar ping ativo para dispositivos conectados (com throttling)
    connectedDevices.forEach((deviceWs, deviceId) => {
        if (deviceWs.readyState === WebSocket.OPEN && pingThrottler.canPing(deviceId)) {
            try {
                deviceWs.ping();
                log.debug('Ping enviado para dispositivo', { deviceId });
            } catch (error) {
                log.error('Erro ao enviar ping para dispositivo', { deviceId, error: error.message });
                healthMonitor.recordConnection(deviceId, false);
            }
        }
    });
    
    // Verificar dispositivos inativos e atualizar status (com timeout adaptativo)
    const now = Date.now();
    const BASE_INACTIVITY_TIMEOUT = 30 * 1000; // 30 segundos base
    const WARNING_TIMEOUT = 15 * 1000; // 15 segundos para avisar sobre possível desconexão
    
    persistentDevices.forEach((device, deviceId) => {
        const timeSinceLastSeen = now - device.lastSeen;
        const isConnected = connectedDevices.has(deviceId);
        
        // Usar timeout adaptativo baseado na latência do dispositivo
        const adaptiveInactivityTimeout = adaptiveTimeout.getTimeout(deviceId);
        
        // Se o dispositivo não está conectado via WebSocket OU não foi visto há mais do timeout adaptativo
        if (!isConnected || timeSinceLastSeen > adaptiveInactivityTimeout) {
            if (device.status === 'online') {
                log.info(`Dispositivo marcado como offline por inatividade`, {
                    deviceId: deviceId,
                    timeSinceLastSeen: Math.round(timeSinceLastSeen / 1000),
                    isConnected: isConnected,
                    reason: !isConnected ? 'WebSocket desconectado' : 'Timeout de inatividade'
                });
                
                // Atualizar status para offline e limpar dados sensíveis
                persistentDevices.set(deviceId, {
                    ...device,
                    status: 'offline',
                    lastSeen: device.lastSeen, // Manter o último timestamp visto
                    // Limpar dados sensíveis quando offline
                    batteryLevel: 0,
                    storageTotal: 0,
                    storageUsed: 0,
                    installedAppsCount: 0,
                    allowedApps: [],
                    isCharging: false
                });
                
                // Notificar clientes web sobre mudança de status
                webClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'device_status_update',
                            deviceId: deviceId,
                            status: 'offline',
                            lastSeen: device.lastSeen,
                            reason: !isConnected ? 'disconnected' : 'inactive'
                        }));
                    }
                });
            }
        } else if (isConnected && device.status === 'offline') {
            // Se está conectado mas marcado como offline, corrigir
            log.info(`Dispositivo marcado como online (reconectado)`, {
                deviceId: deviceId,
                timeSinceLastSeen: Math.round(timeSinceLastSeen / 1000)
            });
            
            persistentDevices.set(deviceId, {
                ...device,
                status: 'online',
                lastSeen: now
            });
            
            // Notificar clientes web sobre reconexão
            webClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'device_status_update',
                        deviceId: deviceId,
                        status: 'online',
                        lastSeen: now,
                        reason: 'reconnected'
                    }));
                }
            });
        } else if (isConnected && timeSinceLastSeen > WARNING_TIMEOUT) {
            // Dispositivo conectado mas inativo há mais de 15s - enviar ping (com throttling)
            const deviceWs = connectedDevices.get(deviceId);
            if (deviceWs && deviceWs.readyState === WebSocket.OPEN && pingThrottler.canPing(deviceId)) {
                try {
                    deviceWs.ping();
                    log.debug(`Ping de verificação enviado para dispositivo inativo`, { 
                        deviceId,
                        timeSinceLastSeen: Math.round(timeSinceLastSeen / 1000),
                        adaptiveTimeout: Math.round(adaptiveInactivityTimeout / 1000)
                    });
                } catch (error) {
                    log.warn(`Erro ao enviar ping de verificação`, { 
                        deviceId, 
                        error: error.message 
                    });
                    healthMonitor.recordConnection(deviceId, false);
                    // Se falhou ao enviar ping, marcar como offline
                    persistentDevices.set(deviceId, {
                        ...device,
                        status: 'offline',
                        lastSeen: device.lastSeen
                    });
                    connectedDevices.delete(deviceId);
                }
            } else {
                // WebSocket não está aberto, remover da lista de conectados
                log.warn(`WebSocket para dispositivo ${deviceId} não está aberto, removendo da lista`);
                connectedDevices.delete(deviceId);
            }
        }
    });
    
    // Dados já salvos no PostgreSQL via saveDeviceToDatabase
    
    // Enviar ping ativo para dispositivos conectados para manter conexão viva (com throttling)
    if (Math.random() < config.PING_PROBABILITY) { // Probabilidade configurável de enviar ping para reduzir carga
        connectedDevices.forEach((deviceWs, deviceId) => {
            if (deviceWs && deviceWs.readyState === WebSocket.OPEN && pingThrottler.canPing(deviceId)) {
                try {
                    deviceWs.ping();
                    log.debug(`Ping de manutenção enviado para dispositivo`, { deviceId });
                } catch (error) {
                    log.warn(`Erro ao enviar ping de manutenção para dispositivo`, { 
                        deviceId, 
                        error: error.message 
                    });
                    healthMonitor.recordConnection(deviceId, false);
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
    
}, config.HEARTBEAT_INTERVAL); // Intervalo configurável para detecção de desconexões

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
        webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'new_support_message',
                    data: supportMessage
                }));
            }
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
    
    // Iniciar servidor de descoberta automática
    const discoveryServer = new DiscoveryServer();
    console.log('✓ Servidor de descoberta automática iniciado');
    
    // Graceful shutdown do discovery server
    process.on('SIGINT', () => {
        discoveryServer.close();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        discoveryServer.close();
        process.exit(0);
    });
});

// Função para definir senha de administrador
function handleSetAdminPassword(ws, data) {
    console.log('=== DEBUG: handleSetAdminPassword chamada ===');
    console.log('Data recebida:', data);
    console.log('Tipo do cliente:', ws.isWebClient ? 'Web' : 'Dispositivo');
    
    // Extrair password de data.data se existir, senão de data
    const passwordData = data.data || data;
    const { password, deviceId } = passwordData;
    
    console.log('PasswordData extraído:', passwordData);
    console.log('Password:', password);
    console.log('DeviceId:', deviceId);
    
    if (!password) {
        console.log('ERRO: Password é obrigatório');
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Senha de administrador é obrigatória'
        }));
        return;
    }
    
    // Salvar senha globalmente
    globalAdminPassword = password;
    saveAdminPasswordToFile();
    console.log('✅ Senha de administrador definida globalmente e salva no arquivo');
    console.log('Senha definida:', password);
    
    // Enviar comando para o dispositivo específico
    if (deviceId) {
        console.log(`🎯 Enviando senha para dispositivo específico: ${deviceId}`);
        const deviceWs = connectedDevices.get(deviceId);
        if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
            const message = {
                type: 'set_admin_password',
                data: { password }
            };
            const messageStr = JSON.stringify(message);
            console.log(`📤 Enviando mensagem para dispositivo ${deviceId}:`, messageStr);
            console.log(`📤 Tamanho da mensagem: ${messageStr.length} caracteres`);
            console.log(`📤 Password na mensagem: '${password}'`);
            console.log(`📤 Password tamanho: ${password.length}`);
            deviceWs.send(messageStr);
            console.log(`✅ Senha enviada para dispositivo ${deviceId}:`, message);
        } else {
            console.log(`❌ Dispositivo ${deviceId} não encontrado ou desconectado (readyState: ${deviceWs?.readyState})`);
        }
    } else {
        // Enviar para todos os dispositivos conectados
        console.log(`📡 Enviando senha para ${connectedDevices.size} dispositivos conectados`);
        console.log('Dispositivos conectados:', Array.from(connectedDevices.keys()));
        
        let sentCount = 0;
        connectedDevices.forEach((deviceWs, id) => {
            console.log(`🔍 Verificando dispositivo ${id}: readyState=${deviceWs.readyState}, isDevice=${deviceWs.isDevice}`);
            if (deviceWs.readyState === WebSocket.OPEN) {
                const message = {
                    type: 'set_admin_password',
                    data: { password }
                };
                const messageStr = JSON.stringify(message);
                console.log(`📤 Enviando senha para dispositivo ${id}:`, messageStr);
                console.log(`📤 Password enviada: '${password}' (tamanho: ${password.length})`);
                deviceWs.send(messageStr);
                console.log(`✅ Senha enviada para dispositivo ${id}`);
                sentCount++;
            } else {
                console.log(`❌ Dispositivo ${id} não está pronto (readyState: ${deviceWs.readyState})`);
            }
        });
        console.log(`📊 Total de senhas enviadas: ${sentCount}/${connectedDevices.size}`);
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
        // Dados já salvos no PostgreSQL via saveDeviceToDatabase
        
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
