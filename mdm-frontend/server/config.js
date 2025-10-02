// Configurações do Servidor WebSocket MDM

module.exports = {
    // Nível de Log (error, warn, info, debug)
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    // Configurações de Throttling
    MAX_PINGS_PER_MINUTE: parseInt(process.env.MAX_PINGS_PER_MINUTE) || 60,
    
    // Configurações de Timeout Adaptativo
    BASE_INACTIVITY_TIMEOUT: parseInt(process.env.BASE_INACTIVITY_TIMEOUT) || 30000,
    MAX_INACTIVITY_TIMEOUT: parseInt(process.env.MAX_INACTIVITY_TIMEOUT) || 120000,
    MIN_INACTIVITY_TIMEOUT: parseInt(process.env.MIN_INACTIVITY_TIMEOUT) || 15000,
    
    // Configurações de Monitor de Saúde
    HEALTH_SCORE_THRESHOLD: parseFloat(process.env.HEALTH_SCORE_THRESHOLD) || 0.5,
    
    // Configurações de Performance
    HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL) || 10000,
    PING_PROBABILITY: parseFloat(process.env.PING_PROBABILITY) || 0.3,
    
    // Configurações de Reconexão
    MAX_RECONNECT_ATTEMPTS: parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 20,
    INITIAL_RECONNECT_DELAY: parseInt(process.env.INITIAL_RECONNECT_DELAY) || 1000,
    MAX_RECONNECT_DELAY: parseInt(process.env.MAX_RECONNECT_DELAY) || 30000
};
