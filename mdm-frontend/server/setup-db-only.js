#!/usr/bin/env node

// Script simplificado para configurar apenas o banco PostgreSQL
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupDatabaseOnly() {
    console.log('🔧 Configurando banco PostgreSQL para MDM Owner...\n');

    const client = new Client({
        host: 'localhost',
        port: 5432,
        database: 'mdmweb',
        user: 'postgres',
        password: '2486',
        ssl: false
    });

    try {
        await client.connect();
        console.log('✅ Conectado ao PostgreSQL');

        // Executar schema
        console.log('📊 Executando schema...');
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schema);
        console.log('✅ Schema executado');

        // Inserir dados iniciais
        console.log('📝 Inserindo dados iniciais...');
        
        // Organização padrão
        const orgResult = await client.query(`
            INSERT INTO organizations (name, slug, description) 
            VALUES ($1, $2, $3) 
            RETURNING id
        `, ['Organização Padrão', 'default', 'Organização padrão do sistema MDM']);
        
        const orgId = orgResult.rows[0].id;
        console.log('   ✅ Organização criada');

        // Usuário admin
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        await client.query(`
            INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role) 
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [orgId, 'admin@mdm.local', hashedPassword, 'Admin', 'Sistema', 'admin']);
        
        console.log('   ✅ Usuário admin criado');
        console.log('   📧 Email: admin@mdm.local');
        console.log('   🔑 Senha: admin123');

        // Configurações
        const configs = [
            { key: 'websocket_port', value: { port: 3002 }, desc: 'Porta WebSocket' },
            { key: 'heartbeat_interval', value: { interval: 10000 }, desc: 'Intervalo heartbeat' },
            { key: 'max_pings_per_minute', value: { max: 60 }, desc: 'Max pings/minuto' },
            { key: 'log_level', value: { level: 'info' }, desc: 'Nível de log' }
        ];
        
        for (const config of configs) {
            await client.query(`
                INSERT INTO system_configs (organization_id, config_key, config_value, description) 
                VALUES ($1, $2, $3, $4)
            `, [orgId, config.key, config.value, config.desc]);
        }
        
        console.log('   ✅ Configurações inseridas');

        await client.end();

        // Criar arquivo .env
        const envContent = `# Configurações do Banco de Dados PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mdmweb
DB_USER=postgres
DB_PASSWORD=2486
DB_SSL=false

# Configurações de Autenticação
ADMIN_PASSWORD=admin123
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Configurações do Servidor WebSocket
WEBSOCKET_PORT=3002
WEBSOCKET_HOST=0.0.0.0

# Configurações de Log
LOG_LEVEL=info

# Configurações de Performance
MAX_PINGS_PER_MINUTE=60
HEARTBEAT_INTERVAL=10000
PING_PROBABILITY=0.3

# Configurações de Timeout
BASE_INACTIVITY_TIMEOUT=30000
MAX_INACTIVITY_TIMEOUT=120000
MIN_INACTIVITY_TIMEOUT=15000

# Configurações de Reconexão
MAX_RECONNECT_ATTEMPTS=20
INITIAL_RECONNECT_DELAY=1000
MAX_RECONNECT_DELAY=30000

# Configurações de Saúde da Conexão
HEALTH_SCORE_THRESHOLD=0.5
`;

        fs.writeFileSync(path.join(__dirname, '..', '.env'), envContent);
        console.log('✅ Arquivo .env criado');

        console.log('\n🎉 Configuração concluída com sucesso!');
        console.log('\n📋 Próximos passos:');
        console.log('   1. Reinicie o servidor WebSocket: npm run websocket');
        console.log('   2. Conecte dispositivos Android');
        console.log('   3. Os dados serão salvos automaticamente no PostgreSQL');

    } catch (error) {
        console.error('\n❌ Erro:', error.message);
        process.exit(1);
    }
}

setupDatabaseOnly().catch(console.error);
