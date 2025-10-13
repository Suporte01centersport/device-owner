// Configurações do Servidor WebSocket MDM

module.exports = {
    // Nível de Log (error, warn, info, debug)
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    // Configurações de Throttling
    MAX_PINGS_PER_MINUTE: parseInt(process.env.MAX_PINGS_PER_MINUTE) || 60,
    
    // Configurações de Timeout - AJUSTADAS PARA MAIOR ESTABILIDADE
    BASE_INACTIVITY_TIMEOUT: parseInt(process.env.BASE_INACTIVITY_TIMEOUT) || 90000, // 90s ao invés de 30s
    MAX_INACTIVITY_TIMEOUT: parseInt(process.env.MAX_INACTIVITY_TIMEOUT) || 180000, // 3min
    MIN_INACTIVITY_TIMEOUT: parseInt(process.env.MIN_INACTIVITY_TIMEOUT) || 60000, // 60s ao invés de 15s
    
    // Configurações de Monitor de Saúde
    HEALTH_SCORE_THRESHOLD: parseFloat(process.env.HEALTH_SCORE_THRESHOLD) || 0.5,
    
    // Configurações de Performance - SINCRONIZADAS COM CLIENTE
    HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL) || 30000, // 30s para sincronizar com cliente Android
    PING_PROBABILITY: parseFloat(process.env.PING_PROBABILITY) || 0.5, // Aumentado para melhor detecção
    PONG_TIMEOUT: parseInt(process.env.PONG_TIMEOUT) || 10000, // 10s para resposta de ping
    
    // Configurações de Reconexão
    MAX_RECONNECT_ATTEMPTS: parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 20,
    INITIAL_RECONNECT_DELAY: parseInt(process.env.INITIAL_RECONNECT_DELAY) || 1000,
    MAX_RECONNECT_DELAY: parseInt(process.env.MAX_RECONNECT_DELAY) || 30000
};
