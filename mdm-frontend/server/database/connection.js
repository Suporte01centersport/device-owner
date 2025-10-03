// Configuração de conexão com PostgreSQL
const { Pool } = require('pg');

// Configuração do pool de conexões (otimizado para ScaleFusion)
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mdmweb',
    password: process.env.DB_PASSWORD || '2486',
    port: process.env.DB_PORT || 5432,
    
    // Configurações de pool otimizadas
    max: 20, // máximo de conexões no pool
    min: 5,  // mínimo de conexões no pool
    idleTimeoutMillis: 30000, // tempo para fechar conexões idle
    connectionTimeoutMillis: 2000, // timeout para conexão
    
    // Configurações de SSL (para produção)
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Event listeners para monitoramento
pool.on('connect', (client) => {
    console.log('🔗 Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err, client) => {
    console.error('❌ Erro inesperado no cliente PostgreSQL:', err);
});

pool.on('remove', (client) => {
    console.log('🔌 Cliente PostgreSQL removido do pool');
});

// Função para testar conexão
async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('✅ Conexão PostgreSQL OK:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Erro na conexão PostgreSQL:', error);
        return false;
    }
}

// Função para executar queries com retry automático
async function queryWithRetry(text, params = [], maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await pool.query(text, params);
            return result;
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ Tentativa ${attempt}/${maxRetries} falhou:`, error.message);
            
            if (attempt < maxRetries) {
                // Esperar antes de tentar novamente (backoff exponencial)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    throw lastError;
}

// Função para transações
async function withTransaction(callback) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Função para fechar pool (para shutdown graceful)
async function closePool() {
    try {
        await pool.end();
        console.log('🔌 Pool PostgreSQL fechado');
    } catch (error) {
        console.error('❌ Erro ao fechar pool PostgreSQL:', error);
    }
}

// Graceful shutdown
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = {
    pool,
    query: pool.query.bind(pool),
    queryWithRetry,
    withTransaction,
    testConnection,
    closePool
};
