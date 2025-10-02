// Otimizações sugeridas para o sistema de conexão

// 1. Throttling de Ping para evitar sobrecarga
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

// 2. Timeout Adaptativo baseado na latência
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

// 3. Sistema de Logs Configurável
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
            console.log(`[${level.toUpperCase()}] ${message}`, data);
        }
    }
    
    error(message, data) { this.log('error', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    info(message, data) { this.log('info', message, data); }
    debug(message, data) { this.log('debug', message, data); }
}

// 4. Monitor de Saúde da Conexão
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

module.exports = {
    PingThrottler,
    AdaptiveTimeout,
    ConfigurableLogger,
    ConnectionHealthMonitor
};
