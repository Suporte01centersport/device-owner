// Carregar variáveis de ambiente (respeita DOTENV_CONFIG_PATH)
require('./load-env');

const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');
const config = require('./config');
const DiscoveryServer = require('./discovery-server');

// PostgreSQL imports
const DeviceModel = require('./database/models/Device');
const DeviceGroupModel = require('./database/models/DeviceGroup');
const AppAccessHistory = require('./database/models/AppAccessHistory');
const DeviceStatusHistory = require('./database/models/DeviceStatusHistory');
const ComputerModel = require('./database/models/Computer');
const { query, transaction } = require('./database/config');
const BatchQueue = require('./database/batch-queue');
const LocationCache = require('./database/location-cache');

// ==================== JWT Auth ====================
const JWT_SECRET = process.env.JWT_SECRET || 'mdm-secret-key-change-in-production';

function createJWT(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

function verifyJWT(token) {
    try {
        const [header, body, signature] = token.split('.');
        const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
        if (signature !== expected) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch { return null; }
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper: parse JSON body from raw HTTP request
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

// Helper: extract and verify JWT from Authorization header
function authenticateRequest(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return verifyJWT(authHeader.slice(7));
}

// ==================== Rate Limiter ====================
const loginAttempts = new Map(); // IP -> { count, firstAttempt }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;

// Auto-clean old entries every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of loginAttempts) {
        if (now - data.firstAttempt > RATE_LIMIT_WINDOW) {
            loginAttempts.delete(ip);
        }
    }
}, RATE_LIMIT_WINDOW);

function isRateLimited(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
        return false;
    }
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}

// Ensure admin_users table exists and has default user
async function ensureAdminUsersSchema() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_login TIMESTAMPTZ
            );
        `);
        // Insert default admin user if table is empty
        const defaultHash = hashPassword('adm123');
        await query(`
            INSERT INTO admin_users (username, password_hash, name, role)
            SELECT 'adm', $1, 'Administrador', 'admin'
            WHERE NOT EXISTS (SELECT 1 FROM admin_users LIMIT 1);
        `, [defaultHash]);
        console.log('✅ Tabela admin_users verificada/criada');

        // Criar tabela de restrições de dispositivo (dropar se device_id era UUID)
        try {
            const colCheck = await query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'device_restrictions' AND column_name = 'device_id'`);
            if (colCheck.rows.length > 0 && colCheck.rows[0].data_type === 'uuid') {
                await query(`DROP TABLE device_restrictions`);
                console.log('Tabela device_restrictions antiga (UUID) removida');
            }
        } catch (_) {}
        await query(`
            CREATE TABLE IF NOT EXISTS device_restrictions (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(255) UNIQUE NOT NULL,
                restrictions JSONB NOT NULL DEFAULT '{}',
                is_global BOOLEAN DEFAULT false,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ Tabela device_restrictions verificada/criada');

        // Carregar restrições do banco AQUI (após tabela garantida)
        try {
            const globalResult = await query("SELECT restrictions FROM device_restrictions WHERE device_id = '__global__'");
            if (globalResult.rows.length > 0) {
                globalRestrictions = globalResult.rows[0].restrictions;
            }
            const perDeviceResult = await query("SELECT device_id, restrictions FROM device_restrictions WHERE device_id != '__global__'");
            for (const row of perDeviceResult.rows) {
                perDeviceRestrictions[row.device_id] = row.restrictions;
            }
            console.log('✅ Restrições carregadas do banco', { global: !!globalRestrictions, perDevice: Object.keys(perDeviceRestrictions).length });
        } catch (e2) {
            console.log('Restrições do banco não disponíveis, usando arquivo', e2.message);
        }
        // Criar tabela audit_logs
        await query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                action VARCHAR(100) NOT NULL,
                target_type VARCHAR(50),
                target_id VARCHAR(255),
                target_name VARCHAR(255),
                details JSONB DEFAULT '{}',
                user_agent VARCHAR(500),
                ip_address VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        // Garantir que colunas target_type e target_name existam (tabela pode ter sido criada com schema antigo)
        await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(50)`).catch(() => {});
        await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_name VARCHAR(255)`).catch(() => {});
        console.log('✅ Tabela audit_logs verificada/criada');
    } catch (e) {
        console.error('❌ Falha ao garantir tabelas de schema:', e.message);
    }
}

ensureAdminUsersSchema();
// ==================== End JWT Auth ====================

// Função para obter IP público da rede
let cachedPublicIp = null;
let publicIpCacheTime = 0;
const PUBLIC_IP_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

async function getPublicIp() {
    // Usar cache se ainda válido
    const now = Date.now();
    if (cachedPublicIp && (now - publicIpCacheTime) < PUBLIC_IP_CACHE_DURATION) {
        return cachedPublicIp;
    }

    const fetchIpFromService = (url, type) => new Promise((resolve, reject) => {
        let req;
        const timeout = setTimeout(() => {
            if (req) req.destroy();
            reject(new Error('Timeout'));
        }, 5000);
        req = https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    const ip = type === 'json' ? JSON.parse(data).ip : data.trim();
                    if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) resolve(ip);
                    else reject(new Error('IP inválido'));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });

    // Todas as requisições em paralelo — usar a primeira que responder com IP válido
    try {
        const ip = await Promise.any([
            fetchIpFromService('https://api.ipify.org?format=json', 'json'),
            fetchIpFromService('https://api64.ipify.org?format=json', 'json'),
            fetchIpFromService('https://ifconfig.me/ip', 'text')
        ]);
        cachedPublicIp = ip;
        publicIpCacheTime = now;
        console.log(`🌐 IP público obtido: ${ip}`);
        return ip;
    } catch (_) {
        console.warn('⚠️ Não foi possível obter IP público de nenhum serviço');
        return null;
    }
}

/**
 * Obtém URL do APK acessível de qualquer rede (WiFi diferente do servidor).
 * Prioridade: MDM_PUBLIC_URL > WEBSOCKET_CLIENT_HOST (mesma rede) > IP público > IP local
 */
async function getApkUrlForAnyNetwork() {
    // 1. URL pública configurada (domínio, IP público, ngrok, etc.)
    const publicBase = process.env.MDM_PUBLIC_URL || process.env.WEBSOCKET_PUBLIC_URL;
    if (publicBase && publicBase.trim()) {
        const base = publicBase.trim().replace(/\/$/, '');
        const apkUrl = `${base}/apk/mdm.apk`;
        console.log('📡 APK URL (MDM_PUBLIC_URL):', apkUrl);
        return apkUrl;
    }

    // 2. IP configurado para clientes na mesma rede (celulares no WiFi)
    const clientHost = process.env.WEBSOCKET_CLIENT_HOST || process.env.WEBSOCKET_HOST;
    if (clientHost && !['localhost', '127.0.0.1', '0.0.0.0'].includes(clientHost)) {
        const apkUrl = `http://${clientHost}:${process.env.WEBSOCKET_PORT || '3001'}/apk/mdm.apk`;
        console.log('📡 APK URL (WEBSOCKET_CLIENT_HOST - mesma rede):', apkUrl);
        return apkUrl;
    }

    // 3. IP público detectado automaticamente
    const publicIp = await getPublicIp();
    if (publicIp) {
        const apkUrl = `http://${publicIp}:${process.env.WEBSOCKET_PORT || '3001'}/apk/mdm.apk`;
        console.log('📡 APK URL (IP público):', apkUrl);
        return apkUrl;
    }

    // 4. Fallback: IP local (apenas mesma rede)
    const interfaces = os.networkInterfaces();
    let serverIp = 'localhost';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                serverIp = iface.address;
                break;
            }
        }
        if (serverIp !== 'localhost') break;
    }
    const apkUrl = `http://${serverIp}:${process.env.WEBSOCKET_PORT || '3001'}/apk/mdm.apk`;
    console.log('📡 APK URL (IP local - mesma rede):', apkUrl);
    return apkUrl;
}

/**
 * Retorna o caminho do APK preferido para provisioning.
 * Prioridade: RELEASE > public/apk/mdm.apk > DEBUG
 * IMPORTANTE: mesma ordem usada no endpoint /apk/mdm.apk e no cálculo de checksum
 */
function getPreferredApkPath() {
    const pathMod = require('path');
    const projectRoot = pathMod.resolve(__dirname, '..', '..');
    const releasePath = pathMod.join(projectRoot, 'mdm-owner', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    const publicApkPath = pathMod.join(__dirname, '..', 'public', 'apk', 'mdm.apk');
    const debugPath = pathMod.join(projectRoot, 'mdm-owner', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (fs.existsSync(releasePath)) return { path: releasePath, type: 'release' };
    if (fs.existsSync(publicApkPath)) return { path: publicApkPath, type: 'public' };
    if (fs.existsSync(debugPath)) return { path: debugPath, type: 'debug' };
    return null;
}

/**
 * Calcula o checksum do certificado de assinatura do APK (SHA-256 em base64url).
 * Android Enterprise provisioning exige o hash do CERTIFICADO, não do arquivo.
 */
function getApkSigningChecksum(apkPath) {
    try {
        const { execSync } = require('child_process');
        const apksignerJar = 'C:/Users/admin/AppData/Local/Android/Sdk/build-tools/33.0.0/lib/apksigner.jar';
        const certOutput = execSync(`java -jar "${apksignerJar}" verify --print-certs "${apkPath}"`, { timeout: 15000 }).toString();
        const sha256Match = certOutput.match(/SHA-256 digest:\s*([a-f0-9]+)/);
        if (sha256Match && sha256Match[1]) {
            const checksum = Buffer.from(sha256Match[1], 'hex').toString('base64url');
            console.log(`✅ Checksum do certificado APK: ${checksum}`);
            return checksum;
        }
    } catch (e) {
        console.error('⚠️ Erro ao extrair checksum via apksigner:', e.message);
    }
    // Fallback: hash do arquivo inteiro (pode não funcionar para provisioning)
    console.warn('⚠️ Usando fallback: hash do arquivo APK (pode falhar no provisioning)');
    const fileBuffer = fs.readFileSync(apkPath);
    return crypto.createHash('sha256').update(fileBuffer).digest('base64url');
}

async function getWebSocketUrlForClients() {
    const port = process.env.WEBSOCKET_PORT || '3001';
    const publicUrl = process.env.MDM_PUBLIC_URL || process.env.WEBSOCKET_PUBLIC_URL;
    const protocol = publicUrl?.startsWith('https') ? 'wss' : 'ws';
    // 1. URL pública tem prioridade (funciona de qualquer rede/WiFi)
    if (publicUrl) {
        try {
            const u = new URL(publicUrl);
            return `${protocol}://${u.hostname}:${port}`;
        } catch (_) {}
    }
    // 2. WEBSOCKET_CLIENT_HOST ou WEBSOCKET_HOST (IP real) - mesma rede
    const envHost = process.env.WEBSOCKET_CLIENT_HOST || process.env.WEBSOCKET_HOST;
    if (envHost && !['localhost', '127.0.0.1', '0.0.0.0'].includes(envHost)) {
        return `ws://${envHost}:${port}`;
    }
    // 2. Priorizar IP local 192.168.x.x (WiFi) sobre 172.x (WSL/Docker)
    const interfaces = os.networkInterfaces();
    let bestIp = null;
    let bestScore = 0;
    const scoreIp = (addr) => {
        if (addr.startsWith('192.168.')) return 3;
        if (addr.startsWith('10.')) return 2;
        if (addr.startsWith('172.')) return 1;
        return 0;
    };
    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('vether') || name.toLowerCase().includes('docker')) continue;
        for (const iface of interfaces[name] || []) {
            if (iface.family !== 'IPv4' || iface.internal || iface.address.startsWith('169.')) continue;
            const score = scoreIp(iface.address);
            if (score > bestScore) {
                bestScore = score;
                bestIp = iface.address;
            }
        }
    }
    if (bestIp) return `ws://${bestIp}:${port}`;
    const publicIp = await getPublicIp();
    if (publicIp) return `ws://${publicIp}:${port}`;
    return `ws://localhost:${port}`;
}

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

        // File logging configuration
        this.logDir = path.join(__dirname, 'logs');
        this.logFile = path.join(this.logDir, 'mdm-server.log');
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.maxFiles = 7;
        this.fileLoggingEnabled = false;
        this._currentDate = null;
        this._writeStream = null;
        this._initFileLogging();
    }

    _initFileLogging() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
            this._openStream();
            this.fileLoggingEnabled = true;
        } catch (err) {
            console.warn('[Logger] Failed to initialize file logging:', err.message);
        }
    }

    _openStream() {
        if (this._writeStream) {
            try { this._writeStream.end(); } catch (_) { /* ignore */ }
        }
        this._currentDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        this._writeStream = fs.createWriteStream(this.logFile, { flags: 'a' });
        this._writeStream.on('error', () => {
            this.fileLoggingEnabled = false;
        });
    }

    _shouldRotate() {
        try {
            const today = new Date().toISOString().slice(0, 10);
            if (today !== this._currentDate) return true;
            const stats = fs.statSync(this.logFile);
            if (stats.size >= this.maxFileSize) return true;
        } catch (_) {
            // File may not exist yet, no rotation needed
        }
        return false;
    }

    _rotate() {
        try {
            if (this._writeStream) {
                this._writeStream.end();
                this._writeStream = null;
            }
            // Rename current log to timestamped file
            if (fs.existsSync(this.logFile)) {
                const timestamp = this._currentDate || new Date().toISOString().slice(0, 10);
                const now = Date.now();
                const rotatedName = path.join(this.logDir, `mdm-server-${timestamp}-${now}.log`);
                fs.renameSync(this.logFile, rotatedName);
            }
            // Cleanup old files beyond maxFiles
            this._cleanup();
            // Open a fresh stream
            this._openStream();
            this.fileLoggingEnabled = true;
        } catch (err) {
            console.warn('[Logger] Log rotation failed:', err.message);
            this.fileLoggingEnabled = false;
        }
    }

    _cleanup() {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.startsWith('mdm-server-') && f.endsWith('.log'))
                .map(f => ({ name: f, time: fs.statSync(path.join(this.logDir, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time);

            while (files.length > this.maxFiles) {
                const oldest = files.pop();
                fs.unlinkSync(path.join(this.logDir, oldest.name));
            }
        } catch (_) { /* ignore cleanup errors */ }
    }

    _writeToFile(line) {
        if (!this.fileLoggingEnabled) return;
        try {
            if (this._shouldRotate()) {
                this._rotate();
            }
            if (this._writeStream && !this._writeStream.destroyed) {
                this._writeStream.write(line + '\n');
            }
        } catch (_) {
            // Graceful fallback: file logging silently fails
        }
    }

    setLevel(level) {
        this.currentLevel = this.levels[level] || this.levels.info;
    }

    log(level, message, data = {}) {
        if (this.levels[level] <= this.currentLevel) {
            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
            const dataStr = data && Object.keys(data).length > 0 ? ' ' + JSON.stringify(data) : '';
            console.log(logLine, data);
            this._writeToFile(logLine + dataStr);
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

// ═══════════════════════════════════════════════
// Alertas automáticos e Audit Log
// ═══════════════════════════════════════════════

async function logAudit(action, targetType, targetId, targetName, details = {}) {
    try {
        await query(
            'INSERT INTO audit_logs (action, target_type, target_id, target_name, details) VALUES ($1, $2, $3, $4, $5)',
            [action, targetType, targetId, targetName, JSON.stringify(details)]
        );
    } catch (e) {
        console.error('Audit log error:', e.message);
    }
}

async function createBatteryAlert(deviceId, deviceName, batteryLevel) {
    if (batteryLevel < 15) {
        try {
            await query(
                `INSERT INTO alerts (type, severity, device_id, device_name, message, details)
                 SELECT $1, $2, $3, $4, $5, $6
                 WHERE NOT EXISTS (
                   SELECT 1 FROM alerts WHERE type = $1 AND device_id = $3 AND is_resolved = false
                 )`,
                ['battery_low', batteryLevel < 5 ? 'critical' : 'warning', deviceId, deviceName,
                 `Bateria baixa: ${batteryLevel}%`, JSON.stringify({ batteryLevel })]
            );
        } catch (e) {
            console.error('Alert error (battery_low):', e.message);
        }
    }
}

async function resolveBatteryAlert(deviceId) {
    try {
        await query(
            `UPDATE alerts SET is_resolved = true, resolved_at = NOW()
             WHERE device_id = $1 AND type = 'battery_low' AND is_resolved = false`,
            [deviceId]
        );
    } catch (e) {
        console.error('Alert resolve error (battery):', e.message);
    }
}

async function createOfflineAlert(deviceId, deviceName) {
    try {
        await query(
            `INSERT INTO alerts (type, severity, device_id, device_name, message, details)
             SELECT $1, $2, $3, $4, $5, $6
             WHERE NOT EXISTS (
               SELECT 1 FROM alerts WHERE type = $1 AND device_id = $3 AND is_resolved = false
             )`,
            ['device_offline', 'warning', deviceId, deviceName || 'Dispositivo Desconhecido',
             `Dispositivo ficou offline`, JSON.stringify({ disconnectedAt: new Date().toISOString() })]
        );
    } catch (e) {
        console.error('Alert error (device_offline):', e.message);
    }
}

async function resolveOfflineAlert(deviceId) {
    try {
        await query(
            `UPDATE alerts SET is_resolved = true, resolved_at = NOW()
             WHERE device_id = $1 AND type = 'device_offline' AND is_resolved = false`,
            [deviceId]
        );
    } catch (e) {
        console.error('Alert resolve error (offline):', e.message);
    }
}

// Criar servidor HTTP para API REST
const server = http.createServer(async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ==================== Auth API Routes ====================

    // POST /api/auth/login
    if (req.method === 'POST' && req.url === '/api/auth/login') {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        if (isRateLimited(clientIp)) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }));
            return;
        }
        try {
            const { username, password } = await parseBody(req);
            if (!username || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Usuário e senha são obrigatórios' }));
                return;
            }
            const result = await query('SELECT * FROM admin_users WHERE username = $1', [username]);
            if (result.rows.length === 0) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Credenciais inválidas' }));
                return;
            }
            const user = result.rows[0];
            const inputHash = hashPassword(password);
            if (inputHash !== user.password_hash) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Credenciais inválidas' }));
                return;
            }
            // Update last_login
            await query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [user.id]);
            const token = createJWT({ id: user.id, username: user.username, name: user.name, role: user.role });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                token,
                user: { id: user.id, username: user.username, name: user.name, role: user.role }
            }));
        } catch (e) {
            console.error('Login error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Erro interno do servidor' }));
        }
        return;
    }

    // GET /api/auth/me
    if (req.method === 'GET' && req.url === '/api/auth/me') {
        const payload = authenticateRequest(req);
        if (!payload) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Token inválido ou expirado' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: { id: payload.id, username: payload.username, name: payload.name, role: payload.role } }));
        return;
    }

    // POST /api/auth/users (admin only - create user)
    if (req.method === 'POST' && req.url === '/api/auth/users') {
        const payload = authenticateRequest(req);
        if (!payload || payload.role !== 'admin') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Não autorizado' }));
            return;
        }
        try {
            const { username, password, name, role } = await parseBody(req);
            if (!username || !password || !name) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'username, password e name são obrigatórios' }));
                return;
            }
            const pwHash = hashPassword(password);
            const result = await query(
                'INSERT INTO admin_users (username, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, username, name, role, created_at',
                [username, pwHash, name, role || 'admin']
            );
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, user: result.rows[0] }));
        } catch (e) {
            if (e.code === '23505') { // unique violation
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Usuário já existe' }));
            } else {
                console.error('Create user error:', e.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Erro interno do servidor' }));
            }
        }
        return;
    }

    // GET /api/auth/users (admin only - list users)
    if (req.method === 'GET' && req.url === '/api/auth/users') {
        const payload = authenticateRequest(req);
        if (!payload || payload.role !== 'admin') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Não autorizado' }));
            return;
        }
        try {
            const result = await query('SELECT id, username, name, role, created_at, last_login FROM admin_users ORDER BY id');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, users: result.rows }));
        } catch (e) {
            console.error('List users error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Erro interno do servidor' }));
        }
        return;
    }

    // DELETE /api/auth/users/:id (admin only - delete user)
    const deleteUserMatch = req.method === 'DELETE' && req.url && req.url.match(/^\/api\/auth\/users\/(\d+)$/);
    if (deleteUserMatch) {
        const payload = authenticateRequest(req);
        if (!payload || payload.role !== 'admin') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Não autorizado' }));
            return;
        }
        const userId = parseInt(deleteUserMatch[1], 10);
        if (userId === payload.id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Não é possível deletar o próprio usuário' }));
            return;
        }
        try {
            const result = await query('DELETE FROM admin_users WHERE id = $1', [userId]);
            if (result.rowCount === 0) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Usuário não encontrado' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Usuário deletado' }));
        } catch (e) {
            console.error('Delete user error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Erro interno do servidor' }));
        }
        return;
    }

    // ==================== End Auth API Routes ====================

    // Rota para desbloquear dispositivo deletado (usado pelo add-device)
    const unblockMatch = req.method === 'POST' && req.url && req.url.match(/^\/api\/devices\/([^/]+)\/unblock$/);
    if (unblockMatch) {
        const deviceId = decodeURIComponent(unblockMatch[1]);
        if (deletedDeviceIds.has(deviceId)) {
            deletedDeviceIds.delete(deviceId);
            query(`DELETE FROM deleted_devices WHERE device_id = $1`, [deviceId]).catch(() => {});
            console.log(`✅ Dispositivo ${deviceId} desbloqueado para reconexão (add-device)`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Dispositivo desbloqueado' }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Dispositivo não estava bloqueado' }));
        }
        return;
    }

    // Rota para limpar TODOS os bloqueios de dispositivos (usado pelo add-device antes de reinstalar)
    if (req.method === 'POST' && req.url === '/api/devices/clear-all-blocks') {
        try {
            const count = deletedDeviceIds.size;
            deletedDeviceIds.clear();
            await query(`DELETE FROM deleted_devices`).catch(() => {});
            console.log(`🔓 TODOS os bloqueios de dispositivos limpos (${count} dispositivos)`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `${count} bloqueios removidos` }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    // Rota para forçar exclusão completa de um dispositivo (remove de tudo: banco, memória, bloqueios)
    const forceDeleteMatch = req.method === 'DELETE' && req.url && req.url.match(/^\/api\/devices\/([^/]+)$/);
    if (forceDeleteMatch) {
        const deviceId = decodeURIComponent(forceDeleteMatch[1]);
        try {
            // Remover de TUDO
            deletedDeviceIds.delete(deviceId);
            persistentDevices.delete(deviceId);
            connectedDevices.delete(deviceId);
            await query(`DELETE FROM deleted_devices WHERE device_id = $1`, [deviceId]).catch(() => {});
            await query(`DELETE FROM device_locations WHERE device_id = $1`, [deviceId]).catch(() => {});
            await query(`DELETE FROM installed_apps WHERE device_id = $1`, [deviceId]).catch(() => {});
            await query(`DELETE FROM device_group_memberships WHERE device_id = $1`, [deviceId]).catch(() => {});
            await query(`DELETE FROM device_restrictions WHERE device_id = $1`, [deviceId]).catch(() => {});
            await query(`DELETE FROM devices WHERE device_id = $1`, [deviceId]).catch(() => {});
            console.log(`🗑️ Dispositivo ${deviceId} forçado exclusão completa (banco + memória + bloqueios)`);
            // Notificar clientes web
            notifyWebClients({ type: 'device_deleted', deviceId, timestamp: Date.now() });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Dispositivo excluído completamente' }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    // Rota para enviar comando de atualização de APK
    // API HTTP para enviar notificação ao dispositivo (fallback quando WebSocket falha)
    if (req.method === 'POST' && req.url === '/api/devices/send-notification') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const deviceId = parsed.deviceId || parsed.device_id;
                const message = parsed.message || parsed.body || '';
                if (!deviceId || !message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'deviceId e message são obrigatórios' }));
                    return;
                }
                const deviceWs = connectedDevices.get(deviceId);
                if (!deviceWs || deviceWs.readyState !== WebSocket.OPEN) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Dispositivo não conectado' }));
                    return;
                }
                handleSendTestNotification({ connectionId: 'http_api' }, { deviceId, message });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Notificação enviada' }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/update-app') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const { deviceIds, apkUrl: rawApkUrl, version } = JSON.parse(body);

                // Converter URLs relativas em absolutas para o celular conseguir baixar
                let apkUrl = rawApkUrl;
                if (rawApkUrl && (rawApkUrl.startsWith('/') || !rawApkUrl.startsWith('http'))) {
                    // URL relativa como /api/download-apk → converter para URL absoluta
                    const baseUrl = process.env.MDM_PUBLIC_URL || process.env.WEBSOCKET_PUBLIC_URL;
                    if (baseUrl) {
                        apkUrl = `${baseUrl.replace(/\/$/, '')}${rawApkUrl.startsWith('/') ? rawApkUrl : '/' + rawApkUrl}`;
                    } else {
                        // Fallback: usar getApkUrlForAnyNetwork para APK padrão
                        apkUrl = await getApkUrlForAnyNetwork();
                    }
                    console.log(`📡 URL relativa "${rawApkUrl}" convertida para "${apkUrl}"`);
                }

                console.log('═══════════════════════════════════════════════');
                console.log('📥 HTTP API: Comando de atualização recebido');
                console.log('═══════════════════════════════════════════════');
                console.log('Device IDs:', deviceIds);
                console.log('APK URL:', apkUrl);
                console.log('Version:', version);

                // Chamar função para enviar comando via WebSocket
                const result = sendAppUpdateCommand(deviceIds, apkUrl, version || 'latest');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Comando de atualização enviado',
                    ...result
                }));
                
            } catch (error) {
                console.error('Erro ao processar comando de atualização:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: error.message
                }));
            }
        });
        
        return;
    }
    
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    
    // Raiz: indicar que o servidor está rodando (evitar "Endpoint não encontrado" ao acessar localhost:3001)
    if ((path === '/' || path === '') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            service: 'MDM WebSocket',
            message: 'Servidor rodando. Use ws://localhost:3001 para conexão WebSocket.',
            endpoints: ['/api/websocket-url', '/api/apk-url', '/apk/mdm.apk']
        }));
        return;
    }
    
    // Pagina de instalacao do MDM (abre no navegador do celular ao escanear QR)
    if (path === '/install' && req.method === 'GET') {
        const wsPort = process.env.WEBSOCKET_PORT || '3001';
        const host = req.headers.host || `localhost:${wsPort}`;
        const apkUrl = `http://${host}/apk/mdm.apk`;
        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MDM Center - Instalar</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #1e293b; border-radius: 16px; padding: 32px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.5); }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .sub { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
  .btn { display: block; width: 100%; padding: 16px; background: #2563eb; color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: 600; cursor: pointer; text-decoration: none; margin-bottom: 16px; }
  .btn:active { background: #1d4ed8; }
  .steps { text-align: left; font-size: 13px; color: #94a3b8; line-height: 2; }
  .steps b { color: #e2e8f0; }
  .warn { background: #422006; border: 1px solid #854d0e; border-radius: 8px; padding: 12px; font-size: 12px; color: #fbbf24; margin-top: 16px; }
</style>
</head>
<body>
<div class="card">
  <h1>MDM Center</h1>
  <p class="sub">Gerenciamento de Dispositivos</p>
  <a href="${apkUrl}" class="btn" id="downloadBtn">Baixar e Instalar MDM</a>
  <div class="steps">
    <p><b>1.</b> Toque no botao acima para baixar</p>
    <p><b>2.</b> Abra o arquivo baixado (notificacao)</p>
    <p><b>3.</b> Permita instalar de fontes desconhecidas</p>
    <p><b>4.</b> Instale e abra o app</p>
  </div>
  <div class="warn">
    Se o Play Protect bloquear, toque em "Instalar mesmo assim" ou "Mais detalhes" > "Instalar mesmo assim"
  </div>
</div>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }

    // Servir APK do MDM para download via WiFi (dispositivos na mesma rede)
    // IMPORTANTE: priorizar RELEASE (não-debuggable, signing correto) para provisioning funcionar
    if (path === '/apk/mdm.apk' && req.method === 'GET') {
        const pathMod = require('path');
        const projectRoot = pathMod.resolve(__dirname, '..', '..');
        const releasePath = pathMod.join(projectRoot, 'mdm-owner', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
        const publicApkPath = pathMod.join(__dirname, '..', 'public', 'apk', 'mdm.apk');
        const debugPath = pathMod.join(projectRoot, 'mdm-owner', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
        const apkPath = fs.existsSync(releasePath) ? releasePath : (fs.existsSync(publicApkPath) ? publicApkPath : (fs.existsSync(debugPath) ? debugPath : releasePath));
        console.log(`📦 Servindo APK: ${apkPath} (exists: ${fs.existsSync(apkPath)})`);
        if (fs.existsSync(apkPath)) {
            const stat = fs.statSync(apkPath);
            const fileSize = stat.size;
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment; filename="mdm-launcher.apk"');
            res.setHeader('Content-Length', String(fileSize));
            res.setHeader('Accept-Ranges', 'bytes');
            const stream = fs.createReadStream(apkPath);
            stream.on('error', (err) => {
                log.error('Erro ao ler APK', { error: err.message });
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Erro ao ler arquivo APK' }));
                } else {
                    res.end();
                }
            });
            stream.pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'APK não encontrado. Execute o build do MDM primeiro.' }));
        }
        return;
    }
    
    // Alias /api/download-apk → serve o mesmo APK de /apk/mdm.apk
    if (path === '/api/download-apk' && req.method === 'GET') {
        const apkInfo = getPreferredApkPath();
        const apkPath = apkInfo ? apkInfo.path : null;
        if (apkPath && fs.existsSync(apkPath)) {
            const stat = fs.statSync(apkPath);
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment; filename="mdm-launcher.apk"');
            res.setHeader('Content-Length', String(stat.size));
            const s = fs.createReadStream(apkPath);
            s.on('error', (err) => { log.error('Erro stream APK', { error: err.message }); if (!res.headersSent) res.writeHead(500); res.end(); });
            s.pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'APK MDM não encontrado. Execute o build primeiro.' }));
        }
        return;
    }

    // Alias /api/download-wms → serve APK do WMS se existir
    if (path === '/api/download-wms' && req.method === 'GET') {
        const pathMod = require('path');
        const projectRoot = pathMod.resolve(__dirname, '..', '..');
        const wmsDebug = pathMod.join(projectRoot, 'wms-app', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
        const wmsRelease = pathMod.join(projectRoot, 'wms-app', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
        const apkPath = fs.existsSync(wmsRelease) ? wmsRelease : (fs.existsSync(wmsDebug) ? wmsDebug : null);
        if (apkPath) {
            const stat = fs.statSync(apkPath);
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment; filename="wms-app.apk"');
            res.setHeader('Content-Length', String(stat.size));
            const s2 = fs.createReadStream(apkPath);
            s2.on('error', (err) => { log.error('Erro stream WMS', { error: err.message }); if (!res.headersSent) res.writeHead(500); res.end(); });
            s2.pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'APK WMS não encontrado. Coloque o APK em wms-app/app/build/outputs/apk/' }));
        }
        return;
    }

    // Retornar URL do APK MDM (acessível de qualquer rede se MDM_PUBLIC_URL ou IP público)
    if (path === '/api/apk-url' && req.method === 'GET') {
        (async () => {
            try {
                const apkUrl = await getApkUrlForAnyNetwork();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, url: apkUrl }));
            } catch (err) {
                console.error('Erro ao obter APK URL:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }

    // Backup - salvar cópia no servidor
    if (path === '/api/backup' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const pathMod = require('path');
                const backupDir = pathMod.join(__dirname, '..', 'backups');
                if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
                const now = new Date();
                const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
                const filename = parsed.filename || `backup_${ts}.json`;
                const data = parsed.data || parsed;
                const filePath = pathMod.join(backupDir, filename);
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                console.log(`💾 Backup salvo: ${filePath}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: filePath, filename }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // Configuração persistente de wallpaper
    if (path === '/api/config/wallpaper' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { url } = JSON.parse(body);
                await query(`CREATE TABLE IF NOT EXISTS system_config (key VARCHAR(100) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT NOW())`);
                await query(`INSERT INTO system_config (key, value, updated_at) VALUES ('wallpaper_url', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [url || '']);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }
    if (path === '/api/config/wallpaper' && req.method === 'GET') {
        (async () => {
            try {
                await query(`CREATE TABLE IF NOT EXISTS system_config (key VARCHAR(100) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT NOW())`);
                const result = await query(`SELECT value FROM system_config WHERE key = 'wallpaper_url'`);
                const url = result.rows.length > 0 ? result.rows[0].value : '';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, url }));
            } catch (err) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, url: '' }));
            }
        })();
        return;
    }

    // Liberar browser temporariamente em todos os dispositivos (para QR download)
    if (path === '/api/temp-allow-browser' && req.method === 'POST') {
        const tempMsg = JSON.stringify({
            type: 'temp_allow_browser',
            data: { durationMillis: 5 * 60 * 1000 },
            timestamp: Date.now()
        });
        let sent = 0;
        for (const [deviceId, deviceWs] of connectedDevices.entries()) {
            if (deviceWs && deviceWs.readyState === WebSocket.OPEN && deviceWs.isDevice) {
                try { deviceWs.send(tempMsg); sent++; } catch (e) {}
            }
        }
        console.log(`⏳ temp_allow_browser enviado para ${sent} dispositivo(s)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deviceCount: sent }));
        return;
    }

    // Página HTML que redireciona pro deep link e faz fallback pro download direto
    if (path === '/mdm-install' && req.method === 'GET') {
        const serverHost = req.headers.host || 'localhost:3001';
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MDM Center - Instalar</title>
<style>body{margin:0;padding:20px;font-family:Arial,sans-serif;background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center}
h2{margin:0 0 8px}p{color:#aaa;margin:4px 0}
.btn{display:inline-block;margin-top:16px;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:bold}
.btn:active{background:#1d4ed8}.small{font-size:12px;color:#666;margin-top:20px}</style>
<script>
// Tentar abrir deep link automaticamente (se MDM instalado)
var deepLink = 'mdmcenter://download?server=${serverHost}';
var apkUrl = 'http://${serverHost}/apk/mdm.apk';
var opened = false;
window.onload = function() {
    // Tentar deep link
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = deepLink;
    document.body.appendChild(iframe);
    // Se deep link não abrir em 1.5s, baixar APK direto
    setTimeout(function() {
        if (!document.hidden && !opened) {
            window.location.href = apkUrl;
        }
    }, 1500);
};
document.addEventListener('visibilitychange', function() { if (document.hidden) opened = true; });
</script></head><body>
<h2>MDM Center</h2>
<p>Baixando MDM automaticamente...</p>
<a class="btn" href="http://${serverHost}/apk/mdm.apk">Baixar MDM</a>
<p class="small">Se o download não iniciar, toque no botão acima</p>
</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
        return;
    }

    // QR Code com URL HTTP que redireciona pro deep link ou baixa APK direto
    if (path === '/api/apk-qr-image' && req.method === 'GET') {
        (async () => {
            try {
                const QRCode = require('qrcode');
                const url = require('url');
                const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
                const useLocal = params.get('use_local') === 'true';

                let serverAddr;
                if (useLocal) {
                    const interfaces = os.networkInterfaces();
                    let serverIp = 'localhost';
                    for (const name of Object.keys(interfaces)) {
                        for (const iface of interfaces[name]) {
                            if (iface.family === 'IPv4' && !iface.internal) {
                                serverIp = iface.address;
                                break;
                            }
                        }
                        if (serverIp !== 'localhost') break;
                    }
                    serverAddr = `${serverIp}:${process.env.WEBSOCKET_PORT || '3001'}`;
                } else {
                    const apkUrl = await getApkUrlForAnyNetwork();
                    serverAddr = apkUrl.replace(/^https?:\/\//, '').replace(/\/apk\/mdm\.apk$/, '');
                }
                // URL HTTP que funciona com qualquer leitor de QR
                const installUrl = `http://${serverAddr}/mdm-install`;
                console.log(`📱 QR gerado: ${installUrl}`);

                // ✅ Ao gerar QR, liberar browser temporariamente em todos os devices
                const tempMsg = JSON.stringify({
                    type: 'temp_allow_browser',
                    data: { durationMillis: 5 * 60 * 1000 },
                    timestamp: Date.now()
                });
                let tempSent = 0;
                for (const [devId, devWs] of connectedDevices.entries()) {
                    if (devWs && devWs.readyState === WebSocket.OPEN && devWs.isDevice) {
                        try { devWs.send(tempMsg); tempSent++; } catch (e) {}
                    }
                }
                if (tempSent > 0) console.log(`⏳ Browser liberado temporariamente em ${tempSent} dispositivo(s) para QR download`);

                const pngBuffer = await QRCode.toBuffer(installUrl, {
                    type: 'png',
                    width: 400,
                    margin: 2,
                    errorCorrectionLevel: 'M'
                });
                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': pngBuffer.length,
                    'Cache-Control': 'no-cache'
                });
                res.end(pngBuffer);
            } catch (err) {
                console.error('Erro ao gerar APK QR:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }

    // Página HTML que redireciona pro deep link de factory reset
    if (path === '/mdm-wipe' && req.method === 'GET') {
        const parsedWipeUrl = url.parse(req.url, true);
        const token = parsedWipeUrl.query.token || '';
        const ts = parsedWipeUrl.query.ts || '';
        const deepLink = `mdmcenter://wipe?token=${token}&ts=${ts}`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MDM Center - Factory Reset</title>
<style>body{margin:0;padding:20px;font-family:Arial,sans-serif;background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center}
h2{margin:0 0 8px;color:#ef4444}p{color:#aaa;margin:4px 0}
.btn{display:inline-block;margin-top:16px;padding:14px 32px;background:#dc2626;color:#fff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:bold}
.btn:active{background:#b91c1c}.small{font-size:12px;color:#666;margin-top:20px}</style>
<script>
window.onload = function() {
    // Abrir deep link automaticamente
    window.location.href = '${deepLink}';
};
</script></head><body>
<h2>Factory Reset</h2>
<p>Executando factory reset...</p>
<a class="btn" href="${deepLink}">Formatar Agora</a>
<p class="small">Se nao executar automaticamente, toque no botao acima</p>
</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
        return;
    }

    // QR Code para factory reset remoto via página de redirect
    if (path === '/api/wipe-qr-image' && req.method === 'GET') {
        (async () => {
            try {
                const QRCode = require('qrcode');
                const WIPE_SECRET = 'MDM_CENTER_WIPE_2026';
                const ts = Date.now().toString();
                const hmac = crypto.createHmac('sha256', WIPE_SECRET).update(ts).digest('hex');
                // URL HTTP que redireciona pro deep link
                const interfaces = os.networkInterfaces();
                let serverIp = 'localhost';
                for (const name of Object.keys(interfaces)) {
                    for (const iface of interfaces[name]) {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            serverIp = iface.address;
                            break;
                        }
                    }
                    if (serverIp !== 'localhost') break;
                }
                const wsPort = process.env.WEBSOCKET_PORT || '3001';
                const wipeUrl = `http://${serverIp}:${wsPort}/mdm-wipe?token=${hmac}&ts=${ts}`;
                console.log(`📱 QR Wipe gerado: ${wipeUrl}`);

                // Liberar browser temporariamente
                const tempMsg = JSON.stringify({ type: 'temp_allow_browser', data: { durationMillis: 2 * 60 * 1000 }, timestamp: Date.now() });
                for (const [devId, devWs] of connectedDevices.entries()) {
                    if (devWs && devWs.readyState === WebSocket.OPEN && devWs.isDevice) {
                        try { devWs.send(tempMsg); } catch (e) {}
                    }
                }

                const pngBuffer = await QRCode.toBuffer(wipeUrl, {
                    type: 'png',
                    width: 400,
                    margin: 2,
                    errorCorrectionLevel: 'M'
                });

                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': pngBuffer.length,
                    'Cache-Control': 'no-cache'
                });
                res.end(pngBuffer);
            } catch (err) {
                console.error('Erro ao gerar wipe QR:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }

    // Configurar Device Owner via ADB (USB)
    if (path === '/api/usb-set-device-owner' && req.method === 'POST') {
        const { exec } = require('child_process');

        exec('adb devices', { timeout: 5000 }, (err, stdout) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'ADB não encontrado.' }));
                return;
            }

            const lines = stdout.trim().split('\n').filter(l => l.includes('\tdevice'));
            if (lines.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Nenhum dispositivo USB conectado.' }));
                return;
            }

            const deviceSerial = lines[0].split('\t')[0];
            console.log(`🔌 Configurando Device Owner via USB: ${deviceSerial}`);

            // Passo 1: Remover contas do dispositivo (necessário para set-device-owner)
            exec(`adb -s ${deviceSerial} shell pm list accounts`, { timeout: 5000 }, (err1, accounts) => {
                // Passo 2: Desabilitar Play Protect
                exec(`adb -s ${deviceSerial} shell settings put global package_verifier_enable 0`, { timeout: 5000 }, () => {
                    exec(`adb -s ${deviceSerial} shell settings put global verifier_verify_adb_installs 0`, { timeout: 5000 }, () => {
                        // Passo 3: Verificar se o app está instalado
                        exec(`adb -s ${deviceSerial} shell pm list packages | grep com.mdm.launcher`, { timeout: 5000 }, (err2, pkgOut) => {
                            if (!pkgOut || !pkgOut.includes('com.mdm.launcher')) {
                                // App não instalado, instalar primeiro
                                const pathMod = require('path');
                                const apkPath = pathMod.resolve(__dirname, '..', 'public', 'apk', 'mdm.apk');
                                console.log(`📦 Instalando APK: ${apkPath}`);
                                exec(`adb -s ${deviceSerial} install -r "${apkPath}"`, { timeout: 120000 }, (errInstall, installOut, installErr) => {
                                    if (errInstall || (installErr && installErr.includes('Failure'))) {
                                        res.writeHead(500, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: false, error: `Falha ao instalar APK: ${installErr || errInstall?.message}` }));
                                        return;
                                    }
                                    console.log(`✅ APK instalado: ${installOut}`);
                                    // Agora configurar Device Owner
                                    setDeviceOwner(deviceSerial, res);
                                });
                                return;
                            }
                            // App já instalado, configurar Device Owner
                            setDeviceOwner(deviceSerial, res);
                        });
                    });
                });
            });
        });

        function setDeviceOwner(serial, response) {
            const { exec } = require('child_process');
            exec(`adb -s ${serial} shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver`, { timeout: 15000 }, (err, stdout, stderr) => {
                const output = (stdout || '') + (stderr || '');
                if (output.includes('Success') || output.includes('Active admin component has already been set')) {
                    console.log(`✅ Device Owner configurado: ${output.trim()}`);
                    // Reiniciar o app para aplicar políticas
                    exec(`adb -s ${serial} shell am force-stop com.mdm.launcher`, { timeout: 5000 }, () => {
                        exec(`adb -s ${serial} shell monkey -p com.mdm.launcher -c android.intent.category.LAUNCHER 1`, { timeout: 5000 }, () => {
                            response.writeHead(200, { 'Content-Type': 'application/json' });
                            response.end(JSON.stringify({
                                success: true,
                                message: 'Device Owner configurado com sucesso! O MDM agora tem controle total do dispositivo.'
                            }));
                        });
                    });
                } else if (output.includes('already several accounts') || output.includes('already has an account')) {
                    response.writeHead(400, { 'Content-Type': 'application/json' });
                    response.end(JSON.stringify({
                        success: false,
                        error: 'O celular tem contas Google cadastradas. Remova todas as contas em Configurações > Contas antes de configurar Device Owner.'
                    }));
                } else if (output.includes('already set')) {
                    response.writeHead(200, { 'Content-Type': 'application/json' });
                    response.end(JSON.stringify({ success: true, message: 'Device Owner já estava configurado!' }));
                } else {
                    console.error(`❌ Erro ao configurar Device Owner: ${output}`);
                    response.writeHead(500, { 'Content-Type': 'application/json' });
                    response.end(JSON.stringify({ success: false, error: `Erro: ${output.trim() || 'Falha desconhecida'}` }));
                }
            });
        }
        return;
    }

    // Instalar APK via ADB (USB)
    if (path === '/api/usb-install' && req.method === 'POST') {
        const { exec } = require('child_process');
        const pathMod = require('path');

        exec('adb devices', { timeout: 5000 }, (err, stdout) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'ADB não encontrado.' }));
                return;
            }
            const lines = stdout.trim().split('\n').filter(l => l.includes('\tdevice'));
            if (lines.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Nenhum dispositivo USB conectado.' }));
                return;
            }
            const serial = lines[0].split('\t')[0];
            const apkPath = pathMod.resolve(__dirname, '..', 'public', 'apk', 'mdm.apk');

            // Desabilitar Play Protect antes de instalar
            exec(`adb -s ${serial} shell settings put global package_verifier_enable 0`, { timeout: 5000 }, () => {
                exec(`adb -s ${serial} install -r "${apkPath}"`, { timeout: 120000 }, (errInstall, installOut, installErr) => {
                    if (errInstall || (installErr && installErr.includes('Failure'))) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: `Falha: ${installErr || errInstall?.message}` }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'APK instalado com sucesso!' }));
                });
            });
        });
        return;
    }

    // Factory reset via ADB (USB)
    if (path === '/api/usb-wipe' && req.method === 'POST') {
        const { exec } = require('child_process');

        // Verificar se tem dispositivo ADB conectado
        exec('adb devices', { timeout: 5000 }, (err, stdout, stderr) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'ADB não encontrado. Instale Android SDK Platform Tools.' }));
                return;
            }

            const lines = stdout.trim().split('\n').filter(l => l.includes('\tdevice'));
            if (lines.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Nenhum dispositivo USB conectado. Conecte o celular via USB com depuração USB ativada.' }));
                return;
            }

            const deviceSerial = lines[0].split('\t')[0];
            console.log(`🔌 Formatando dispositivo via USB: ${deviceSerial}`);

            // Tentar factory reset via Device Owner primeiro, depois recovery
            exec(`adb -s ${deviceSerial} shell am broadcast -a android.intent.action.FACTORY_RESET -p android`, { timeout: 10000 }, (err2, stdout2, stderr2) => {
                // Fallback: tentar via device policy manager
                exec(`adb -s ${deviceSerial} shell dpm wipe-data`, { timeout: 10000 }, (err3, stdout3, stderr3) => {
                    if (!err3 && !stderr3.includes('Error')) {
                        console.log(`✅ Factory reset via DPM executado: ${stdout3}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Factory reset executado via USB (DPM). O celular será formatado.' }));
                        return;
                    }

                    // Último fallback: reboot recovery
                    exec(`adb -s ${deviceSerial} reboot recovery`, { timeout: 10000 }, (err4) => {
                        if (err4) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: 'Falha ao formatar via USB. Tente manualmente: adb reboot recovery' }));
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Celular reiniciando no modo Recovery. Selecione "Wipe data/factory reset" no menu.' }));
                    });
                });
            });
        });
        return;
    }

    // Verificar dispositivos ADB conectados
    if (path === '/api/usb-devices' && req.method === 'GET') {
        const { exec } = require('child_process');
        exec('adb devices -l', { timeout: 5000 }, (err, stdout) => {
            if (err) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, devices: [], error: 'ADB não disponível' }));
                return;
            }
            const lines = stdout.trim().split('\n').slice(1).filter(l => l.includes('device'));
            const devices = lines.map(l => {
                const parts = l.trim().split(/\s+/);
                const serial = parts[0];
                const model = (l.match(/model:(\S+)/) || [])[1] || 'Desconhecido';
                return { serial, model };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, devices }));
        });
        return;
    }

    // QR Code simples - URL de download do APK (funciona escaneando pela camera)
    if (path === '/api/install-qr-image' && req.method === 'GET') {
        (async () => {
            try {
                const QRCode = require('qrcode');
                // Usar IP local na mesma rede WiFi
                const interfaces = os.networkInterfaces();
                let serverIp = 'localhost';
                for (const name of Object.keys(interfaces)) {
                    for (const iface of interfaces[name]) {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            serverIp = iface.address;
                            break;
                        }
                    }
                    if (serverIp !== 'localhost') break;
                }
                const wsPort = process.env.WEBSOCKET_PORT || '3001';
                const downloadUrl = `http://${serverIp}:${wsPort}/install`;
                console.log(`📱 QR Install simples: ${downloadUrl}`);

                const pngBuffer = await QRCode.toBuffer(downloadUrl, {
                    type: 'png',
                    width: 400,
                    margin: 2,
                    errorCorrectionLevel: 'H'
                });

                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': pngBuffer.length,
                    'Cache-Control': 'no-cache'
                });
                res.end(pngBuffer);
            } catch (err) {
                console.error('Erro ao gerar QR install:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }

    // Diagnóstico de provisioning - mostra qual APK está sendo usado, checksum, URL
    if (path === '/api/provisioning-debug' && req.method === 'GET') {
        (async () => {
            try {
                const apkInfo = getPreferredApkPath();
                const apkUrl = await getApkUrlForAnyNetwork();
                const checksum = apkInfo ? getApkSigningChecksum(apkInfo.path) : null;
                const apkSize = apkInfo && fs.existsSync(apkInfo.path) ? fs.statSync(apkInfo.path).size : null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    apk: apkInfo ? { path: apkInfo.path, type: apkInfo.type, size: apkSize } : null,
                    checksum,
                    apkDownloadUrl: apkUrl,
                    env: {
                        MDM_PUBLIC_URL: process.env.MDM_PUBLIC_URL || '(not set)',
                        WEBSOCKET_PUBLIC_URL: process.env.WEBSOCKET_PUBLIC_URL || '(not set)',
                        WEBSOCKET_PORT: process.env.WEBSOCKET_PORT || '3001'
                    }
                }, null, 2));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        })();
        return;
    }

    // Checksum SHA-256 do APK (necessário para QR provisioning Android)
    if (path === '/api/apk-checksum' && req.method === 'GET') {
        (async () => {
            try {
                const apkInfo = getPreferredApkPath();
                if (!apkInfo) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'APK não encontrado' }));
                    return;
                }
                const checksum = getApkSigningChecksum(apkInfo.path);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, checksum, algorithm: 'SHA-256 (signing cert)', apkPath: apkPath.includes('release') ? 'release' : 'debug' }));
            } catch (err) {
                console.error('Erro ao calcular checksum:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }

    // JSON de provisionamento Android (para QR Code de Device Owner)
    if (path === '/api/provisioning-qr' && req.method === 'GET') {
        (async () => {
            try {
                const url = require('url');
                const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
                const wifiSsid = params.get('wifi_ssid') || '';
                const wifiPassword = params.get('wifi_password') || '';
                const wifiSecurity = params.get('wifi_security') || 'WPA';

                // Obter URL do APK e checksum (usa mesma lógica do endpoint /apk/mdm.apk)
                const apkUrl = await getApkUrlForAnyNetwork();
                const apkInfo = getPreferredApkPath();
                if (!apkInfo) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'APK não encontrado para gerar checksum' }));
                    return;
                }
                console.log(`📋 Provisioning QR: usando APK ${apkInfo.type} em ${apkInfo.path}`);
                const checksum = getApkSigningChecksum(apkInfo.path);

                // Montar URL WebSocket (converter http→ws)
                const publicUrl = process.env.MDM_PUBLIC_URL || process.env.WEBSOCKET_PUBLIC_URL || `http://localhost:${PORT}`;
                const wsUrl = publicUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

                // Montar payload de provisionamento Android
                const payload = {
                    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': 'com.mdm.launcher/.DeviceAdminReceiver',
                    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': apkUrl,
                    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': checksum,
                    'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': true,
                    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
                    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
                        'server_url': wsUrl
                    }
                };

                // Adicionar WiFi se fornecido
                if (wifiSsid) {
                    payload['android.app.extra.PROVISIONING_WIFI_SSID'] = wifiSsid;
                    payload['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = wifiPassword;
                    payload['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] = wifiSecurity;
                    payload['android.app.extra.PROVISIONING_WIFI_HIDDEN'] = false;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, payload, wsUrl, apkUrl }));
            } catch (err) {
                console.error('Erro ao gerar provisioning QR:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }

    // Imagem QR Code de provisionamento (PNG gerado server-side)
    if (path === '/api/provisioning-qr-image' && req.method === 'GET') {
        (async () => {
            try {
                const QRCode = require('qrcode');
                const url = require('url');
                const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
                const wifiSsid = params.get('wifi_ssid') || '';
                const wifiPassword = params.get('wifi_password') || '';
                const wifiSecurity = params.get('wifi_security') || 'WPA';
                const useLocal = params.get('use_local') === 'true';

                // Obter URL do APK - usar IP local se solicitado (provisionamento na mesma rede)
                let apkUrl;
                if (useLocal) {
                    const interfaces = os.networkInterfaces();
                    let serverIp = 'localhost';
                    for (const name of Object.keys(interfaces)) {
                        for (const iface of interfaces[name]) {
                            if (iface.family === 'IPv4' && !iface.internal) {
                                serverIp = iface.address;
                                break;
                            }
                        }
                        if (serverIp !== 'localhost') break;
                    }
                    const wsPort = process.env.WEBSOCKET_PORT || '3001';
                    apkUrl = `http://${serverIp}:${wsPort}/apk/mdm.apk`;
                    console.log('📡 Provisioning QR usando IP LOCAL:', apkUrl);
                } else {
                    apkUrl = await getApkUrlForAnyNetwork();
                }
                const apkInfo = getPreferredApkPath();
                if (!apkInfo) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'APK não encontrado' }));
                    return;
                }
                console.log(`📋 Provisioning QR Image: usando APK ${apkInfo.type} em ${apkInfo.path}`);
                const checksum = getApkSigningChecksum(apkInfo.path);

                let wsUrl;
                if (useLocal) {
                    // Extrair IP do apkUrl (já é local)
                    const localIp = apkUrl.replace(/^https?:\/\//, '').split(':')[0];
                    const wsPort = process.env.WEBSOCKET_PORT || '3001';
                    wsUrl = `ws://${localIp}:${wsPort}`;
                } else {
                    const publicUrl = process.env.MDM_PUBLIC_URL || process.env.WEBSOCKET_PUBLIC_URL || `http://localhost:${PORT}`;
                    wsUrl = publicUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
                }

                const payload = {
                    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': 'com.mdm.launcher/.DeviceAdminReceiver',
                    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': apkUrl,
                    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': checksum,
                    'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': true,
                    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
                    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
                        'server_url': wsUrl
                    }
                };

                if (wifiSsid) {
                    payload['android.app.extra.PROVISIONING_WIFI_SSID'] = wifiSsid;
                    payload['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = wifiPassword;
                    payload['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] = wifiSecurity;
                    payload['android.app.extra.PROVISIONING_WIFI_HIDDEN'] = false;
                }

                const jsonStr = JSON.stringify(payload);
                const pngBuffer = await QRCode.toBuffer(jsonStr, {
                    type: 'png',
                    width: 400,
                    margin: 2,
                    errorCorrectionLevel: 'M'
                });

                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': pngBuffer.length,
                    'Cache-Control': 'no-cache'
                });
                res.end(pngBuffer);
            } catch (err) {
                console.error('Erro ao gerar QR image:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }

    // URL do WebSocket para web e celular conectarem (mesmo em redes diferentes)
    if (path === '/api/websocket-url' && req.method === 'GET') {
        (async () => {
            try {
                const wsUrl = await getWebSocketUrlForClients();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, url: wsUrl }));
            } catch (err) {
                console.error('Erro ao obter WebSocket URL:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        })();
        return;
    }
    
    // Build MDM + enviar atualização para dispositivos via WiFi
    if (path === '/api/build-and-update-mdm' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            (async () => {
                try {
                    const { deviceIds } = body ? JSON.parse(body) : {};
                    const targetIds = deviceIds === 'all' || !deviceIds ? 'all' : (Array.isArray(deviceIds) ? deviceIds : [deviceIds]);
                    
                    const pathMod = require('path');
                    const projectRoot = pathMod.resolve(__dirname, '..', '..');
                    const mdmDir = pathMod.join(projectRoot, 'mdm-owner');
                    const gradlew = pathMod.join(mdmDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
                    const buildCmd = process.platform === 'win32'
                        ? `cd /d "${mdmDir}" && "${gradlew}" assembleDebug -q`
                        : `cd "${mdmDir}" && ./gradlew assembleDebug -q`;
                    
                    console.log('📦 Iniciando build do MDM...');
                    execSync(buildCmd, { encoding: 'utf-8', timeout: 180000 });
                    console.log('✅ Build do MDM concluído');
                    
                    const apkUrl = await getApkUrlForAnyNetwork();
                    
                    const result = sendAppUpdateCommand(targetIds, apkUrl, 'latest');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Build concluído e atualização enviada. Dispositivos podem baixar em qualquer rede.',
                        apkUrl,
                        ...result
                    }));
                } catch (err) {
                    console.error('Erro build-and-update-mdm:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: err.message || 'Erro ao fazer build ou enviar atualização'
                    }));
                }
            })();
        });
        return;
    }
    
    if (path === '/api/devices/realtime' && req.method === 'GET') {
        // Endpoint para obter dados em tempo real dos dispositivos
        const devices = Array.from(persistentDevices.values())
            .filter(device => !deletedDeviceIds.has(device.deviceId))
            .map(device => ({
            deviceId: device.deviceId,
            name: device.name,
            status: device.status,
            batteryLevel: device.batteryLevel || 0,
            batteryStatus: device.batteryStatus,
            isCharging: device.isCharging || false,
            latitude: device.latitude,
            longitude: device.longitude,
            address: device.address || null,
            lastLocationUpdate: device.lastLocationUpdate || null,
            locationProvider: device.locationProvider || null,
            locationAccuracy: device.locationAccuracy || null,
            wifiSSID: device.wifiSSID || null,
            networkType: device.networkType || null,
            isWifiEnabled: device.isWifiEnabled || false,
            ipAddress: device.ipAddress || device.publicIpAddress || null,
            lastSeen: device.lastSeen || Date.now()
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: devices }));
        return;
    }
    
    if (path === '/api/devices/status' && req.method === 'GET') {
        // Endpoint para status dos dispositivos (fallback HTTP)
        const devices = Array.from(persistentDevices.values())
            .filter(device => !deletedDeviceIds.has(device.deviceId))
            .map(device => ({
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
            ipAddress: device.ipAddress || device.publicIpAddress || null,
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
        
    } else if (path === '/api/server/restart' && req.method === 'POST') {
        log.info('Reinício do servidor solicitado via API');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Reinício agendado' }));
        setTimeout(() => {
            wss.clients.forEach(ws => { ws.close(1000, 'Server restarting'); });
            wss.close(() => {
                log.info('Servidor WebSocket fechado para reinício');
                process.exit(0);
            });
        }, 500);

    } else if (path === '/api/server/clear-cache' && req.method === 'POST') {
        try {
            locationCache.clearAll();
            log.info('Cache de localização limpo via API');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Cache limpo com sucesso' }));
        } catch (err) {
            log.error('Erro ao limpar cache', { error: err.message });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        
    } else if (req.method === 'GET' && path === '/api/restrictions') {
        // Retorna restrições salvas (global + per-device)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            global: globalRestrictions,
            perDevice: perDeviceRestrictions
        }));

    } else if (req.method === 'POST' && path === '/api/devices/send-restrictions') {
        // Enviar restrições para dispositivos (todos, por grupo, ou selecionados) - SALVA E APLICA
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { restrictions, targetDeviceIds } = JSON.parse(body);
                if (!restrictions || typeof restrictions !== 'object') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'restrictions é obrigatório' }));
                    return;
                }

                // Salvar restrições para persistência e auto-aplicar em reconexões
                if (Array.isArray(targetDeviceIds) && targetDeviceIds.length > 0) {
                    for (const did of targetDeviceIds) {
                        perDeviceRestrictions[did] = restrictions;
                    }
                    log.info('Restrições salvas para dispositivos específicos', { count: targetDeviceIds.length });
                } else {
                    globalRestrictions = restrictions;
                    perDeviceRestrictions = {};
                    log.info('Restrições globais salvas');
                }
                saveRestrictionsToFile();

                // Persistir restrições no banco de dados
                try {
                    if (Array.isArray(targetDeviceIds) && targetDeviceIds.length > 0) {
                        for (const did of targetDeviceIds) {
                            await query(
                                `INSERT INTO device_restrictions (device_id, restrictions, is_global, updated_at)
                                 VALUES ($1, $2, false, NOW())
                                 ON CONFLICT (device_id) DO UPDATE SET restrictions = $2, is_global = false, updated_at = NOW()`,
                                [did, JSON.stringify(restrictions)]
                            );
                        }
                        log.info('Restrições per-device salvas no banco', { count: targetDeviceIds.length });
                    } else {
                        await query(
                            `INSERT INTO device_restrictions (device_id, restrictions, is_global, updated_at)
                             VALUES ('__global__', $1, true, NOW())
                             ON CONFLICT (device_id) DO UPDATE SET restrictions = $1, is_global = true, updated_at = NOW()`,
                            [JSON.stringify(restrictions)]
                        );
                        // Limpar restrições per-device do banco quando aplicando global
                        await query(`DELETE FROM device_restrictions WHERE device_id != '__global__'`);
                        log.info('Restrições globais salvas no banco');
                    }
                } catch (dbErr) {
                    log.error('Erro ao salvar restrições no banco', { error: dbErr.message });
                }

                // Determinar quais dispositivos enviar
                let targetEntries;
                if (Array.isArray(targetDeviceIds) && targetDeviceIds.length > 0) {
                    targetEntries = targetDeviceIds.map(did => [did, connectedDevices.get(did)]).filter(([, ws]) => ws);
                } else {
                    targetEntries = Array.from(connectedDevices.entries());
                }

                let sent = 0;
                for (const [deviceId, deviceWs] of targetEntries) {
                    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
                        try {
                            deviceWs.send(JSON.stringify({
                                type: 'set_device_restrictions',
                                data: restrictions,
                                timestamp: Date.now()
                            }));
                            sent++;
                        } catch (e) {
                            log.error('Erro ao enviar restrições', { deviceId, error: e.message });
                        }
                    }
                }
                // ═══ Audit log: restrições aplicadas via API ═══
                for (const [did] of targetEntries) {
                    const targetDevice = persistentDevices.get(did);
                    logAudit('restriction_changed', 'device', did, targetDevice?.name || did, {
                        restrictions, source: 'http_api'
                    });
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, sent, total: targetEntries.length, saved: true }));
            } catch (error) {
                log.error('Erro ao enviar restrições', { error: error.message });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });

    } else if (path.startsWith('/api/devices/') && req.method === 'POST') {
        // Endpoints para comandos de dispositivos
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const pathParts = path.split('/').filter(Boolean);
                const deviceId = pathParts[pathParts.indexOf('devices') + 1];
                
                if (path.includes('/restrictions/apply')) {
                    handleApplyRestrictions({ deviceId, restrictions: data.restrictions }, { connectionId: 'http_api' });
                } else if (path.includes('/restrictions/remove')) {
                    handleRemoveRestrictions({ deviceId }, { connectionId: 'http_api' });
                } else if (path.includes('/lock')) {
                    handleLockDevice({ connectionId: 'http_api' }, { deviceId: deviceId });
                } else if (path.includes('/unlock')) {
                    handleUnlockDevice({ connectionId: 'http_api' }, { deviceId: deviceId });
                } else if (path.includes('/start-alarm')) {
                    const result = handleStartAlarm({ connectionId: 'http_api' }, { deviceId: deviceId });
                    res.writeHead(result?.success ? 200 : 400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result?.success ? { success: true, message: 'Alarme iniciado' } : { success: false, error: result?.error || 'Dispositivo não conectado' }));
                    return;
                } else if (path.includes('/stop-alarm')) {
                    const result = handleStopAlarm({ connectionId: 'http_api' }, { deviceId: deviceId });
                    res.writeHead(result?.success ? 200 : 400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result?.success ? { success: true, message: 'Alarme parado' } : { success: false, error: result?.error || 'Dispositivo não conectado' }));
                    return;
                } else if (path.includes('/wake-device')) {
                    const result = handleWakeDevice({ connectionId: 'http_api' }, { deviceId: deviceId });
                    res.writeHead(result?.success ? 200 : 400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result?.success ? { success: true, message: 'Comando enviado' } : { success: false, error: result?.error || 'Dispositivo não conectado' }));
                    return;
                } else if (path.includes('/reboot')) {
                    handleRebootDevice({ connectionId: 'http_api' }, { deviceId: deviceId });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Comando de reinicialização enviado' }));
                    return;
                } else if (path.includes('/delete')) {
                    await handleDeleteDevice({ deviceId }, { connectionId: 'http_api' });
                } else if (path.includes('/app-permissions')) {
                    // Aplicar permissões de apps (modo kiosk)
                    const allowedApps = Array.isArray(data.allowedApps) ? data.allowedApps : [];
                    if (deviceId === 'all') {
                        const deviceIds = Array.from(connectedDevices.keys());
                        if (deviceIds.length > 0) {
                            deviceIds.forEach(id => applyAppPermissionsToDevice(id, allowedApps));
                            pendingKioskAppsForAll = null;
                        } else {
                            // Nenhum dispositivo conectado - guardar para aplicar quando conectar
                            pendingKioskAppsForAll = allowedApps;
                            log.info('Permissões kiosk pendentes (dispositivo conectará depois)', { allowedAppsCount: allowedApps.length });
                        }
                    } else {
                        applyAppPermissionsToDevice(deviceId, allowedApps);
                    }
                } else if (path.includes('/update-info')) {
                    // Atualizar campos manuais do dispositivo (NF, data de compra)
                    // purchaseDate só pode ser definida UMA vez (não permite sobrescrever)
                    const existing = await query('SELECT nf_key, purchase_date FROM devices WHERE device_id = $1', [deviceId]);
                    const existingRow = existing.rows[0] || {};
                    const updates = [];
                    const values = [];
                    let paramIdx = 1;
                    if (data.nfKey !== undefined) {
                        updates.push(`nf_key = $${paramIdx++}`);
                        values.push(data.nfKey || null);
                    }
                    if (data.purchaseDate !== undefined && !existingRow.purchase_date) {
                        updates.push(`purchase_date = $${paramIdx++}`);
                        values.push(data.purchaseDate || null);
                    }
                    if (updates.length > 0) {
                        values.push(deviceId);
                        await query(`UPDATE devices SET ${updates.join(', ')}, updated_at = NOW() WHERE device_id = $${paramIdx}`, values);
                        // Atualizar no cache em memória
                        const cached = persistentDevices.get(deviceId);
                        if (cached) {
                            if (data.nfKey !== undefined) cached.nfKey = data.nfKey || null;
                            if (data.purchaseDate !== undefined) cached.purchaseDate = data.purchaseDate || null;
                            persistentDevices.set(deviceId, cached);
                        }
                        log.info('Info do dispositivo atualizada', { deviceId, nfKey: data.nfKey, purchaseDate: data.purchaseDate });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Informações atualizadas' }));
                    return;
                } else if (path.includes('/apply-policies')) {
                    // Aplicar políticas: desabilitar bloqueio, bloquear Settings, restringir Quick Settings
                    const applyPoliciesMessage = { type: 'apply_device_policies', timestamp: Date.now() };
                    const targetIds = deviceId === 'all' ? Array.from(connectedDevices.keys()) : [deviceId];
                    let sentCount = 0;
                    for (const id of targetIds) {
                        const deviceWs = connectedDevices.get(id);
                        if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
                            deviceWs.send(JSON.stringify(applyPoliciesMessage));
                            sentCount++;
                            log.info('Comando apply_device_policies enviado', { deviceId: id });
                        }
                    }
                    if (sentCount === 0) {
                        log.warn('Nenhum dispositivo conectado para aplicar políticas', { deviceId });
                    }
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Comando enviado com sucesso' }));
                
            } catch (error) {
                log.error('Erro ao processar requisição HTTP', { error: error.message });
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        
    } else if (req.method === 'POST' && path.startsWith('/api/groups/') && path.includes('/apply-policies')) {
        // Rota para aplicar políticas de apps a dispositivos do grupo
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            let groupId = null;
            try {
                // Extrair groupId do path: /api/groups/{groupId}/apply-policies
                const pathMatch = path.match(/\/api\/groups\/([^\/]+)\/apply-policies/);
                if (!pathMatch || !pathMatch[1]) {
                    log.error('Erro ao extrair groupId do path', { path });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Formato de URL inválido' }));
                    return;
                }
                
                groupId = pathMatch[1];
                let parsedBody;
                try {
                    parsedBody = JSON.parse(body);
                } catch (parseError) {
                    log.error('Erro ao fazer parse do body', { error: parseError.message, body });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'JSON inválido' }));
                    return;
                }
                
                const { allowedApps } = parsedBody;
                
                if (!groupId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'ID do grupo é obrigatório' }));
                    return;
                }
                
                if (!Array.isArray(allowedApps)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'allowedApps deve ser um array' }));
                    return;
                }
                
                log.info('Aplicando política de grupo', { groupId, allowedAppsCount: allowedApps.length });
                
                // Buscar dispositivos do grupo
                const devices = await DeviceGroupModel.getGroupDevices(groupId);
                log.info('Dispositivos encontrados no grupo', { groupId, devicesCount: devices.length });
                
                const deviceIds = devices.map((d) => {
                    // Tentar device_id primeiro, depois deviceId, depois serial_number como fallback
                    const deviceId = d.device_id || d.deviceId || d.serial_number;
                    if (!deviceId) {
                        log.warn('Dispositivo sem device_id/serial_number encontrado', { 
                            device: {
                                id: d.id,
                                name: d.name,
                                device_id: d.device_id,
                                serial_number: d.serial_number
                            }
                        });
                    }
                    return deviceId;
                }).filter(Boolean);
                
                log.info('Device IDs extraídos', { groupId, deviceIds });
                
                if (deviceIds.length === 0) {
                    log.warn('Nenhum dispositivo encontrado no grupo', { groupId });
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Nenhum dispositivo no grupo' }));
                    return;
                }
                
                // ✅ LÓGICA CORRIGIDA: Apps individuais têm prioridade ABSOLUTA sobre política de grupo
                // Para identificar apps individuais: apps que estão no dispositivo mas NÃO estão em NENHUMA política de grupo
                // IMPORTANTE: Precisamos buscar a política ANTES de aplicar, para identificar corretamente os individuais
                
                // Buscar política ATUAL do grupo (ANTES da atualização que vai acontecer no frontend)
                // Isso nos permite identificar quais apps eram da política e quais são individuais
                let currentGroupPolicyApps = [];
                try {
                    const currentPoliciesResult = await query(`
                        SELECT package_name FROM app_policies WHERE group_id = $1
                    `, [groupId]);
                    currentGroupPolicyApps = currentPoliciesResult.rows.map((r) => r.package_name);
                    log.info('Política atual do grupo (antes da atualização)', { groupId, policyApps: currentGroupPolicyApps });
                } catch (error) {
                    log.warn('Erro ao buscar política atual do grupo, continuando...', { error: error.message });
                }
                
                const results = [];
                for (const deviceId of deviceIds) {
                    const deviceWs = connectedDevices.get(deviceId);
                    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
                        try {
                            // Buscar estado ATUAL do dispositivo
                            const device = persistentDevices.get(deviceId);
                            const currentAllowedApps = device && device.allowedApps ? [...device.allowedApps] : [];
                            
                            // ✅ OBTER APPS INDIVIDUAIS diretamente do dispositivo
                            // Estes apps foram marcados como individuais quando salvos via DeviceModal
                            const individualApps = device && device.individualApps ? [...device.individualApps] : [];
                            
                            log.info('Apps individuais do dispositivo', { 
                                deviceId, 
                                individualAppsCount: individualApps.length,
                                individualApps: individualApps 
                            });
                            
                            // Apps da política de grupo: apenas os selecionados agora (que não estão individuais)
                            // Se um app está individual E na política, o individual prevalece (será ignorado da política)
                            const groupAppsToApply = allowedApps.filter(app => !individualApps.includes(app));
                            
                            // ✅ RESULTADO FINAL: 
                            // - Apps individuais (prioritários - SEMPRE preservados, mesmo se removidos da política)
                            // - Apps da política nova (que não são individuais)
                            const finalAllowedApps = [...new Set([...individualApps, ...groupAppsToApply])];
                            
                            const message = {
                                type: 'update_app_permissions',
                                data: {
                                    allowedApps: finalAllowedApps // Apps individuais (sempre preservados) + apps da política (não individuais)
                                },
                                timestamp: Date.now()
                            };
                            deviceWs.send(JSON.stringify(message));

                            // Persistir allowedApps no dispositivo para reenvio na reconexão
                            if (device) {
                                device.allowedApps = finalAllowedApps;
                                persistentDevices.set(deviceId, device);
                                saveDeviceToDatabase(device);
                            }

                            results.push({ success: true, deviceId });
                            log.info(`Política de grupo aplicada (apps individuais preservados)`, { 
                                deviceId, 
                                currentAllowedAppsCount: currentAllowedApps.length,
                                currentAllowedApps: currentAllowedApps,
                                individualAppsCount: individualApps.length,
                                individualApps: individualApps,
                                currentGroupPolicyApps: currentGroupPolicyApps,
                                otherGroupsPolicyAppsCount: otherGroupsPolicyApps.length,
                                newPolicyApps: allowedApps,
                                groupAppsSelected: allowedApps.length,
                                groupAppsIgnored: allowedApps.filter(app => individualApps.includes(app)).length,
                                groupAppsApplied: groupAppsToApply.length,
                                totalAppsCount: finalAllowedApps.length,
                                finalAllowedApps: finalAllowedApps
                            });
                        } catch (error) {
                            results.push({ success: false, deviceId, reason: error.message });
                            log.error(`Erro ao enviar política para dispositivo`, { deviceId, error: error.message });
                        }
                    } else {
                        results.push({ success: false, deviceId, reason: 'Dispositivo não está online' });
                    }
                }
                
                const successCount = results.filter((r) => r.success).length;
                const failedCount = results.length - successCount;
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: {
                        total: deviceIds.length,
                        success: successCount,
                        failed: failedCount,
                        results: results
                    }
                }));
                
            } catch (error) {
                log.error('Erro ao aplicar políticas', { 
                    error: error.message, 
                    stack: error.stack,
                    path: path,
                    groupId: groupId || 'não extraído'
                });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: error.message || 'Erro desconhecido ao aplicar políticas',
                    detail: error.stack
                }));
            }
        });
        
    } else if (req.method === 'POST' && path.startsWith('/api/groups/') && path.includes('/send-restrictions')) {
        // Rota para enviar restrições de dispositivo para todos os dispositivos do grupo
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const pathMatch = path.match(/\/api\/groups\/([^\/]+)\/send-restrictions/);
                if (!pathMatch || !pathMatch[1]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Formato de URL inválido' }));
                    return;
                }
                const groupId = pathMatch[1];
                const { restrictions } = JSON.parse(body);

                if (!restrictions || typeof restrictions !== 'object') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'restrictions é obrigatório' }));
                    return;
                }

                log.info('Enviando restrições para grupo', { groupId, restrictions });

                // Buscar dispositivos do grupo
                const devices = await DeviceGroupModel.getGroupDevices(groupId);
                const deviceIds = devices.map(d => d.device_id || d.deviceId || d.serial_number).filter(Boolean);

                let sent = 0;
                for (const deviceId of deviceIds) {
                    const deviceWs = connectedDevices.get(deviceId);
                    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
                        try {
                            deviceWs.send(JSON.stringify({
                                type: 'set_device_restrictions',
                                data: restrictions,
                                timestamp: Date.now()
                            }));
                            sent++;
                            log.info('Restrições enviadas para dispositivo', { deviceId });
                        } catch (e) {
                            log.error('Erro ao enviar restrições', { deviceId, error: e.message });
                        }
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, sent, total: deviceIds.length }));
            } catch (error) {
                log.error('Erro ao enviar restrições', { error: error.message });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });

    // Rota para buscar histórico de localização de um dispositivo
    } else if (req.method === 'GET' && req.url && req.url.startsWith('/api/devices/') && req.url.endsWith('/location-history')) {
        const match = req.url.match(/^\/api\/devices\/([^/]+)\/location-history/);
        if (match) {
            const deviceId = decodeURIComponent(match[1]);
            try {
                // Buscar device UUID pelo deviceId string
                const deviceResult = await query(`SELECT id FROM devices WHERE device_id = $1 LIMIT 1`, [deviceId]);
                if (deviceResult.rows.length === 0) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Dispositivo não encontrado' }));
                    return;
                }
                const dbId = deviceResult.rows[0].id;
                const locationResult = await query(`
                    SELECT latitude, longitude, created_at
                    FROM device_locations
                    WHERE device_id = $1
                    ORDER BY created_at DESC
                    LIMIT 200
                `, [dbId]);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, locations: locationResult.rows }));
            } catch (error) {
                log.error('Erro ao buscar histórico de localização', { error: error.message });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'URL inválida' }));
        }

    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
    }
});

const wss = new WebSocket.Server({
    server: server, // Usar o mesmo servidor HTTP
    perMessageDeflate: false, // Desabilitar compressão para melhor performance
    maxPayload: 16 * 1024 * 1024, // 16MB max payload (device_status com installedApps pode ser grande)
    handshakeTimeout: 10000, // 10 segundos timeout
    keepAlive: true,
    keepAliveInitialDelay: 30000 // 30 segundos
});

// Armazenar dispositivos conectados
const connectedDevices = new Map();
const webClients = new Set();

// Armazenar dispositivos persistentes (mesmo quando desconectados)
const persistentDevices = new Map();
// Mantém IDs de dispositivos explicitamente deletados pela UI.
// Esses dispositivos não devem aparecer na lista enviada para clientes web
// até que se reconectem (quando removeremos o ID desta lista).
const deletedDeviceIds = new Set();

// Garante coluna de soft-delete e tabela de dispositivos deletados permanentemente
async function ensureDeletedDevicesSchema() {
    try {
        await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
        await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS nf_key VARCHAR(255);`);
        await query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS purchase_date DATE;`);
        // Tabela persistente para bloquear reconexão de dispositivos deletados
        await query(`
            CREATE TABLE IF NOT EXISTS deleted_devices (
                device_id VARCHAR(255) PRIMARY KEY,
                deleted_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Schema de deleção verificado/criado');
        // Limpar tabela de deletados ao iniciar — dispositivos devem sempre poder reconectar após restart
        await query(`DELETE FROM deleted_devices`).catch(() => {});
        console.log('✅ Lista de dispositivos deletados limpa (restart limpo)');
    } catch (e) {
        console.error('❌ Falha ao garantir schema de deleção:', e.message);
    }
}

// Executa verificação de schema assim que o módulo carrega
ensureDeletedDevicesSchema();

// Rastrear pings pendentes para validação de pong
const pendingPings = new Map(); // deviceId -> { timestamp, timeoutId }

// Permissões pendentes quando deploy "all" roda sem dispositivos conectados
let pendingKioskAppsForAll = null;

// Senha de administrador global
let globalAdminPassword = '';

// Restrições globais (aplicadas a todos por padrão) e por dispositivo
let globalRestrictions = null;
let perDeviceRestrictions = {}; // { deviceId: { ...restrictions } }

// Arquivo para persistência
const DEVICES_FILE = path.join(__dirname, 'devices.json');
const ADMIN_PASSWORD_FILE = path.join(__dirname, 'admin_password.json');
const RESTRICTIONS_FILE = path.join(__dirname, 'restrictions.json');
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
const locationCache = new LocationCache(
    parseInt(process.env.LOCATION_CACHE_SIZE) || 1000
);
const deviceSaveQueue = new BatchQueue(
    parseInt(process.env.BATCH_SIZE) || 10,
    parseInt(process.env.BATCH_INTERVAL) || 1000
); // Batch configurável via variáveis de ambiente

// Log de inicialização das otimizações
logger.info('Sistemas de otimização inicializados', {
    logLevel: config.LOG_LEVEL,
    maxPingsPerMinute: config.MAX_PINGS_PER_MINUTE,
    adaptiveTimeoutEnabled: true,
    healthMonitoringEnabled: true,
    heartbeatInterval: config.HEARTBEAT_INTERVAL,
    batchQueueEnabled: true,
    locationCacheEnabled: true
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
        
        // Carregar última localização de cada dispositivo para cache
        const deviceIds = devices.map(d => d.id).filter(Boolean);
        if (deviceIds.length > 0) {
            try {
                const locationResult = await query(`
                    SELECT DISTINCT ON (device_id)
                        device_id, latitude, longitude, accuracy, provider, address, created_at
                    FROM device_locations
                    WHERE device_id = ANY($1::uuid[])
                    ORDER BY device_id, created_at DESC
                `, [deviceIds]);

                // Construir mapa de id interno → última localização
                const locationMap = new Map();
                locationResult.rows.forEach(row => {
                    locationCache.set(row.device_id, row.latitude, row.longitude, row.created_at);
                    locationMap.set(row.device_id, row);
                });

                log.debug('Cache de localização inicializado', {
                    locationsLoaded: locationResult.rows.length
                });

                // Injetar última localização nos devices para que offline apareçam no mapa
                devices.forEach(device => {
                    const loc = locationMap.get(device.id);
                    if (loc) {
                        device.latitude = parseFloat(loc.latitude);
                        device.longitude = parseFloat(loc.longitude);
                        device.locationAccuracy = loc.accuracy ? parseFloat(loc.accuracy) : null;
                        device.locationProvider = loc.provider || null;
                        device.address = loc.address || device.address || null;
                        device.lastLocationUpdate = loc.created_at;
                    }
                });
            } catch (error) {
                log.warn('Erro ao carregar cache de localização (não crítico)', { error: error.message });
            }
        }

        // Converter array para Map para compatibilidade
        devices.forEach(device => {
            if (!device.deviceId || device.deviceId === 'null' || device.deviceId === 'undefined') {
                log.warn('DeviceId inválido encontrado', { deviceId: device.deviceId });
                return; // Pular dispositivos com deviceId inválido
            }

            persistentDevices.set(device.deviceId, device);
        });
        
        log.info(`Dispositivos carregados do PostgreSQL`, { 
            count: devices.length,
            locationCacheSize: locationCache.getSize()
        });
    } catch (error) {
        log.error('Erro ao carregar dispositivos do PostgreSQL', error);
    }
}

// Função direta de save (usada pelo batch queue)
async function saveDeviceToDatabaseDirect(deviceData) {
    try {
        const result = await DeviceModel.upsert(deviceData);
        log.debug(`Dispositivo salvo no PostgreSQL`, { deviceId: deviceData.deviceId });
        
        // ✅ Salvar localização na tabela device_locations se disponível
        // Usar cache para evitar query SELECT antes de cada INSERT
        if (deviceData.latitude && deviceData.longitude && result && result.id) {
            try {
                // Verificar no cache se deve salvar (evita query SELECT)
                const shouldSave = locationCache.shouldSave(result.id, deviceData.latitude, deviceData.longitude);
                
                if (shouldSave) {
                    await query(`
                        INSERT INTO device_locations (
                            device_id, 
                            latitude, 
                            longitude, 
                            accuracy, 
                            provider, 
                            address,
                            created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    `, [
                        result.id,
                        deviceData.latitude,
                        deviceData.longitude,
                        deviceData.locationAccuracy || null,
                        deviceData.locationProvider || 'unknown',
                        deviceData.address || deviceData.lastKnownLocation || null
                    ]);
                    
                    // Atualizar cache após salvar
                    locationCache.updateAfterSave(result.id, deviceData.latitude, deviceData.longitude);
                    log.debug(`Localização salva para dispositivo`, { deviceId: deviceData.deviceId });
                }
            } catch (locationError) {
                // Não falhar se houver erro ao salvar localização (não crítico)
                log.warn('Erro ao salvar localização (não crítico)', { 
                    deviceId: deviceData.deviceId,
                    error: locationError.message 
                });
            }
        }
        
        return result;
    } catch (error) {
        log.error('Erro ao salvar dispositivo no PostgreSQL', { 
            deviceId: deviceData.deviceId, 
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Função pública que usa batch queue (otimizada)
async function saveDeviceToDatabase(deviceData) {
    try {
        // Usar batch queue para agrupar saves e reduzir queries
        return await deviceSaveQueue.add(deviceData.deviceId, deviceData);
    } catch (error) {
        // Se batch queue falhar, tentar save direto como fallback
        log.warn('Erro no batch queue, tentando save direto', { 
            deviceId: deviceData.deviceId,
            error: error.message 
        });
        return await saveDeviceToDatabaseDirect(deviceData);
    }
}

// Configurar função de save no batch queue (após definir as funções)
deviceSaveQueue.setSaveFunction(async (deviceData) => {
    return await saveDeviceToDatabaseDirect(deviceData);
});

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

function loadRestrictionsFromFile() {
    try {
        if (fs.existsSync(RESTRICTIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(RESTRICTIONS_FILE, 'utf8'));
            globalRestrictions = data.global || null;
            perDeviceRestrictions = data.perDevice || {};
            log.info('Restrições carregadas do arquivo', {
                hasGlobal: !!globalRestrictions,
                perDeviceCount: Object.keys(perDeviceRestrictions).length
            });
        }
    } catch (error) {
        log.error('Erro ao carregar restrições do arquivo', error);
    }
}

function saveRestrictionsToFile() {
    try {
        fs.writeFileSync(RESTRICTIONS_FILE, JSON.stringify({
            global: globalRestrictions,
            perDevice: perDeviceRestrictions,
            updatedAt: new Date().toISOString()
        }, null, 2));
        log.debug('Restrições salvas no arquivo');
    } catch (error) {
        log.error('Erro ao salvar restrições no arquivo', error);
    }
}

// Retorna as restrições aplicáveis a um dispositivo (per-device > global)
function getRestrictionsForDevice(deviceId) {
    if (perDeviceRestrictions[deviceId]) return perDeviceRestrictions[deviceId];
    if (globalRestrictions) return globalRestrictions;
    return null;
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

// Carregar restrições salvas na inicialização
loadRestrictionsFromFile();

// Restrições do banco são carregadas dentro de ensureAdminUsersSchema() (após criar tabela)

// Limpar dados existentes com valores null
cleanInstalledAppsData();

// Verificação periódica de compliance de dispositivos (a cada 5 minutos)
setInterval(async () => {
    const now = Date.now();
    for (const [deviceId, device] of connectedDevices.entries()) {
        const lastSeen = device.lastHeartbeat || device.connectedAt || 0;
        const offlineMinutes = (now - lastSeen) / 60000;
        // If device has been offline for more than 2 hours, log compliance violation
        if (offlineMinutes > 120 && !device.isOnline) {
            try {
                await query(
                    `INSERT INTO audit_logs (action, target_type, target_id, target_name, details)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT DO NOTHING`,
                    ['compliance_violation', 'device', deviceId, device.deviceName || deviceId,
                     JSON.stringify({ reason: 'offline_exceeded', minutes: Math.round(offlineMinutes) })]
                );
            } catch (e) {
                // Silencioso - não interromper o loop
            }
        }
    }
}, 5 * 60 * 1000);

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
            
            // Não logar mensagens desktop_frame (são muitas e poluem o log)
            if (data.type !== 'desktop_frame') {
                log.debug(`Mensagem recebida`, {
                    connectionId: ws.connectionId,
                    type: data.type,
                    size: message.length
                });
            }
            
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

    // Detectar quando um computador conecta (antes de receber mensagens)
    // Isso será atualizado quando recebermos a primeira mensagem 'computer_status'
    // Mas podemos marcar como online quando detectarmos que é um computador
    
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
        
        // Remover computador se for um computador (UEM)
        if (ws.isComputer && ws.computerId) {
            connectedComputers.delete(ws.computerId);
            log.info('Computador desconectado', { computerId: ws.computerId });
            
            // Atualizar status no banco
            ComputerModel.updateStatus(ws.computerId, 'offline').catch(err => {
                console.error('Erro ao atualizar status do computador:', err);
            });
            
            // Notificar clientes web sobre desconexão do computador
            notifyWebClients({
                type: 'computer_disconnected',
                computerId: ws.computerId,
                reason: 'Connection closed',
                timestamp: Date.now()
            });
        }
        
        // Remover dispositivo se for um dispositivo Android (não computador)
        for (const [deviceId, deviceWs] of connectedDevices.entries()) {
            if (deviceWs === ws && !ws.isComputer) {
                connectedDevices.delete(deviceId);
                
                // Atualizar status para offline no armazenamento persistente
                if (persistentDevices.has(deviceId)) {
                    const updatedDevice = {
                        ...persistentDevices.get(deviceId),
                        status: 'offline',
                        lastSeen: Date.now()
                    };
                    persistentDevices.set(deviceId, updatedDevice);
                    
                    // SALVAR NO BANCO para manter consistência
                    saveDeviceToDatabase(updatedDevice);
                }
                
                log.info(`Dispositivo desconectado`, { deviceId });

                // ═══ Alertas automáticos: dispositivo offline + audit log ═══
                const offlineDeviceName = persistentDevices.get(deviceId)?.name || 'Dispositivo Desconhecido';
                createOfflineAlert(deviceId, offlineDeviceName);
                logAudit('device_disconnected', 'device', deviceId, offlineDeviceName, {
                    reason: reason?.toString() || 'websocket_closed',
                    code
                });

                // Limpar dados sensíveis quando desconectado
                if (persistentDevices.has(deviceId)) {
                    const device = persistentDevices.get(deviceId);
                    const cleanedDevice = {
                        ...device,
                        status: 'offline',
                        lastSeen: Date.now(),
                        // Limpar dados sensíveis - manter apenas identificação básica
                        // IMPORTANTE: Preservar name, model, manufacturer para identificação
                        batteryLevel: 0,
                        storageTotal: 0,
                        storageUsed: 0,
                        installedAppsCount: 0,
                        allowedApps: [],
                        isCharging: false
                    };
                    persistentDevices.set(deviceId, cleanedDevice);
                    
                    // SALVAR NO BANCO para manter consistência
                    saveDeviceToDatabase(cleanedDevice);
                    
                    log.info('Dados limpos para dispositivo offline e salvos no banco', { deviceId });
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
        ws.lastPongReceived = Date.now();
        log.debug('Pong recebido', { connectionId: ws.connectionId });
        
        // Limpar ping pendente se existir
        if (ws.deviceId && pendingPings.has(ws.deviceId)) {
            const pingData = pendingPings.get(ws.deviceId);
            if (pingData.timeoutId) {
                clearTimeout(pingData.timeoutId);
            }
            pendingPings.delete(ws.deviceId);
            log.debug('Ping pendente limpo após receber pong', { deviceId: ws.deviceId });
        }
        
        // Cancelar timeout de inatividade e reconfigurar
        if (ws.inactivityTimeout) {
            clearTimeout(ws.inactivityTimeout);
        }
        ws.inactivityTimeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                log.warn('Fechando conexão inativa após pong', { connectionId: ws.connectionId });
                ws.close(1000, 'Inactive connection');
            }
        }, config.MAX_INACTIVITY_TIMEOUT); // Usar configuração
    });

    // Identificar tipo de cliente
    ws.isDevice = false;
    ws.isWebClient = false;
    ws.isComputer = false;
    
    // Configurar timeout para conexões inativas - mais longo para dispositivos
    ws.inactivityTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            log.warn('Fechando conexão inativa', { connectionId: ws.connectionId });
            ws.close(1000, 'Inactive connection');
        }
    }, 10 * 60 * 1000); // 10 minutos - mais tempo para dispositivos
});

async function handleMessage(ws, data) {
    // Não logar mensagens desktop_frame (são muitas e poluem o log)
    if (data.type !== 'desktop_frame') {
        // Log apenas para tipos de mensagem importantes (não frames)
        // Log especial para uem_remote_action para debug
        if (data.type === 'uem_remote_action') {
            console.log(`📨 Mensagem uem_remote_action recebida no servidor:`, {
                action: data.action,
                computerId: data.computerId,
                isWebClient: ws.isWebClient,
                isComputer: ws.isComputer,
                connectionId: ws.connectionId
            });
        }
        // Log para register_desktop_session para debug
        if (data.type === 'register_desktop_session') {
            console.log(`📥 Mensagem register_desktop_session recebida no handleMessage:`, {
                sessionId: data.sessionId,
                computerId: data.computerId,
                isWebClient: ws.isWebClient,
                isComputer: ws.isComputer,
                connectionId: ws.connectionId
            });
        }
    }
    
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
        case 'request_devices_list':
            // Cliente web solicita lista atualizada (útil quando celular conecta depois)
            if (ws.isWebClient) {
                handleWebClient(ws, data);
            }
            break;
        case 'delete_device':
            await handleDeleteDevice(ws, data);
            break;
        case 'update_app_permissions':
            handleUpdateAppPermissions(ws, data);
            break;
        case 'install_app':
            handleInstallApp(ws, data);
            break;
        case 'location_update':
            handleLocationUpdate(ws, data);
            break;
        case 'app_usage':
            handleAppUsage(ws, data);
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
        case 'start_alarm':
            handleStartAlarm(ws, data);
            break;
        case 'stop_alarm':
            handleStopAlarm(ws, data);
            break;
        case 'wake_device':
            handleWakeDevice(ws, data);
            break;
        case 'format_device':
            handleFormatDevice(ws, data);
            break;
        case 'notification_received':
            handleNotificationReceived(ws, data);
            break;
        case 'lock_device_confirmed':
            notifyWebClients({
                type: 'lock_device_result',
                success: data.success !== false,
                deviceId: data.deviceId,
                message: data.success ? 'Dispositivo bloqueado com sucesso!' : (data.reason || 'Falha ao bloquear')
            });
            break;
        case 'alarm_confirmed':
            notifyWebClients({
                type: 'alarm_device_result',
                success: true,
                deviceId: data.deviceId,
                action: 'start',
                message: 'Alarme iniciado no dispositivo'
            });
            break;
        case 'alarm_stopped':
            notifyWebClients({
                type: 'alarm_device_result',
                success: true,
                deviceId: data.deviceId,
                action: 'stop',
                message: 'Alarme parado no dispositivo'
            });
            break;
        case 'reboot_device_confirmed':
            notifyWebClients({
                type: 'reboot_device_result',
                success: data.success !== false,
                deviceId: data.deviceId,
                message: data.success ? 'Dispositivo reiniciando...' : (data.reason || 'Falha ao reiniciar')
            });
            break;
        case 'wake_device_confirmed':
            notifyWebClients({
                type: 'wake_device_result',
                success: data.success !== false,
                deviceId: data.deviceId,
                message: data.success ? 'Tela acordada' : (data.reason || 'Falha ao acordar')
            });
            break;
        case 'update_app_progress':
            notifyWebClients({
                type: 'update_app_progress',
                deviceId: data.deviceId,
                progress: data.progress || 0,
                status: data.status || '',
                timestamp: data.timestamp || Date.now()
            });
            break;
        case 'update_app_complete':
            notifyWebClients({
                type: 'update_app_complete',
                deviceId: data.deviceId,
                success: data.success !== false,
                timestamp: data.timestamp || Date.now()
            });
            break;
        case 'update_app_error':
            console.error('❌ UPDATE_APP_ERROR do dispositivo:', data.deviceId, '- Erro:', data.error);
            notifyWebClients({
                type: 'update_app_error',
                deviceId: data.deviceId,
                error: data.error || 'Erro desconhecido',
                timestamp: data.timestamp || Date.now()
            });
            break;
        case 'geofence_event':
            handleGeofenceEvent(ws, data);
            break;
        case 'reboot_device':
            handleRebootDevice(ws, data);
            break;
        case 'revert_device':
            handleRevertDevice(ws, data);
            break;
        case 'lock_device':
            handleLockDevice(ws, data);
            break;
        case 'unlock_device':
            handleUnlockDevice(ws, data);
            break;
        case 'set_admin_password':
            handleSetAdminPassword(ws, data);
            break;
        case 'get_admin_password':
            handleGetAdminPassword(ws, data);
            break;
        case 'support_message':
            handleSupportMessage(ws, data);
            break;
        case 'computer_status':
            handleComputerStatus(ws, data);
            break;
        case 'uem_remote_action':
            handleUEMRemoteAction(ws, data);
            break;
        case 'desktop_frame':
            handleDesktopFrame(ws, data);
            break;
        case 'register_desktop_session':
            handleRegisterDesktopSession(ws, data);
            break;
        case 'register_webrtc_session':
            handleRegisterWebRTCSession(ws, data);
            break;
        case 'webrtc_offer':
            handleWebRTCOffer(ws, data);
            break;
        case 'webrtc_answer':
            handleWebRTCAnswer(ws, data);
            break;
        case 'webrtc_ice_candidate':
            handleWebRTCIceCandidate(ws, data);
            break;
        default:
            // Mensagem desconhecida (silenciosamente ignorar)
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

async function handleDeviceStatus(ws, data) {
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
    // Se o dispositivo foi deletado, bloquear reconexão automática
    if (deletedDeviceIds.has(deviceId)) {
        console.log(`🚫 Dispositivo ${deviceId} foi deletado — bloqueando reconexão automática`);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'device_deleted_blocked',
                message: 'Este dispositivo foi removido do sistema'
            }));
            ws.close(1000, 'Device was deleted');
        }
        return;
    }
    
    // Marcar como dispositivo Android
    ws.isDevice = true;
    ws.deviceId = deviceId;
    
    console.log('Dispositivo marcado como Android:', ws.isDevice);
    console.log('DeviceId do WebSocket:', ws.deviceId);
    
    // Armazenar informações detalhadas do dispositivo
    ws.deviceInfo = data.data;
    
    // ✅ VERIFICAR SE DISPOSITIVO EXISTE NO BANCO (mesmo que deletado da memória)
    let dbDevice = null;
    let dbUserBinding = null;
    let userConflict = null; // Conflito: usuário vinculado em outro device_id
    
    try {
        const dbResult = await query(`
            SELECT 
                d.*,
                du.id as user_uuid,
                du.user_id,
                du.name as user_name,
                du.cpf as user_cpf
            FROM devices d
            LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
            WHERE d.device_id = $1
        `, [deviceId]);
        
        if (dbResult.rows.length > 0) {
            dbDevice = dbResult.rows[0];
            
            console.log(`📊 Dados do banco para ${deviceId}:`, {
                name: dbDevice.name,
                assigned_device_user_id: dbDevice.assigned_device_user_id,
                user_id: dbDevice.user_id,
                user_name: dbDevice.user_name
            });
            
            if (dbDevice.assigned_device_user_id) {
                dbUserBinding = {
                    assignedDeviceUserId: dbDevice.assigned_device_user_id,
                    assignedUserId: dbDevice.user_id,
                    assignedUserName: dbDevice.user_name || null,
                    assignedUserCpf: dbDevice.user_cpf
                };
                
                console.log(`✅✅✅ Dispositivo encontrado no banco com vínculo: ${dbUserBinding.assignedUserName} (${dbUserBinding.assignedUserId})`);
                console.log(`   UUID do vínculo: ${dbUserBinding.assignedDeviceUserId}`);
            } else {
                console.log(`⚪ Dispositivo existe no banco mas SEM vínculo de usuário`);
            }
            
            // ✅ VERIFICAR SE USUÁRIO ESTÁ VINCULADO EM OUTRO DISPOSITIVO (CONFLITO)
            if (dbDevice.assigned_device_user_id) {
                const conflictResult = await query(`
                    SELECT device_id, name 
                    FROM devices 
                    WHERE assigned_device_user_id = $1 
                    AND device_id != $2
                `, [dbDevice.assigned_device_user_id, deviceId]);
                
                if (conflictResult.rows.length > 0) {
                    userConflict = {
                        userId: dbUserBinding.assignedUserId,
                        userName: dbUserBinding.assignedUserName,
                        currentDeviceId: deviceId,
                        otherDevices: conflictResult.rows.map(r => ({
                            deviceId: r.device_id,
                            name: r.name
                        }))
                    };
                    
                    console.log(`⚠️ CONFLITO DETECTADO: Usuário ${dbUserBinding.assignedUserName} vinculado em outros dispositivos:`, 
                        userConflict.otherDevices.map(d => d.deviceId).join(', '));
                }
            }
            
            console.log(`✅ Dispositivo ${deviceId} encontrado no banco - carregando dados salvos`);
        } else {
            console.log(`⚪ Dispositivo ${deviceId} NÃO encontrado no banco - será criado novo registro`);
        }
    } catch (error) {
        log.error('Erro ao verificar dispositivo no banco', { deviceId, error: error.message });
    }
    
    // Verificar se dispositivo já existe na memória
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
    
    // ✅ PRESERVAR DADOS DO BANCO: Nome e vínculo de usuário
    let finalName = data.data.name;
    
    // Se existe no banco, usar nome do banco (pode ter sido alterado manualmente)
    if (dbDevice && dbDevice.name) {
        const isDefaultName = data.data.name === data.data.model || 
                             data.data.name === `${data.data.manufacturer} ${data.data.model}`;
        
        const isCustomNameInDb = dbDevice.name !== dbDevice.model && 
                                  dbDevice.name !== `${data.data.manufacturer} ${dbDevice.model}`;
        
        // Se banco tem nome personalizado e dispositivo envia nome padrão, preservar do banco
        if (isCustomNameInDb && isDefaultName) {
            console.log(`🛡️ PRESERVANDO NOME DO BANCO: "${dbDevice.name}"`);
            finalName = dbDevice.name;
        } else if (!isDefaultName) {
            // Dispositivo mudou nome → usar novo nome do dispositivo
            finalName = data.data.name;
        }
    } else if (existingDevice && existingDevice.name) {
        // Fallback: preservar da memória se não tem no banco
        const isCustomName = existingDevice.name !== existingDevice.model && 
                            existingDevice.name !== `${existingDevice.manufacturer} ${existingDevice.model}`;
        
        const receivedDefaultName = data.data.name === data.data.model || 
                                    data.data.name === `${data.data.manufacturer} ${data.data.model}`;
        
        if (isCustomName && receivedDefaultName) {
            console.log('🛡️ PRESERVANDO NOME PERSONALIZADO DA MEMÓRIA');
            finalName = existingDevice.name;
        }
    }
    
    // ✅ Obter IP público da rede (substituir IP privado do dispositivo)
    let publicIp = await getPublicIp();
    if (!publicIp) {
        // Se falhou, tentar usar IP público existente ou manter o privado como fallback
        publicIp = existingDevice?.publicIpAddress || null;
    }
    
    // ✅ Armazenar dispositivo persistente COM DADOS DO BANCO (vínculo de usuário)
    const deviceData = {
        ...data.data,
        name: finalName, // Usar nome preservado
        status: 'online',
        lastSeen: now,
        connectionId: ws.connectionId,
        connectedAt: ws.connectedAt,
        // ✅ SUBSTITUIR IP PRIVADO PELO IP PÚBLICO DA REDE
        ipAddress: publicIp || data.data.ipAddress, // IP público tem prioridade
        publicIpAddress: publicIp, // Armazenar separadamente também
        // ✅ PRESERVAR ENDEREÇO E LOCALIZAÇÃO
        // O endereço pode vir como 'address' ou 'lastKnownLocation' do Android
        address: data.data.address || data.data.lastKnownLocation || existingDevice?.address || null,
        latitude: data.data.latitude || existingDevice?.latitude || null,
        longitude: data.data.longitude || existingDevice?.longitude || null,
        locationAccuracy: data.data.locationAccuracy || existingDevice?.locationAccuracy || null,
        locationProvider: data.data.locationProvider || existingDevice?.locationProvider || null,
        lastLocationUpdate: data.data.lastLocationUpdate || existingDevice?.lastLocationUpdate || null,
        // Preservar lastKnownLocation também
        lastKnownLocation: data.data.lastKnownLocation || existingDevice?.lastKnownLocation || null,
        // ✅ INCLUIR VÍNCULO DE USUÁRIO DO BANCO (se existir)
        assignedDeviceUserId: dbUserBinding?.assignedDeviceUserId || null,
        assignedUserId: dbUserBinding?.assignedUserId || null,
        assignedUserName: dbUserBinding?.assignedUserName || null,
        assignedUserCpf: dbUserBinding?.assignedUserCpf || null,
        // ✅ PRESERVAR individualApps se existir no dispositivo existente (importante para rastreamento)
        ...(existingDevice && existingDevice.individualApps ? { individualApps: existingDevice.individualApps } : {})
    };
    
    // Log apenas se endereço for recebido (para monitoramento)
    if (deviceData.address) {
        console.log(`📍 Endereço recebido do dispositivo ${deviceId}: ${deviceData.address.substring(0, 50)}...`);
    }
    
    // Verificar se o nome mudou (sempre, não apenas em reconexões)
    const nameChanged = existingDevice && existingDevice.name !== finalName;
    
    if (nameChanged) {
        log.info('Nome do dispositivo mudou durante atualização de status', {
            deviceId,
            oldName: existingDevice.name,
            newName: finalName
        });
    }
    
    // ✅ Log para debug: verificar se individualApps foi preservado
    if (existingDevice && existingDevice.individualApps) {
        log.debug('Apps individuais preservados na reconexão', { 
            deviceId, 
            individualAppsCount: existingDevice.individualApps.length
        });
    }
    
persistentDevices.set(deviceId, deviceData);
    
    // ✅ SALVAR NO POSTGRESQL via batch queue (otimizado)
    try {
        await saveDeviceToDatabase(deviceData);
        log.debug('Dispositivo adicionado à fila de save', { deviceId });
    } catch (error) {
        log.error('Erro ao adicionar dispositivo à fila de save', { 
            deviceId, 
            error: error.message 
        });
    }
    
    // ✅ NOVO: Registrar status online no histórico
    try {
        await DeviceStatusHistory.recordStatus(deviceId, 'online');
        console.log('✅ Status online registrado no histórico');
    } catch (error) {
        console.error('❌ Erro ao registrar status no histórico:', error);
    }

    // ═══ Alertas automáticos: resolver offline, verificar bateria, audit log ═══
    resolveOfflineAlert(deviceId);
    const batteryLevel = data.data.batteryLevel;
    if (typeof batteryLevel === 'number') {
        if (batteryLevel < 15) {
            createBatteryAlert(deviceId, finalName, batteryLevel);
        } else if (batteryLevel > 20) {
            resolveBatteryAlert(deviceId);
        }
    }
    logAudit('device_connected', 'device', deviceId, finalName, {
        model: data.data.model,
        manufacturer: data.data.manufacturer,
        androidVersion: data.data.androidVersion,
        isReconnection
    });
    
    // ✅ NOTIFICAR SOBRE CONFLITO DE USUÁRIO (se houver)
    if (userConflict) {
        console.log('⚠️ ENVIANDO NOTIFICAÇÃO DE CONFLITO DE USUÁRIO PARA WEB CLIENTS');
        notifyWebClients({
            type: 'user_conflict_warning',
            deviceId: deviceId,
            deviceName: finalName,
            conflict: {
                userId: userConflict.userId,
                userName: userConflict.userName,
                currentDeviceId: userConflict.currentDeviceId,
                otherDevices: userConflict.otherDevices
            },
            message: `Usuário ${userConflict.userName} (${userConflict.userId}) está vinculado a outros dispositivos. O vínculo será mantido no dispositivo atual e removido dos outros.`,
            timestamp: now
        });
    }
    
    // Se o nome mudou, notificar especificamente sobre a mudança
    if (nameChanged) {
        console.log('📝 ═══════════════════════════════════════════════');
        console.log('📝 NOME DO DISPOSITIVO ALTERADO!');
        console.log('📝 ═══════════════════════════════════════════════');
        console.log(`   DeviceId: ${deviceId}`);
        console.log(`   Nome anterior: "${existingDevice.name}"`);
        console.log(`   Nome novo: "${data.data.name}"`);
        console.log('📝 ═══════════════════════════════════════════════');
        
        // Buscar dados de usuário vinculado para incluir na notificação
        let userBinding = {};
        try {
            const userResult = await query(`
                SELECT 
                    d.assigned_device_user_id,
                    du.user_id,
                    du.name as user_name
                FROM devices d
                LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
                WHERE d.device_id = $1 AND d.assigned_device_user_id IS NOT NULL
            `, [deviceId]);
            
            if (userResult.rows.length > 0) {
                const row = userResult.rows[0];
                userBinding = {
                    assignedDeviceUserId: row.assigned_device_user_id,
                    assignedUserId: row.user_id,
                    assignedUserName: row.user_name || null
                };
            }
        } catch (error) {
            log.error('Erro ao buscar usuário para notificação de nome', { error: error.message });
        }
        
        const deviceWithUser = {
            ...deviceData,
            assignedDeviceUserId: userBinding.assignedDeviceUserId || null,
            assignedUserId: userBinding.assignedUserId || null,
            assignedUserName: userBinding.assignedUserName || null
        };
        
        // Notificar clientes web sobre mudança de nome COM OS DADOS COMPLETOS DO DISPOSITIVO
        notifyWebClients({
            type: 'device_name_changed',
            deviceId: deviceId,
            oldName: existingDevice.name,
            newName: data.data.name,
            device: deviceWithUser,
            timestamp: now
        });
        
        // TAMBÉM enviar device_connected para garantir atualização imediata na UI
        notifyWebClients({
            type: 'device_connected',
            device: deviceWithUser,
            timestamp: now
        });
        
        console.log('📤 Notificações de mudança de nome enviadas aos clientes web');
    }
    
    // Enviar senha, restrições e allowedApps apenas UMA VEZ por sessão de conexão
    // Evita loop quando dispositivo envia múltiplos device_status na reconexão
    if (!ws._configSentForDevice) {
        ws._configSentForDevice = new Set();
    }
    const alreadySentConfig = ws._configSentForDevice.has(deviceId);

    if (!alreadySentConfig) {
        ws._configSentForDevice.add(deviceId);

    // Enviar senha de administrador se estiver definida
    if (globalAdminPassword) {
        const message = {
            type: 'set_admin_password',
            data: { password: globalAdminPassword }
        };
        ws.send(JSON.stringify(message));
        console.log(`Senha de administrador enviada automaticamente para dispositivo ${deviceId}`);
    }

    // ✅ AUTO-APLICAR RESTRIÇÕES salvas ao dispositivo que conectou/reconectou
    let savedRestrictions = getRestrictionsForDevice(deviceId);
    // Enhanced: try DB if memory doesn't have restrictions
    if (!savedRestrictions) {
        try {
            const dbResult = await query(
                "SELECT restrictions FROM device_restrictions WHERE device_id = $1 OR device_id = '__global__' ORDER BY CASE WHEN device_id = $1 THEN 0 ELSE 1 END LIMIT 1",
                [deviceId]
            );
            if (dbResult.rows.length > 0) {
                savedRestrictions = dbResult.rows[0].restrictions;
            }
        } catch (e) {
            // Fallback silencioso - sem restrições do banco
        }
    }
    if (savedRestrictions && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'set_device_restrictions',
            data: savedRestrictions,
            timestamp: Date.now()
        }));
        console.log(`🔒 Restrições auto-aplicadas ao dispositivo ${deviceId}`);
    }

    // Enviar configuração do servidor (URL pública) para que dispositivo possa reconectar de qualquer rede
    try {
        const port = process.env.WEBSOCKET_PORT || '3001';
        let publicWsUrl = null;
        if (process.env.WEBSOCKET_PUBLIC_URL && process.env.WEBSOCKET_PUBLIC_URL.trim()) {
            // URL pública configurada explicitamente (domínio, IP público, ngrok, etc.)
            const base = process.env.WEBSOCKET_PUBLIC_URL.trim().replace(/\/$/, '');
            const protocol = base.startsWith('https') ? 'wss' : 'ws';
            try {
                const u = new URL(base);
                publicWsUrl = `${protocol}://${u.hostname}:${port}`;
            } catch (_) {
                publicWsUrl = `ws://${base.replace(/^https?:\/\//, '')}`;
            }
        } else if (process.env.MDM_PUBLIC_URL && process.env.MDM_PUBLIC_URL.trim()) {
            const base = process.env.MDM_PUBLIC_URL.trim().replace(/\/$/, '');
            const protocol = base.startsWith('https') ? 'wss' : 'ws';
            try {
                const u = new URL(base);
                publicWsUrl = `${protocol}://${u.hostname}:${port}`;
            } catch (_) {
                publicWsUrl = `ws://${base.replace(/^https?:\/\//, '')}`;
            }
        }
        if (publicWsUrl && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'server_config',
                data: { publicWsUrl }
            }));
            console.log(`📡 server_config enviado para ${deviceId}: publicWsUrl=${publicWsUrl}`);
        }
    } catch (e) {
        console.warn('⚠️ Erro ao enviar server_config:', e.message);
    }
    
    // Aplicar permissões kiosk pendentes (deploy rodou sem dispositivo conectado)
    if (pendingKioskAppsForAll && pendingKioskAppsForAll.length > 0) {
        log.info('Aplicando permissões kiosk pendentes ao dispositivo recém-conectado', { deviceId, allowedAppsCount: pendingKioskAppsForAll.length });
        applyAppPermissionsToDevice(deviceId, pendingKioskAppsForAll);
        pendingKioskAppsForAll = null;
    }

    // Reenviar allowedApps salvos para o dispositivo ao reconectar (silencioso - sem notificar web clients)
    const savedDeviceApps = persistentDevices.get(deviceId);
    if (savedDeviceApps && Array.isArray(savedDeviceApps.allowedApps) && savedDeviceApps.allowedApps.length > 0) {
        log.info('Reenviando allowedApps salvos para dispositivo reconectado (silencioso)', {
            deviceId, allowedAppsCount: savedDeviceApps.allowedApps.length
        });
        ws.send(JSON.stringify({
            type: 'update_app_permissions',
            data: { allowedApps: savedDeviceApps.allowedApps, isReconnect: true },
            timestamp: Date.now()
        }));
        console.log(`📲 allowedApps reenviados para ${deviceId}: ${savedDeviceApps.allowedApps.length} apps (silencioso)`);
    } else {
        // Verificar se o dispositivo pertence a algum grupo com políticas
        try {
            const dbDevForApps = await query(`SELECT id FROM devices WHERE device_id = $1`, [deviceId]);
            if (dbDevForApps.rows.length > 0) {
                const policyResult = await query(`
                    SELECT DISTINCT ap.package_name
                    FROM app_policies ap
                    JOIN device_group_memberships dgm ON dgm.group_id = ap.group_id
                    WHERE dgm.device_id = $1 AND ap.policy_type = 'allow'
                `, [dbDevForApps.rows[0].id]);
                if (policyResult.rows.length > 0) {
                    const groupApps = policyResult.rows.map(r => r.package_name);
                    log.info('Aplicando políticas de grupo ao dispositivo reconectado (silencioso)', {
                        deviceId, groupAppsCount: groupApps.length
                    });
                    // Enviar direto ao dispositivo sem notificar web clients (é reconexão)
                    const deviceWsForApps = connectedDevices.get(deviceId);
                    if (deviceWsForApps && deviceWsForApps.readyState === WebSocket.OPEN) {
                        deviceWsForApps.send(JSON.stringify({
                            type: 'update_app_permissions',
                            data: { allowedApps: groupApps, isReconnect: true },
                            timestamp: Date.now()
                        }));
                    }
                    // Atualizar persistentDevices sem notificar web clients
                    if (persistentDevices.has(deviceId)) {
                        const dev = persistentDevices.get(deviceId);
                        dev.allowedApps = groupApps;
                        persistentDevices.set(deviceId, dev);
                        saveDeviceToDatabase(dev).catch(err => log.warn('Erro ao salvar no banco', { error: err.message }));
                    }
                }
            }
        } catch (err) {
            log.warn('Erro ao buscar políticas de grupo na reconexão', { deviceId, error: err.message });
        }
    }

    } else {
        console.log(`⏭️ Config já enviada para ${deviceId} nesta sessão, pulando re-envio`);
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
        
        // ✅ RESTAURAR VÍNCULO DE USUÁRIO DO BANCO
        let userBinding = dbUserBinding || {};
        
        console.log(`🔍 === VERIFICANDO VÍNCULO PARA ${deviceId} ===`);
        console.log(`   dbUserBinding existe? ${!!dbUserBinding}`);
        console.log(`   dbUserBinding tem userId? ${!!dbUserBinding?.assignedUserId}`);
        console.log(`   dbUserBinding:`, dbUserBinding);
        
        // Se não temos do banco inicial, buscar agora
        if (!userBinding.assignedUserId) {
            console.log(`   Buscando vínculo no banco para ${deviceId}...`);
            try {
                const userResult = await query(`
                    SELECT 
                        d.assigned_device_user_id,
                        du.user_id,
                        du.name as user_name,
                        du.cpf
                    FROM devices d
                    LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
                    WHERE d.device_id = $1 AND d.assigned_device_user_id IS NOT NULL
                `, [deviceId]);
                
                console.log(`   Query retornou ${userResult.rows.length} registros`);
                
                if (userResult.rows.length > 0) {
                    const row = userResult.rows[0];
                    userBinding = {
                        assignedDeviceUserId: row.assigned_device_user_id,
                        assignedUserId: row.user_id,
                        assignedUserName: row.user_name || null
                    };
                    console.log(`✅ Usuário vinculado encontrado: ${row.user_name} (${row.user_id})`);
                } else {
                    console.log(`⚪ Nenhum vínculo encontrado no banco para ${deviceId}`);
                }
            } catch (error) {
                console.error(`❌ Erro ao buscar vínculo:`, error);
                log.error('Erro ao buscar usuário vinculado', { error: error.message });
            }
        } else {
            console.log(`✅ Usando vínculo já carregado: ${userBinding.assignedUserName} (${userBinding.assignedUserId})`);
        }
        
        // Adicionar dados de usuário ao dispositivo (garantindo que o vínculo do banco seja usado)
        const deviceWithUser = {
            ...connectedDeviceData,
            // ✅ PRIORIDADE: Dados do banco > dados da memória
            assignedDeviceUserId: userBinding.assignedDeviceUserId || null,
            assignedUserId: userBinding.assignedUserId || null,
            assignedUserName: userBinding.assignedUserName || null
        };
        
        console.log(`📤 ENVIANDO device_connected para ${deviceId}:`);
        console.log(`   assignedDeviceUserId: ${deviceWithUser.assignedDeviceUserId}`);
        console.log(`   assignedUserId: ${deviceWithUser.assignedUserId}`);
        console.log(`   assignedUserName: ${deviceWithUser.assignedUserName}`);
        console.log(`   ==========================================`);
        
        if (userBinding.assignedUserId) {
            console.log(`✅✅✅ VÍNCULO RESTAURADO: ${deviceId} → ${userBinding.assignedUserName} (${userBinding.assignedUserId})`);
        }
        
        let sentCount = 0;
        webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'device_connected',
                    device: deviceWithUser
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
    
    // Notificar clientes web COM DADOS DE USUÁRIO DO BANCO
    const statusDeviceData = persistentDevices.get(deviceId);
    if (statusDeviceData) {
        console.log('Device ID:', deviceId);
        console.log('Bateria:', statusDeviceData.batteryLevel);
        console.log('Apps instalados:', statusDeviceData.installedAppsCount);
        console.log('Apps permitidos:', statusDeviceData.allowedApps?.length || 0);
        console.log('Armazenamento total:', statusDeviceData.storageTotal);
        console.log('Armazenamento usado:', statusDeviceData.storageUsed);
        
        // ✅ Usar dados de usuário já carregados do banco (dbUserBinding) ou buscar se necessário
        let userBinding = dbUserBinding || {};
        
        // Se não temos, buscar agora
        if (!userBinding.assignedUserId) {
            try {
                const userResult = await query(`
                    SELECT 
                        d.assigned_device_user_id,
                        du.user_id,
                        du.name as user_name
                    FROM devices d
                    LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
                    WHERE d.device_id = $1 AND d.assigned_device_user_id IS NOT NULL
                `, [deviceId]);
                
                if (userResult.rows.length > 0) {
                    const row = userResult.rows[0];
                    userBinding = {
                        assignedDeviceUserId: row.assigned_device_user_id,
                        assignedUserId: row.user_id,
                        assignedUserName: row.user_name || null
                    };
                    console.log(`✅ Usuário vinculado no status: ${row.user_name} (ID: ${row.user_id})`);
                } else {
                    console.log('⚪ Sem usuário vinculado para este dispositivo');
                }
            } catch (error) {
                log.error('Erro ao buscar usuário vinculado no status', { error: error.message });
            }
        } else {
            console.log(`✅ Usando vínculo já carregado no status: ${userBinding.assignedUserName} (${userBinding.assignedUserId})`);
        }
        
        // Adicionar dados de usuário ao dispositivo (prioridade: banco > memória)
        const deviceWithUser = {
            ...statusDeviceData,
            // ✅ PRIORIDADE: Dados do banco > dados da memória
            assignedDeviceUserId: userBinding.assignedDeviceUserId || statusDeviceData.assignedDeviceUserId || null,
            assignedUserId: userBinding.assignedUserId || statusDeviceData.assignedUserId || null,
            assignedUserName: userBinding.assignedUserName || statusDeviceData.assignedUserName || null
        };
        
        console.log('=======================================================');
        
        // Enviar dados completos do dispositivo COM USUÁRIO
        notifyWebClients({
            type: 'device_connected',
            device: deviceWithUser,
            timestamp: Date.now()
        });
        
        // Também enviar atualização de status COM USUÁRIO
        notifyWebClients({
            type: 'device_status',
            device: deviceWithUser,
            timestamp: Date.now()
        });

        // Sincronizar apps do dispositivo com os grupos aos quais pertence
        if (data.data.installedApps && Array.isArray(data.data.installedApps) && data.data.installedApps.length > 0) {
            try {
                // Buscar grupos aos quais o dispositivo pertence
                const deviceInternalId = dbDevice ? dbDevice.id : null;
                if (deviceInternalId) {
                    const groupsResult = await query(`
                        SELECT DISTINCT dgm.group_id 
                        FROM device_group_memberships dgm
                        WHERE dgm.device_id = $1
                    `, [deviceInternalId]);

                    if (groupsResult.rows.length > 0) {
                        const apps = data.data.installedApps.map((app) => ({
                            packageName: app.packageName,
                            appName: app.appName || app.packageName,
                            icon: app.icon || null
                        }));

                        // Sincronizar apps para cada grupo
                        for (const groupRow of groupsResult.rows) {
                            const groupId = groupRow.group_id;
                            await DeviceGroupModel.syncGroupAvailableApps(groupId, [{
                                deviceId: deviceId,
                                apps: apps
                            }]);
                        }
                    }
                }
            } catch (error) {
                console.error('Erro ao sincronizar apps do dispositivo com grupos:', error);
                // Não bloquear o fluxo principal se houver erro na sincronização
            }
        }
    }
}

function handleDeviceRestrictions(ws, data) {
    log.info(`Restrições do dispositivo atualizadas`, {
        deviceId: ws.deviceId,
        connectionId: ws.connectionId,
        restrictions: data.data
    });

    // ═══ Audit log: restrições alteradas ═══
    const restrictionDevice = persistentDevices.get(ws.deviceId);
    logAudit('restriction_changed', 'device', ws.deviceId, restrictionDevice?.name || ws.deviceId, {
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
    ws.lastActivity = startTime;
    ws.lastPingReceived = startTime;
    
    // Se ping veio de dispositivo Android (tem deviceId) mas ainda não enviou device_status
    if (data.deviceId && !ws.isDevice && !ws.isWebClient) {
        ws.isDevice = true;
        ws.deviceId = data.deviceId;
        log.info('Dispositivo identificado via ping, solicitando device_status', { deviceId: data.deviceId });
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'device_status', timestamp: Date.now() }));
            }
        } catch (e) {
            log.warn('Erro ao solicitar device_status após ping', { error: e.message });
        }
    }
    
    log.debug('Ping recebido', { connectionId: ws.connectionId, deviceId: ws.deviceId });
    
    // Registrar latência para timeout adaptativo
    if (ws.deviceId && data.timestamp) {
        const latency = startTime - data.timestamp;
        adaptiveTimeout.updateLatency(ws.deviceId, latency);
        healthMonitor.recordConnection(ws.deviceId, true, latency);
        
        log.debug('Latência calculada', { 
            deviceId: ws.deviceId, 
            latency: latency + 'ms',
            adaptiveTimeout: Math.round(adaptiveTimeout.getTimeout(ws.deviceId) / 1000) + 's'
        });
    }
    
    // Responder com pong imediatamente
    const pongMessage = {
        type: 'pong',
        timestamp: Date.now(),
        serverTime: Date.now(),
        receivedTimestamp: data.timestamp || startTime
    };
    
    try {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(pongMessage));
            log.debug('Pong enviado', { connectionId: ws.connectionId, deviceId: ws.deviceId });
            
            // Atualizar lastSeen para dispositivos
            if (ws.isDevice && ws.deviceId) {
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

async function handleWebClient(ws, data) {
    // Marcar como cliente web
    ws.isWebClient = true;
    webClients.add(ws);
    
    log.info('Cliente web conectado', {
        connectionId: ws.connectionId,
        totalWebClients: webClients.size
    });
    
    // ✅ BUSCAR TODOS OS DISPOSITIVOS DO BANCO DE DADOS (FONTE DE VERDADE)
    // IMPORTANTE: Apenas dispositivos móveis (Android), não computadores
    let dbDevices = [];
    try {
        const dbResult = await query(`
            SELECT 
                d.*,
                du.user_id,
                du.name as user_name,
                du.cpf as user_cpf,
                d.assigned_device_user_id
            FROM devices d
            LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
            WHERE d.deleted_at IS NULL
            AND (d.os_type = 'Android' OR d.os_type IS NULL)
            ORDER BY d.last_seen DESC
        `);
        
        dbDevices = dbResult.rows.map(row => ({
            deviceId: row.device_id,
            id: row.id, // UUID interno
            name: row.name || row.model || 'Dispositivo Desconhecido',
            model: row.model,
            manufacturer: row.manufacturer,
            androidVersion: row.android_version,
            osType: row.os_type || 'Android',
            apiLevel: row.api_level,
            serialNumber: row.serial_number,
            imei: row.imei,
            meid: row.meid,
            macAddress: row.mac_address,
            ipAddress: row.ip_address,
            batteryLevel: row.battery_level || 0,
            batteryStatus: row.battery_status,
            isCharging: row.is_charging || false,
            storageTotal: parseInt(row.storage_total) || 0,
            storageUsed: parseInt(row.storage_used) || 0,
            memoryTotal: parseInt(row.memory_total) || 0,
            memoryUsed: parseInt(row.memory_used) || 0,
            cpuArchitecture: row.cpu_architecture,
            screenResolution: row.screen_resolution,
            screenDensity: row.screen_density,
            networkType: row.network_type,
            wifiSSID: row.wifi_ssid,
            isWifiEnabled: row.is_wifi_enabled || false,
            isBluetoothEnabled: row.is_bluetooth_enabled || false,
            isLocationEnabled: row.is_location_enabled || false,
            isDeveloperOptionsEnabled: row.is_developer_options_enabled || false,
            isAdbEnabled: row.is_adb_enabled || false,
            isUnknownSourcesEnabled: row.is_unknown_sources_enabled || false,
            isDeviceOwner: row.is_device_owner || false,
            isProfileOwner: row.is_profile_owner || false,
            isKioskMode: row.is_kiosk_mode || false,
            appVersion: row.app_version,
            timezone: row.timezone,
            language: row.language,
            country: row.country,
            complianceStatus: row.compliance_status || 'unknown',
            status: row.status || 'offline',
            lastSeen: row.last_seen ? new Date(row.last_seen).getTime() : null,
            installedAppsCount: 0,
            installedApps: [],
            allowedApps: [],
            // ✅ DADOS DE USUÁRIO VINCULADO DO BANCO
            assignedDeviceUserId: row.assigned_device_user_id || null,
            assignedUserId: row.user_id || null,
            assignedUserName: row.user_name || null,
            assignedUserCpf: row.user_cpf || null
        }));
        
        // Dispositivos carregados do banco
    } catch (error) {
        log.error('Erro ao carregar dispositivos do banco', { error: error.message });
        console.error('❌ Erro ao buscar dispositivos do banco:', error);
    }
    
    // ✅ MESCLAR COM DADOS EM TEMPO REAL (para dispositivos conectados)
    // Se um dispositivo está na memória (conectado), usar dados mais recentes mas preservar vínculo de usuário
    const devicesMap = new Map();
    
    // Primeiro, adicionar todos os dispositivos do banco, exceto os marcados como deletados
    const filteredDbDevices = dbDevices.filter(d => !deletedDeviceIds.has(d.deviceId));
    filteredDbDevices.forEach(device => {
        devicesMap.set(device.deviceId, device);
    });
    
    // Depois, mesclar com dados em tempo real (se conectado)
    Array.from(persistentDevices.values()).forEach(liveDevice => {
        // Ignorar dispositivos marcados como deletados até que reconectem
        if (deletedDeviceIds.has(liveDevice.deviceId)) {
            return;
        }
        const existing = devicesMap.get(liveDevice.deviceId);
        
        if (existing) {
            // Dispositivo existe no banco → Mesclar dados em tempo real mas PRESERVAR vínculo de usuário
            const mergedDevice = {
                ...liveDevice, // Dados em tempo real (bateria, apps, etc)
                // PRESERVAR vínculo de usuário do banco
                assignedDeviceUserId: existing.assignedDeviceUserId || null,
                assignedUserId: existing.assignedUserId || null,
                assignedUserName: existing.assignedUserName || null,
                assignedUserCpf: existing.assignedUserCpf || null,
                // Usar status em tempo real se conectado
                status: connectedDevices.has(liveDevice.deviceId) ? 'online' : existing.status
            };
            
            // 🔍 DEBUG: Log da mesclagem
            if (existing.assignedUserId || existing.assignedUserName) {
                console.log(`✅ Mesclando dispositivo ${liveDevice.deviceId}: preservando vínculo de usuário:`, {
                    assignedUserId: existing.assignedUserId,
                    assignedUserName: existing.assignedUserName
                });
            }
            
            devicesMap.set(liveDevice.deviceId, mergedDevice);
        } else {
            // Dispositivo não está no banco ainda → Adicionar (será salvo na próxima atualização)
            devicesMap.set(liveDevice.deviceId, {
                ...liveDevice,
                assignedDeviceUserId: null,
                assignedUserId: null,
                assignedUserName: null,
                assignedUserCpf: null
            });
        }
    });
    
    // Converter Map para Array (dados já incluem tudo do banco + tempo real)
    const devices = Array.from(devicesMap.values());
    
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
    
    // Enviar lista de dispositivos para cliente web (sem log detalhado)
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
    }
    
    // Solicitar device_status a todos os dispositivos conectados (atualiza lista em tempo real)
    const deviceStatusRequest = JSON.stringify({ type: 'device_status', timestamp: Date.now() });
    connectedDevices.forEach((deviceWs, deviceId) => {
        if (deviceWs.readyState === WebSocket.OPEN && deviceWs.isDevice) {
            try {
                deviceWs.send(deviceStatusRequest);
            } catch (e) {
                log.warn('Erro ao solicitar device_status', { deviceId, error: e.message });
            }
        }
    });
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
    
    // Obter dados do dispositivo (pode estar em memória ou só no banco)
    const deviceData = persistentDevices.get(deviceId);
    
    try {
        // ✅ DELETAR DO BANCO DE DADOS (dispositivos da API/PostgreSQL)
        let dbDeleted = false;
        try {
            await DeviceModel.delete(deviceId);
            dbDeleted = true;
            console.log(`✅ Dispositivo ${deviceId} deletado do banco de dados`);
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('não encontrado')) {
                // Dispositivo não está no banco - pode estar só em memória (WebSocket)
                log.warn(`Dispositivo ${deviceId} não encontrado no banco, tentando remover da memória`);
            } else {
                console.error(`❌ Erro ao deletar dispositivo do banco:`, dbError);
            }
        }
        
        // Só prosseguir se deletou do banco OU se está em persistentDevices (memória)
        if (!dbDeleted && !persistentDevices.has(deviceId)) {
            log.warn(`Dispositivo não encontrado para deleção`, { deviceId });
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'delete_device_response',
                    success: false,
                    error: 'Dispositivo não encontrado no servidor nem no banco de dados',
                    deviceId: deviceId
                }));
            }
            return;
        }
        
        // Fechar conexão WebSocket do dispositivo antes de remover
        const deletedDeviceWs = connectedDevices.get(deviceId);
        if (deletedDeviceWs && deletedDeviceWs.readyState === WebSocket.OPEN) {
            deletedDeviceWs.send(JSON.stringify({
                type: 'device_deleted_blocked',
                message: 'Este dispositivo foi removido do sistema'
            }));
            deletedDeviceWs.close(1000, 'Device was deleted');
            console.log(`🔌 Conexão WebSocket do dispositivo ${deviceId} encerrada`);
        }

        // Remover das listas em memória
        persistentDevices.delete(deviceId);
        deletedDeviceIds.add(deviceId);
        connectedDevices.delete(deviceId);

        // Persistir na tabela de dispositivos deletados para sobreviver reinícios
        try {
            await query(`INSERT INTO deleted_devices (device_id) VALUES ($1) ON CONFLICT (device_id) DO NOTHING`, [deviceId]);
        } catch (e) {
            console.error('❌ Falha ao persistir dispositivo deletado:', e.message);
        }

        console.log(`🗑️ Dispositivo ${deviceId} removido permanentemente da memória e do banco de dados`);

        log.info(`Dispositivo deletado permanentemente`, {
            deviceId: deviceId,
            deviceName: deviceData?.name || 'desconhecido',
            connectionId: ws.connectionId,
            note: 'Dispositivo deletado permanentemente do banco de dados e da memória'
        });

        // ═══ Audit log: dispositivo deletado ═══
        logAudit('device_deleted', 'device', deviceId, deviceData?.name || 'desconhecido', {
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

/**
 * Aplica permissões de apps a um dispositivo (usado por HTTP API e WebSocket)
 * @param {string} deviceId - ID do dispositivo
 * @param {string[]} allowedApps - Lista de package names permitidos
 */
function applyAppPermissionsToDevice(deviceId, allowedApps) {
    const appsToApply = Array.isArray(allowedApps) ? allowedApps : [];
    
    // Atualizar dispositivo em persistentDevices se existir
    if (persistentDevices.has(deviceId)) {
        const device = persistentDevices.get(deviceId);
        device.allowedApps = appsToApply;
        persistentDevices.set(deviceId, device);
        saveDeviceToDatabase(device).catch(err => log.warn('Erro ao salvar no banco', { error: err.message }));
    }
    
    // Enviar para o dispositivo Android se conectado
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'update_app_permissions',
            data: { allowedApps: appsToApply },
            timestamp: Date.now()
        };
        deviceWs.send(JSON.stringify(message));
        log.info('Permissões aplicadas ao dispositivo', { deviceId, allowedAppsCount: appsToApply.length });
    } else {
        log.warn('Dispositivo não conectado, permissões serão aplicadas quando conectar', { deviceId });
    }
    
    notifyWebClients({
        type: 'app_permissions_updated',
        deviceId: deviceId,
        allowedApps: appsToApply,
        timestamp: Date.now()
    });
}

function handleInstallApp(ws, data) {
    const { deviceId, packageName } = data;
    if (!deviceId || !packageName) return;
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'install_app', packageName, timestamp: Date.now() }));
        log.info('Comando install_app enviado', { deviceId, packageName });
    } else {
        log.warn('Dispositivo não conectado para install_app', { deviceId, packageName });
    }
}

function handleUpdateAppPermissions(ws, data) {
    const { deviceId, allowedApps, isIndividual = false, individualApps: receivedIndividualApps } = data;
    
    console.log('=== UPDATE APP PERMISSIONS RECEBIDO ===');
    console.log('DeviceId:', deviceId);
    console.log('AllowedApps:', allowedApps);
    console.log('IsIndividual:', isIndividual);
    console.log('ReceivedIndividualApps:', receivedIndividualApps);
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
    
    const device = persistentDevices.get(deviceId);
    const appsToApply = Array.isArray(allowedApps) ? allowedApps : [];
    
    // ✅ Se é individual (salvo via DeviceModal), marcar apps como individuais
    // O DeviceModal envia individualApps separadamente com apenas os apps selecionados individualmente
    if (isIndividual && receivedIndividualApps && Array.isArray(receivedIndividualApps)) {
        // Inicializar individualApps se não existir
        if (!device.individualApps) {
            device.individualApps = [];
        }
        
        // Atualizar lista de apps individuais com os recebidos do DeviceModal
        // Estes são os apps que o usuário selecionou individualmente (sem os da política)
        device.individualApps = [...new Set(receivedIndividualApps)];
        
        log.info('Apps marcados como individuais', { 
            deviceId, 
            individualApps: device.individualApps,
            totalAllowedApps: appsToApply.length
        });
    }
    
    // Atualizar allowedApps (mescla apps individuais + apps de política de grupo)
    device.allowedApps = appsToApply;
    persistentDevices.set(deviceId, device);
    
    console.log('=== DADOS ATUALIZADOS NO DISPOSITIVO ===');
    console.log('DeviceId:', deviceId);
    console.log('AllowedApps atualizados:', device.allowedApps);
    console.log('========================================');
    
    // Salvar no PostgreSQL
    saveDeviceToDatabase(device);

    // ═══ Audit log: permissões de apps atualizadas ═══
    logAudit('app_permissions_changed', 'device', deviceId, device.name || deviceId, {
        allowedAppsCount: appsToApply.length,
        isIndividual,
        allowedApps: appsToApply
    });

    log.info(`Permissões de aplicativos atualizadas`, {
        deviceId: deviceId,
        connectionId: ws.connectionId,
        allowedAppsCount: appsToApply.length,
        allowedApps: appsToApply
    });
    
    // Enviar permissões para o dispositivo Android se estiver conectado
    // ✅ Substituir completamente - política de grupo tem prioridade absoluta
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'update_app_permissions',
            data: {
                allowedApps: appsToApply // Já normalizado como array (pode estar vazio)
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
            allowedAppsCount: appsToApply.length
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
    // Suportar formato direto (MainActivity) ou aninhado (LocationService: data.data)
    const loc = data.data || data;
    const deviceId = loc.deviceId || data.deviceId;
    
    if (!deviceId) {
        log.warn(`location_update sem deviceId`, { connectionId: ws.connectionId });
        return;
    }
    
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
    device.latitude = loc.latitude;
    device.longitude = loc.longitude;
    device.locationAccuracy = loc.accuracy;
    device.lastLocationUpdate = loc.timestamp;
    device.locationProvider = loc.provider;
    device.isLocationEnabled = true;
    if (loc.address != null) device.address = loc.address;
    
    persistentDevices.set(deviceId, device);
    
    // Salvar no PostgreSQL
    saveDeviceToDatabase(device);
    
    log.info(`Localização atualizada`, {
        deviceId: deviceId,
        connectionId: ws.connectionId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        provider: loc.provider
    });
    
    // Notificar clientes web sobre a atualização de localização
    notifyWebClients({
        type: 'location_updated',
        deviceId: deviceId,
        location: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy,
            timestamp: loc.timestamp,
            provider: loc.provider,
            address: loc.address
        },
        timestamp: Date.now()
    });
}

async function handleAppUsage(ws, data) {
    console.log('📊 === PROCESSANDO DADOS DE USO ===');
    console.log('📊 DeviceId:', data.deviceId);
    console.log('📊 Dados recebidos:', JSON.stringify(data.data, null, 2));
    console.log('📊 Apps acessados:', data.data?.accessed_apps);

    const deviceId = data.deviceId;

    // Verificar se o dispositivo existe
    if (!persistentDevices.has(deviceId)) {
        log.warn(`Dispositivo não encontrado para dados de uso`, {
            deviceId: deviceId,
            connectionId: ws.connectionId
        });
        console.log('❌ Dispositivo não encontrado:', deviceId);
        return;
    }

    // Atualizar dados de uso no dispositivo persistente
    const device = persistentDevices.get(deviceId);
    device.appUsageData = data.data;
    device.lastUsageUpdate = data.timestamp;

    persistentDevices.set(deviceId, device);

    console.log('✅ Dados de uso atualizados no dispositivo persistente');
    console.log('📊 Apps acessados salvos:', device.appUsageData?.accessed_apps?.length || 0);

    try {
        // ✅ CORREÇÃO: Salvar TODOS os apps acessados (não apenas o último)
        if (data.data?.accessed_apps && Array.isArray(data.data.accessed_apps) && data.data.accessed_apps.length > 0) {
            console.log('📊 Salvando TODOS os apps acessados...');
            console.log('📊 Total de apps na lista:', data.data.accessed_apps.length);
            console.log('📊 Conteúdo da lista:', JSON.stringify(data.data.accessed_apps, null, 2));
            
            // Iterar sobre TODOS os apps e salvar cada um
            let savedCount = 0;
            let skippedCount = 0;
            
            for (const app of data.data.accessed_apps) {
                try {
                    // Verificar se o app está na lista de permitidos do dispositivo
                    const isAllowed = device.allowedApps && device.allowedApps.includes(app.packageName);
                    
                    const accessTime = new Date(app.accessTime);
                    console.log(`📊 [${savedCount + 1}/${data.data.accessed_apps.length}] Salvando app: ${app.appName}, package: ${app.packageName}, accessTime: ${accessTime.toISOString()}`);
                    
                    await AppAccessHistory.saveAppAccess(
                        deviceId,
                        app.packageName,
                        app.appName,
                        accessTime,
                        app.duration || 0,
                        isAllowed
                    );
                    
                    savedCount++;
                    console.log(`✅ App salvo com sucesso: ${app.appName} (${app.packageName}) - Permitido: ${isAllowed}`);
                } catch (error) {
                    skippedCount++;
                    console.error(`❌ Erro ao salvar app ${app.appName}:`, error.message);
                }
            }
            
            console.log(`📊 Resumo: ${savedCount} apps salvos, ${skippedCount} erros`);
        } else {
            console.log('📊 Nenhum app acessado para salvar');
        }

        // Atualizar status do dispositivo
        await DeviceModel.updateStatus(deviceId, 'online', null);
        
        log.info(`Dados de uso atualizados no banco de dados`, {
            deviceId: deviceId,
            usageData: data.data
        });
        console.log('✅ Dados salvos no PostgreSQL');
        
    } catch (error) {
        log.error(`Erro ao atualizar dados de uso no banco`, {
            deviceId: deviceId,
            error: error.message
        });
        console.log('❌ Erro ao salvar no PostgreSQL:', error.message);
    }

    // Notificar clientes web sobre a atualização de uso
    const notificationMessage = {
        type: 'app_usage_updated',
        deviceId: deviceId,
        usageData: data.data,
        timestamp: data.timestamp
    };

    console.log('📤 Notificando clientes web:', JSON.stringify(notificationMessage, null, 2));

    notifyWebClients(notificationMessage);

    console.log('📊 === FIM PROCESSAMENTO DADOS DE USO ===');
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
    const deviceId = data.deviceId || data.device_id;
    const message = data.message || data.body || '';
    
    console.log('=== ENVIANDO NOTIFICAÇÃO DE TESTE ===');
    console.log('Data recebida:', JSON.stringify(data));
    console.log('Device ID:', deviceId);
    console.log('Mensagem:', message);
    console.log('Dispositivos conectados:', Array.from(connectedDevices.keys()));
    
    if (!deviceId || !message) {
        log.warn('send_test_notification sem deviceId ou message', { data });
        webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'notification_error',
                    deviceId: deviceId || 'unknown',
                    title: 'Erro ao Enviar',
                    body: 'deviceId ou message ausente',
                    timestamp: Date.now()
                }));
            }
        });
        return;
    }
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const notificationMessage = {
            type: 'show_notification',
            title: 'MDM Center',
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

function handleStartAlarm(ws, data) {
    const { deviceId } = data;
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'start_alarm', timestamp: Date.now() }));
        log.info(`Comando start_alarm enviado`, { deviceId, connectionId: ws.connectionId });
        return { success: true };
    }
    log.warn(`Dispositivo não encontrado ou desconectado para alarme`, { deviceId, connectionId: ws.connectionId });
    notifyWebClients({
        type: 'alarm_device_result',
        success: false,
        deviceId,
        action: 'start',
        message: 'Dispositivo não conectado. Verifique se o celular está online e na mesma rede.'
    });
    return { success: false, error: 'Dispositivo não conectado' };
}

function handleStopAlarm(ws, data) {
    const { deviceId } = data;
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'stop_alarm', timestamp: Date.now() }));
        log.info(`Comando stop_alarm enviado`, { deviceId, connectionId: ws.connectionId });
        return { success: true };
    }
    log.warn(`Dispositivo não encontrado ou desconectado para parar alarme`, { deviceId, connectionId: ws.connectionId });
    notifyWebClients({
        type: 'alarm_device_result',
        success: false,
        deviceId,
        action: 'stop',
        message: 'Dispositivo não conectado. Verifique se o celular está online e na mesma rede.'
    });
    return { success: false, error: 'Dispositivo não conectado' };
}

function handleRebootDevice(ws, data) {
    const { deviceId } = data;
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'reboot_device', timestamp: Date.now() }));
        log.info(`Comando de reinicialização enviado`, { deviceId, connectionId: ws.connectionId });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado para reiniciar`, { deviceId, connectionId: ws.connectionId });
        notifyWebClients({
            type: 'reboot_device_result',
            success: false,
            deviceId,
            message: 'Dispositivo não conectado. Verifique se o celular está online e na mesma rede.'
        });
    }
}

function handleWakeDevice(ws, data) {
    const { deviceId } = data;
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'wake_device', timestamp: Date.now() }));
        log.info(`Comando wake_device enviado`, { deviceId, connectionId: ws.connectionId });
        return { success: true };
    }
    log.warn(`Dispositivo não encontrado ou desconectado para acordar`, { deviceId, connectionId: ws.connectionId });
    notifyWebClients({
        type: 'wake_device_result',
        success: false,
        deviceId,
        message: 'Dispositivo não conectado. Verifique se o celular está online e na mesma rede.'
    });
    return { success: false, error: 'Dispositivo não conectado' };
}

function handleRevertDevice(ws, data) {
    const { deviceId } = data;
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'revert_device', timestamp: Date.now() }));
        log.info('Comando revert_device enviado', { deviceId, connectionId: ws.connectionId });
        notifyWebClients({
            type: 'revert_device_result',
            success: true,
            deviceId,
            message: 'Comando de reversão enviado. O MDM será removido e o celular voltará ao normal.'
        });
    } else {
        log.warn('Dispositivo não conectado para reverter', { deviceId });
        notifyWebClients({
            type: 'revert_device_result',
            success: false,
            deviceId,
            message: 'Dispositivo não conectado. O celular precisa estar online para reverter.'
        });
    }
}

// enviar comando de formatação (factory reset) ao dispositivo
function handleFormatDevice(ws, data) {
    const { deviceId } = data;
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        deviceWs.send(JSON.stringify({ type: 'format_device', timestamp: Date.now() }));
        log.info(`Comando format_device enviado`, { deviceId, connectionId: ws.connectionId });
        // ═══ Audit log: formatação de dispositivo ═══
        const fmtDevice = persistentDevices.get(deviceId);
        logAudit('command_sent', 'device', deviceId, fmtDevice?.name || deviceId, {
            command: 'format_device'
        });
        return { success: true };
    }
    log.warn(`Dispositivo não encontrado ou desconectado para formatação`, { deviceId, connectionId: ws.connectionId });
    notifyWebClients({
        type: 'format_device_result',
        success: false,
        deviceId,
        message: 'Dispositivo não conectado. Verifique se o celular está online e na mesma rede.'
    });
    return { success: false, error: 'Dispositivo não conectado' };
}

function handleLockDevice(ws, data) {
    const { deviceId } = data;
    
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'lock_device',
            // ✅ NOVO: Adicionar flag para desbloquear com qualquer toque (sem deslizar)
            disableSwipeUnlock: true,
            unlockOnAnyTouch: true,
            timestamp: Date.now()
        };
        deviceWs.send(JSON.stringify(message));
        log.info(`Comando de bloqueio enviado`, { deviceId, connectionId: ws.connectionId });
        // ═══ Audit log: bloqueio de dispositivo ═══
        const lockDev = persistentDevices.get(deviceId);
        logAudit('command_sent', 'device', deviceId, lockDev?.name || deviceId, {
            command: 'lock_device'
        });
        // Aguardar lock_device_confirmed do dispositivo para notificar o cliente web
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado para bloqueio`, { deviceId, connectionId: ws.connectionId });
        notifyWebClients({
            type: 'lock_device_result',
            success: false,
            deviceId,
            message: 'Dispositivo não conectado. Verifique se o celular está online e na mesma rede.'
        });
    }
}

function handleUnlockDevice(ws, data) {
    const { deviceId } = data;
    const deviceWs = connectedDevices.get(deviceId);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
        const message = {
            type: 'unlock_device',
            timestamp: Date.now()
        };
        deviceWs.send(JSON.stringify(message));
        log.info(`Comando de desbloqueio enviado`, { deviceId, connectionId: ws.connectionId });
    } else {
        log.warn(`Dispositivo não encontrado ou desconectado para desbloqueio`, { deviceId, connectionId: ws.connectionId });
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
setInterval(async () => {
    serverStats.lastHeartbeat = Date.now();
    const now = Date.now();
    
    // Enviar ping ativo para dispositivos conectados (com validação de pong)
    connectedDevices.forEach((deviceWs, deviceId) => {
        if (deviceWs.readyState === WebSocket.OPEN && pingThrottler.canPing(deviceId)) {
            try {
                // Verificar se há ping pendente sem resposta
                if (pendingPings.has(deviceId)) {
                    const pingData = pendingPings.get(deviceId);
                    const timeSincePing = now - pingData.timestamp;
                    
                    // Se ping pendente há mais de PONG_TIMEOUT, considerar conexão morta
                    if (timeSincePing > config.PONG_TIMEOUT) {
                        log.warn('Conexão morta detectada (sem pong)', { 
                            deviceId, 
                            timeSincePing: Math.round(timeSincePing / 1000) + 's'
                        });
                        
                        // Limpar timeout
                        if (pingData.timeoutId) {
                            clearTimeout(pingData.timeoutId);
                        }
                        pendingPings.delete(deviceId);
                        
                        // Fechar conexão
                        deviceWs.close(1000, 'No pong received');
                        connectedDevices.delete(deviceId);
                        healthMonitor.recordConnection(deviceId, false);
                        return;
                    }
                } else {
                    // Enviar novo ping
                    deviceWs.ping();
                    log.debug('Ping WebSocket nativo enviado para dispositivo', { deviceId });
                    
                    // Registrar ping pendente com timeout
                    const timeoutId = setTimeout(() => {
                        if (pendingPings.has(deviceId)) {
                            log.warn('Timeout aguardando pong', { deviceId });
                            pendingPings.delete(deviceId);
                            healthMonitor.recordConnection(deviceId, false);
                            
                            // Fechar conexão morta
                            if (deviceWs.readyState === WebSocket.OPEN) {
                                deviceWs.close(1000, 'Pong timeout');
                            }
                            connectedDevices.delete(deviceId);
                        }
                    }, config.PONG_TIMEOUT);
                    
                    pendingPings.set(deviceId, {
                        timestamp: now,
                        timeoutId: timeoutId
                    });
                }
            } catch (error) {
                log.error('Erro ao enviar ping para dispositivo', { deviceId, error: error.message });
                healthMonitor.recordConnection(deviceId, false);
            }
        }
    });
    
    // Verificar dispositivos inativos e atualizar status (com timeout adaptativo)
    const WARNING_TIMEOUT = 45 * 1000; // 45 segundos para avisar sobre possível desconexão
    
    persistentDevices.forEach((device, deviceId) => {
        const timeSinceLastSeen = now - device.lastSeen;
        const isConnected = connectedDevices.has(deviceId);
        
        // Usar timeout adaptativo baseado na latência do dispositivo (mais tolerante)
        const adaptiveInactivityTimeout = Math.max(
            adaptiveTimeout.getTimeout(deviceId),
            config.BASE_INACTIVITY_TIMEOUT
        );
        
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
                const cleanedDevice = {
                    ...device,
                    status: 'offline',
                    lastSeen: device.lastSeen, // Manter o último timestamp visto
                    // Limpar dados sensíveis quando offline
                    // IMPORTANTE: Preservar name, model, manufacturer para identificação
                    batteryLevel: 0,
                    storageTotal: 0,
                    storageUsed: 0,
                    installedAppsCount: 0,
                    allowedApps: [],
                    isCharging: false
                };
                persistentDevices.set(deviceId, cleanedDevice);
                
                // SALVAR NO BANCO para manter consistência
                saveDeviceToDatabase(cleanedDevice);
                
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
                    const offlineDevice = {
                        ...device,
                        status: 'offline',
                        lastSeen: device.lastSeen
                    };
                    persistentDevices.set(deviceId, offlineDevice);
                    
                    // SALVAR NO BANCO para manter consistência
                    saveDeviceToDatabase(offlineDevice);
                    
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

    // ✅ BUSCAR VÍNCULOS DE USU��RIO DO BANCO ANTES DE ENVIAR STATUS PERIÓDICO
    let userBindingsMap = new Map();
    try {
        const userBindingsResult = await query(`
            SELECT 
                d.device_id,
                d.assigned_device_user_id,
                du.user_id,
                du.name as user_name,
                du.cpf as user_cpf
            FROM devices d
            LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
            WHERE d.assigned_device_user_id IS NOT NULL
        `);
        
        userBindingsResult.rows.forEach(row => {
            userBindingsMap.set(row.device_id, {
                assignedDeviceUserId: row.assigned_device_user_id,
                assignedUserId: row.user_id,
                assignedUserName: row.user_name || null,
                assignedUserCpf: row.user_cpf
            });
        });
        
        console.log(`✅ ${userBindingsMap.size} vínculos de usuário carregados para devices_status`);
    } catch (error) {
        log.error('Erro ao buscar vínculos de usuário para devices_status', { error: error.message });
    }
    
    // Enviar status dos dispositivos (persistentes) COM DADOS DE USUÁRIO DO BANCO
    const devices = Array.from(persistentDevices.values()).map(device => {
        const userBinding = userBindingsMap.get(device.deviceId) || {};
        
        return {
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
            ipAddress: device.ipAddress || device.publicIpAddress,
            apiLevel: device.apiLevel,
            // ✅ ADICIONAR DADOS DE USUÁRIO VINCULADO DO BANCO
            assignedDeviceUserId: userBinding.assignedDeviceUserId || null,
            assignedUserId: userBinding.assignedUserId || null,
            assignedUserName: userBinding.assignedUserName || null,
            assignedUserCpf: userBinding.assignedUserCpf || null
        };
    });
    
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
        
        // Não enviar confirmação ao dispositivo - usuário não deve saber que a mensagem foi recebida/lida
        
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
        
        // Garantir que o dispositivo está na lista (pode ter enviado support antes de device_status)
        if (!persistentDevices.has(data.deviceId)) {
            const minimalDevice = {
                deviceId: data.deviceId,
                name: data.deviceName || data.model || 'Dispositivo',
                model: data.model || '',
                status: connectedDevices.has(data.deviceId) ? 'online' : 'offline',
                lastSeen: Date.now(),
                androidVersion: data.androidVersion || ''
            };
            persistentDevices.set(data.deviceId, minimalDevice);
            saveDeviceToDatabase(minimalDevice).catch(err => log.warn('Erro ao salvar dispositivo da mensagem', { error: err.message }));
        }
        
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
const WS_PORT = parseInt(process.env.WEBSOCKET_PORT || '3001', 10);
server.listen(WS_PORT, '0.0.0.0', () => {
    log.info('Servidor HTTP/WebSocket iniciado', {
        port: WS_PORT,
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
    
    // Notificar TODOS os clientes web sobre a nova senha
    notifyWebClients({
        type: 'admin_password_response',
        password: password,
        timestamp: Date.now()
    });
    console.log('📤 Senha de administrador notificada para clientes web');
    
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

/**
 * Função para enviar comando de atualização de APK para dispositivos
 * @param {string|string[]} deviceIds - ID do dispositivo ou array de IDs, ou 'all' para todos
 * @param {string} apkUrl - URL do APK (ex: GitHub releases)
 * @param {string} version - Versão do APK (opcional)
 */
function sendAppUpdateCommand(deviceIds, apkUrl, version = 'latest') {
    console.log('═══════════════════════════════════════════════');
    console.log('📥 ENVIANDO COMANDO DE ATUALIZAÇÃO DE APK');
    console.log('═══════════════════════════════════════════════');
    console.log('Dispositivos:', deviceIds);
    console.log('URL do APK:', apkUrl);
    console.log('Versão:', version);
    
    const updateCommand = {
        type: 'update_app',
        data: {
            apk_url: apkUrl,
            version: version
        },
        timestamp: Date.now()
    };
    
    let targetDevices = [];
    
    if (deviceIds === 'all') {
        // Enviar para todos os dispositivos conectados
        targetDevices = Array.from(connectedDevices.keys());
        console.log(`📡 Enviando para TODOS os ${targetDevices.length} dispositivos conectados`);
    } else if (Array.isArray(deviceIds)) {
        targetDevices = deviceIds;
        console.log(`🎯 Enviando para ${targetDevices.length} dispositivos específicos`);
    } else if (typeof deviceIds === 'string') {
        targetDevices = [deviceIds];
        console.log(`🎯 Enviando para dispositivo específico: ${deviceIds}`);
    }
    
    let successCount = 0;
    let failedCount = 0;
    const results = [];
    
    targetDevices.forEach(deviceId => {
        const deviceWs = connectedDevices.get(deviceId);

        if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
            try {
                // Primeiro, garantir que restrição de instalação esteja liberada
                // Envia set_device_restrictions com installAppsDisabled=false antes do update
                const savedRestrictions = getRestrictionsForDevice(deviceId);
                if (savedRestrictions && savedRestrictions.installAppsDisabled) {
                    console.log(`🔓 Liberando restrição de instalação para ${deviceId} antes do update`);
                    const tempRestrictions = { ...savedRestrictions, installAppsDisabled: false };
                    deviceWs.send(JSON.stringify({
                        type: 'set_device_restrictions',
                        data: tempRestrictions,
                        timestamp: Date.now()
                    }));
                }
                deviceWs.send(JSON.stringify(updateCommand));
                successCount++;
                results.push({ deviceId, success: true, message: 'Comando enviado' });
                console.log(`✅ Comando enviado para dispositivo: ${deviceId}`);
            } catch (error) {
                failedCount++;
                results.push({ deviceId, success: false, message: error.message });
                console.error(`❌ Erro ao enviar para ${deviceId}:`, error);
            }
        } else {
            failedCount++;
            const status = deviceWs ? `desconectado (${deviceWs.readyState})` : 'não encontrado';
            results.push({ deviceId, success: false, message: status });
            console.warn(`⚠️ Dispositivo ${deviceId} ${status}`);
        }
    });
    
    console.log('═══════════════════════════════════════════════');
    console.log(`📊 Resultado: ${successCount} enviados, ${failedCount} falharam`);
    console.log('═══════════════════════════════════════════════');
    
    return {
        success: successCount > 0,
        successCount,
        failedCount,
        total: targetDevices.length,
        results
    };
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

// Map separado para computadores (UEM)
const connectedComputers = new Map(); // computerId -> WebSocket

// Handlers para computadores (UEM)
async function handleComputerStatus(ws, data) {
    const computerData = data.data;
    
    // Suportar tanto PascalCase (C#) quanto camelCase (JavaScript)
    const computerId = computerData?.computerId || computerData?.ComputerId;
    const name = computerData.name || computerData.Name;
    const osType = computerData.osType || computerData.OsType;
    const osVersion = computerData.osVersion || computerData.OsVersion;
    const osBuild = computerData.osBuild || computerData.OsBuild;
    const architecture = computerData.architecture || computerData.Architecture;
    const hostname = computerData.hostname || computerData.Hostname;
    const domain = computerData.domain || computerData.Domain;
    const loggedInUser = computerData.loggedInUser || computerData.LoggedInUser;
    const cpuModel = computerData.cpuModel || computerData.CpuModel;
    const cpuCores = computerData.cpuCores || computerData.CpuCores;
    const cpuThreads = computerData.cpuThreads || computerData.CpuThreads;
    const memoryTotal = computerData.memoryTotal || computerData.MemoryTotal || 0;
    const memoryUsed = computerData.memoryUsed || computerData.MemoryUsed || 0;
    const storageTotal = computerData.storageTotal || computerData.StorageTotal || 0;
    const storageUsed = computerData.storageUsed || computerData.StorageUsed || 0;
    const storageDrives = computerData.storageDrives || computerData.StorageDrives || [];
    const ipAddress = computerData.ipAddress || computerData.IpAddress;
    const macAddress = computerData.macAddress || computerData.MacAddress;
    const networkType = computerData.networkType || computerData.NetworkType;
    const wifiSSID = computerData.wifiSSID || computerData.WifiSSID;
    const isWifiEnabled = computerData.isWifiEnabled !== undefined ? computerData.isWifiEnabled : (computerData.IsWifiEnabled || false);
    const isBluetoothEnabled = computerData.isBluetoothEnabled !== undefined ? computerData.isBluetoothEnabled : (computerData.IsBluetoothEnabled || false);
    const agentVersion = computerData.agentVersion || computerData.AgentVersion;
    const agentInstalledAt = computerData.agentInstalledAt || computerData.AgentInstalledAt;
    const complianceStatus = computerData.complianceStatus || computerData.ComplianceStatus || 'unknown';
    const antivirusInstalled = computerData.antivirusInstalled !== undefined ? computerData.antivirusInstalled : (computerData.AntivirusInstalled || false);
    const antivirusEnabled = computerData.antivirusEnabled !== undefined ? computerData.antivirusEnabled : (computerData.AntivirusEnabled || false);
    const antivirusName = computerData.antivirusName || computerData.AntivirusName;
    const firewallEnabled = computerData.firewallEnabled !== undefined ? computerData.firewallEnabled : (computerData.FirewallEnabled || false);
    const encryptionEnabled = computerData.encryptionEnabled !== undefined ? computerData.encryptionEnabled : (computerData.EncryptionEnabled || false);
    const latitude = computerData.latitude !== undefined ? computerData.latitude : (computerData.Latitude !== null ? computerData.Latitude : undefined);
    const longitude = computerData.longitude !== undefined ? computerData.longitude : (computerData.Longitude !== null ? computerData.Longitude : undefined);
    const locationAccuracy = computerData.locationAccuracy !== undefined ? computerData.locationAccuracy : (computerData.LocationAccuracy !== null ? computerData.LocationAccuracy : undefined);
    const locationAddress = computerData.locationAddress || computerData.LocationAddress || null;
    const locationSource = computerData.locationSource || computerData.LocationSource || null;
    const lastLocationUpdate = computerData.lastLocationUpdate || computerData.LastLocationUpdate || (latitude && longitude ? now : undefined);
    const installedPrograms = computerData.installedPrograms || computerData.InstalledPrograms || [];
    
    const now = Date.now();
    
    if (!computerId || computerId === 'null' || computerId === 'undefined') {
        console.error('❌ ComputerId inválido:', computerId);
        console.error('Dados recebidos:', JSON.stringify(computerData, null, 2));
        return;
    }
    
    // Marcar como computador
    ws.isComputer = true;
    ws.computerId = computerId;
    
    // Salvar conexão do computador (separado de dispositivos móveis)
    connectedComputers.set(computerId, ws);
    
    // Marcar como online imediatamente quando detectamos que é um computador
    // Isso garante que o status seja atualizado mesmo antes de salvar os dados completos
    console.log(`🔌 Computador ${computerId} conectado - marcando como online`);
    ComputerModel.updateStatus(computerId, 'online').catch(err => {
        console.error('Erro ao atualizar status do computador para online:', err);
    });
    
    // Preparar dados para salvar no banco (usando valores mapeados)
    const computerToSave = {
        computerId: computerId,
        name: name || hostname || 'Computador',
        status: 'online',
        lastSeen: now,
        osType: osType || 'unknown',
        osVersion: osVersion || '',
        osBuild: osBuild,
        architecture: architecture || 'unknown',
        hostname: hostname,
        domain: domain,
        cpuModel: cpuModel,
        cpuCores: cpuCores,
        cpuThreads: cpuThreads,
        memoryTotal: memoryTotal,
        memoryUsed: memoryUsed,
        storageTotal: storageTotal,
        storageUsed: storageUsed,
        ipAddress: ipAddress,
        macAddress: macAddress,
        networkType: networkType,
        wifiSSID: wifiSSID,
        isWifiEnabled: isWifiEnabled,
        isBluetoothEnabled: isBluetoothEnabled,
        agentVersion: agentVersion,
        agentInstalledAt: agentInstalledAt,
        lastHeartbeat: now,
        loggedInUser: loggedInUser,
        assignedDeviceUserId: computerData.assignedDeviceUserId || null,
        complianceStatus: complianceStatus,
        antivirusInstalled: antivirusInstalled,
        antivirusEnabled: antivirusEnabled,
        antivirusName: antivirusName,
        firewallEnabled: firewallEnabled,
        encryptionEnabled: encryptionEnabled,
        latitude: latitude,
        longitude: longitude,
        locationAccuracy: locationAccuracy,
        locationAddress: locationAddress,
        locationSource: locationSource,
        lastLocationUpdate: lastLocationUpdate,
        storageDrives: storageDrives.map(drive => ({
            drive: drive.drive || drive.Drive,
            label: drive.label || drive.Label,
            fileSystem: drive.fileSystem || drive.FileSystem,
            total: drive.total || drive.Total || 0,
            used: drive.used || drive.Used || 0,
            free: drive.free || drive.Free || 0
        })),
        installedPrograms: installedPrograms.map(prog => ({
            name: prog.name || prog.Name,
            version: prog.version || prog.Version,
            publisher: prog.publisher || prog.Publisher,
            installDate: prog.installDate || prog.InstallDate,
            installLocation: prog.installLocation || prog.InstallLocation,
            size: prog.size || prog.Size
        })),
        restrictions: computerData.restrictions || {}
    };
    
    try {
        // Salvar no banco de dados (já com status 'online')
        await ComputerModel.upsert(computerToSave);
        
        console.log(`✅ Computador ${computerId} salvo no banco com status: online`);
        
        // Formatar computador para enviar aos clientes web (usando formato do frontend)
        const computerForClient = {
            id: computerToSave.computerId, // Usar computerId como ID temporário
            name: computerToSave.name,
            computerId: computerId,
            status: 'online',
            lastSeen: now,
            osType: computerToSave.osType,
            osVersion: computerToSave.osVersion,
            osBuild: computerToSave.osBuild,
            architecture: computerToSave.architecture,
            hostname: computerToSave.hostname,
            domain: computerToSave.domain,
            cpuModel: computerToSave.cpuModel,
            cpuCores: computerToSave.cpuCores,
            cpuThreads: computerToSave.cpuThreads,
            memoryTotal: computerToSave.memoryTotal,
            memoryUsed: computerToSave.memoryUsed,
            storageTotal: computerToSave.storageTotal,
            storageUsed: computerToSave.storageUsed,
            storageDrives: computerToSave.storageDrives,
            ipAddress: computerToSave.ipAddress,
            macAddress: computerToSave.macAddress,
            networkType: computerToSave.networkType,
            wifiSSID: computerToSave.wifiSSID,
            isWifiEnabled: computerToSave.isWifiEnabled,
            isBluetoothEnabled: computerToSave.isBluetoothEnabled,
            agentVersion: computerToSave.agentVersion,
            agentInstalledAt: computerToSave.agentInstalledAt,
            lastHeartbeat: now,
            loggedInUser: computerToSave.loggedInUser,
            assignedDeviceUserId: computerToSave.assignedDeviceUserId,
            complianceStatus: computerToSave.complianceStatus,
            antivirusInstalled: computerToSave.antivirusInstalled,
            antivirusEnabled: computerToSave.antivirusEnabled,
            antivirusName: computerToSave.antivirusName,
            firewallEnabled: computerToSave.firewallEnabled,
            encryptionEnabled: computerToSave.encryptionEnabled,
            latitude: computerToSave.latitude,
            longitude: computerToSave.longitude,
            locationAccuracy: computerToSave.locationAccuracy,
            lastLocationUpdate: computerToSave.lastLocationUpdate,
            restrictions: computerToSave.restrictions,
            installedPrograms: computerToSave.installedPrograms,
            installedProgramsCount: computerToSave.installedPrograms?.length || 0
        };
        
        // Notificar clientes web
        console.log(`📤 Notificando clientes web sobre atualização do computador ${computerId} (status: online)`);
        notifyWebClients({
            type: 'computer_status_update',
            computerId: computerId,
            computer: computerForClient,
            timestamp: now
        });
        
        // Enviar confirmação para o computador
        ws.send(JSON.stringify({
            type: 'computer_status_ack',
            computerId: computerId,
            timestamp: now
        }));
        
    } catch (error) {
        console.error('Erro ao processar status do computador:', error);
    }
}

async function handleUEMRemoteAction(ws, data) {
    const { computerId, action, params } = data;
    
    if (!computerId || !action) {
        console.warn('⚠️ handleUEMRemoteAction: computerId ou action ausente', { computerId, action });
        return;
    }
    
    // Buscar WebSocket do computador (usar connectedComputers, não connectedDevices)
    const computerWs = connectedComputers.get(computerId);
    
    if (!computerWs) {
        console.warn(`⚠️ Computador ${computerId} não encontrado na lista de computadores conectados`);
        const connectedIds = Array.from(connectedComputers.keys());
        console.warn(`   Computadores conectados (${connectedIds.length}):`, connectedIds.join(', ') || 'nenhum');
        return;
    }
    
    if (computerWs.readyState !== WebSocket.OPEN) {
        console.warn(`⚠️ Computador ${computerId} WebSocket não está aberto. Estado: ${computerWs.readyState}`);
        return;
    }
    
    // Enviar comando para o computador
    try {
        const message = {
            type: 'uem_remote_action',
            action: action,
            params: params || {},
            timestamp: Date.now()
        };
        const messageStr = JSON.stringify(message);
        computerWs.send(messageStr);
    } catch (error) {
        console.error(`❌ Erro ao enviar comando ${action} para computador ${computerId}:`, error);
    }
    
    // Notificar clientes web que o comando foi enviado (opcional, pode ser removido se não for necessário)
    // notifyWebClients({
    //     type: 'uem_remote_action_sent',
    //     computerId: computerId,
    //     action: action,
    //     timestamp: Date.now()
    // });
}

// Exportar connectedDevices e connectedComputers para uso em API routes
// Handlers para desktop remoto
const desktopSessions = new Map(); // sessionId -> { computerId, clientWs }
const webrtcSessions = new Map(); // sessionId -> { computerId, clientWs, computerWs }

async function handleDesktopFrame(ws, data) {
    const { sessionId, frame, timestamp } = data;
    
    // Não logar cada frame recebido (são muitos)
    if (!sessionId || !frame) {
        return;
    }

    // Buscar sessão ativa
    const session = desktopSessions.get(sessionId);
    if (!session) {
        // Sessão não encontrada - cliente já desconectou
        // Enviar comando para o agente parar a captura (ws é o próprio WebSocket do computador)
        if (ws.computerId && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'uem_remote_action',
                action: 'stop_remote_desktop',
                params: {},
                timestamp: Date.now()
            }));
        }
        return;
    }
    
    // Enviar frame para o cliente web que está visualizando
    if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
        // Se é o primeiro frame, enviar confirmação de que a sessão está ativa
        if (!session.firstFrameSent) {
            session.firstFrameSent = true;
            session.clientWs.send(JSON.stringify({
                type: 'session_active',
                sessionId: sessionId,
                message: 'Sessão de desktop remoto ativa'
            }));
            console.log(`✅ Sessão ${sessionId} confirmada como ativa (primeiro frame enviado)`);
        }
        
        session.clientWs.send(JSON.stringify({
            type: 'desktop_frame',
            sessionId: sessionId,
            frame: frame, // Base64 encoded JPEG
            timestamp: timestamp || Date.now()
        }));
    } else {
        // Cliente desconectou - remover sessão e parar captura no agente
        desktopSessions.delete(sessionId);
        const computerWs = connectedComputers.get(session.computerId);
        if (computerWs && computerWs.readyState === WebSocket.OPEN) {
            computerWs.send(JSON.stringify({
                type: 'uem_remote_action',
                action: 'stop_remote_desktop',
                params: {},
                timestamp: Date.now()
            }));
        }
    }
}

function handleRegisterDesktopSession(ws, data) {
    const { sessionId, computerId } = data;
    
    console.log(`📥 register_desktop_session recebido:`, {
        sessionId: sessionId,
        computerId: computerId,
        connectedComputersCount: connectedComputers.size,
        connectedComputerIds: Array.from(connectedComputers.keys())
    });
    
    if (!sessionId || !computerId) {
        console.warn(`⚠️ register_desktop_session inválido: sessionId=${sessionId}, computerId=${computerId}`);
        return;
    }

    // Registrar cliente web na sessão
    const session = desktopSessions.get(sessionId);
    if (session) {
        console.log(`📝 Sessão ${sessionId} já existe, atualizando cliente web`);
        session.clientWs = ws;
    } else {
        console.log(`🆕 Criando nova sessão: ${sessionId} para computador ${computerId}`);
        // Criar nova sessão se não existir
        startDesktopSession(sessionId, computerId, ws);
        
        // Iniciar sessão no agente (computador)
        const computerWs = connectedComputers.get(computerId);
        
        console.log(`🔍 Procurando computador ${computerId} na lista de conectados...`, {
            computerWsExists: !!computerWs,
            wsReadyState: computerWs?.readyState,
            wsConnectionId: computerWs?.connectionId
        });
        
        if (computerWs && computerWs.readyState === WebSocket.OPEN) {
            const command = {
                type: 'uem_remote_action',
                action: 'start_remote_desktop',
                params: { sessionId: sessionId },
                timestamp: Date.now()
            };
            const commandStr = JSON.stringify(command);
            computerWs.send(commandStr);
            console.log(`🖥️ Acesso remoto iniciado - Computer: ${computerId}`, {
                sessionId: sessionId,
                commandSize: commandStr.length,
                wsReadyState: computerWs.readyState,
                wsConnectionId: computerWs.connectionId
            });
        } else {
            console.warn(`⚠️ Não foi possível iniciar acesso remoto - Computer: ${computerId}`, {
                computerWsExists: !!computerWs,
                wsReadyState: computerWs?.readyState,
                sessionId: sessionId,
                availableComputerIds: Array.from(connectedComputers.keys())
            });
            
            // Enviar erro para o cliente web
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'desktop_session_error',
                    sessionId: sessionId,
                    error: 'Computador não está online. Verifique se o agente está rodando e conectado ao servidor.',
                    computerId: computerId
                }));
            }
        }
    }
}

function startDesktopSession(sessionId, computerId, clientWs) {
    desktopSessions.set(sessionId, {
        computerId: computerId,
        clientWs: clientWs,
        startedAt: Date.now(),
        firstFrameSent: false // Flag para enviar confirmação apenas uma vez
    });
    // Log apenas quando sessão é criada (já logado em handleRegisterDesktopSession)
}

function stopDesktopSession(sessionId) {
    const session = desktopSessions.get(sessionId);
    if (!session) {
        return;
    }
    
    // Enviar comando para o computador parar a sessão
    const computerWs = connectedComputers.get(session.computerId);
    if (computerWs && computerWs.readyState === WebSocket.OPEN) {
        computerWs.send(JSON.stringify({
            type: 'uem_remote_action',
            action: 'stop_remote_desktop',
            params: {},
            timestamp: Date.now()
        }));
        console.log(`⏹️ Acesso remoto encerrado - Computer: ${session.computerId}`);
    }
    
    // Remover sessão
    desktopSessions.delete(sessionId);
}

// Handlers para WebRTC
function handleRegisterWebRTCSession(ws, data) {
    const { sessionId, computerId } = data;
    
    if (!sessionId || !computerId) {
        console.error('❌ Sessão WebRTC inválida: falta sessionId ou computerId');
        return;
    }

    const computerWs = connectedComputers.get(computerId);
    if (!computerWs || computerWs.readyState !== WebSocket.OPEN) {
        console.error(`❌ Computador ${computerId} não está online para sessão WebRTC`);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'webrtc_error',
                sessionId: sessionId,
                error: 'Computador não está online'
            }));
        }
        return;
    }

    // Registrar ou atualizar sessão WebRTC
    if (webrtcSessions.has(sessionId)) {
        webrtcSessions.get(sessionId).clientWs = ws;
        console.log(`✅ Cliente web registrado na sessão WebRTC: ${sessionId}`);
    } else {
        webrtcSessions.set(sessionId, {
            computerId: computerId,
            clientWs: ws,
            computerWs: computerWs,
            startedAt: Date.now()
        });
        console.log(`✅ Nova sessão WebRTC criada: ${sessionId} para computador ${computerId}`);
        
        // Iniciar sessão WebRTC no agente
        computerWs.send(JSON.stringify({
            type: 'uem_remote_action',
            action: 'start_webrtc_session',
            params: { sessionId: sessionId },
            timestamp: Date.now()
        }));
        console.log(`📤 Comando para iniciar sessão WebRTC enviado ao computador ${computerId}`);
    }
}

function handleWebRTCOffer(ws, data) {
    const { sessionId, offer, computerId } = data;
    
    if (!sessionId || !offer) {
        console.error('❌ Offer WebRTC inválido: falta sessionId ou offer');
        return;
    }

    const session = webrtcSessions.get(sessionId);
    if (!session) {
        console.warn(`⚠️ Sessão WebRTC não encontrada: ${sessionId}`);
        return;
    }

    // Se o offer vem do cliente web, enviar para o agente
    if (ws === session.clientWs) {
        const computerWs = connectedComputers.get(session.computerId);
        if (computerWs && computerWs.readyState === WebSocket.OPEN) {
            computerWs.send(JSON.stringify({
                type: 'webrtc_offer',
                sessionId: sessionId,
                offer: offer,
                timestamp: Date.now()
            }));
            console.log(`📤 Offer WebRTC encaminhado do cliente para o agente: ${sessionId}`);
        }
    } else if (ws === session.computerWs) {
        // Se o offer vem do agente, enviar para o cliente web
        if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
            session.clientWs.send(JSON.stringify({
                type: 'webrtc_offer',
                sessionId: sessionId,
                offer: offer,
                timestamp: Date.now()
            }));
            console.log(`📤 Offer WebRTC encaminhado do agente para o cliente: ${sessionId}`);
        }
    }
}

function handleWebRTCAnswer(ws, data) {
    const { sessionId, answer, computerId } = data;
    
    if (!sessionId || !answer) {
        console.error('❌ Answer WebRTC inválido: falta sessionId ou answer');
        return;
    }

    const session = webrtcSessions.get(sessionId);
    if (!session) {
        console.warn(`⚠️ Sessão WebRTC não encontrada: ${sessionId}`);
        return;
    }

    // Se o answer vem do cliente web, enviar para o agente
    if (ws === session.clientWs) {
        const computerWs = connectedComputers.get(session.computerId);
        if (computerWs && computerWs.readyState === WebSocket.OPEN) {
            computerWs.send(JSON.stringify({
                type: 'webrtc_answer',
                sessionId: sessionId,
                answer: answer,
                timestamp: Date.now()
            }));
            console.log(`📤 Answer WebRTC encaminhado do cliente para o agente: ${sessionId}`);
        }
    } else if (ws === session.computerWs) {
        // Se o answer vem do agente, enviar para o cliente web
        if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
            session.clientWs.send(JSON.stringify({
                type: 'webrtc_answer',
                sessionId: sessionId,
                answer: answer,
                timestamp: Date.now()
            }));
            console.log(`📤 Answer WebRTC encaminhado do agente para o cliente: ${sessionId}`);
        }
    }
}

function handleWebRTCIceCandidate(ws, data) {
    const { sessionId, candidate, computerId } = data;
    
    if (!sessionId || !candidate) {
        console.error('❌ ICE candidate WebRTC inválido: falta sessionId ou candidate');
        return;
    }

    const session = webrtcSessions.get(sessionId);
    if (!session) {
        console.warn(`⚠️ Sessão WebRTC não encontrada: ${sessionId}`);
        return;
    }

    // Se o candidate vem do cliente web, enviar para o agente
    if (ws === session.clientWs) {
        const computerWs = connectedComputers.get(session.computerId);
        if (computerWs && computerWs.readyState === WebSocket.OPEN) {
            computerWs.send(JSON.stringify({
                type: 'webrtc_ice_candidate',
                sessionId: sessionId,
                candidate: candidate,
                timestamp: Date.now()
            }));
        }
    } else if (ws === session.computerWs) {
        // Se o candidate vem do agente, enviar para o cliente web
        if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
            session.clientWs.send(JSON.stringify({
                type: 'webrtc_ice_candidate',
                sessionId: sessionId,
                candidate: candidate,
                timestamp: Date.now()
            }));
        }
    }
}

function stopWebRTCSession(sessionId) {
    const session = webrtcSessions.get(sessionId);
    if (!session) {
        console.warn(`⚠️ Sessão WebRTC ${sessionId} não encontrada para parar`);
        return;
    }
    
    // Enviar comando para o computador parar a sessão WebRTC
    const computerWs = connectedComputers.get(session.computerId);
    if (computerWs && computerWs.readyState === WebSocket.OPEN) {
        computerWs.send(JSON.stringify({
            type: 'uem_remote_action',
            action: 'stop_webrtc_session',
            params: { sessionId: sessionId },
            timestamp: Date.now()
        }));
        console.log(`📤 Comando para parar sessão WebRTC enviado ao computador ${session.computerId}`);
    }
    
    // Remover sessão
    webrtcSessions.delete(sessionId);
    console.log(`✅ Sessão WebRTC parada: ${sessionId}`);
}

module.exports = {
    connectedDevices, // For mobile devices
    connectedComputers, // For UEM computers
    desktopSessions,
    webrtcSessions,
    startDesktopSession,
    stopDesktopSession,
    stopWebRTCSession
};
