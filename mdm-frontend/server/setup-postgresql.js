#!/usr/bin/env node

// Script de setup do PostgreSQL para MDM Owner
// Execute: node setup-postgresql.js

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configurações do banco de dados
const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
    ssl: false
};

async function setupDatabase() {
    console.log('🚀 Configurando PostgreSQL para MDM Owner...\n');

    const client = new Client(dbConfig);

    try {
        // Conectar ao PostgreSQL
        console.log('1️⃣ Conectando ao PostgreSQL...');
        await client.connect();
        console.log('✅ Conectado ao PostgreSQL');

        // Criar banco de dados se não existir
        console.log('\n2️⃣ Criando banco de dados...');
        const dbName = process.env.DB_NAME || 'mdm_owner';
        
        try {
            await client.query(`CREATE DATABASE ${dbName}`);
            console.log(`✅ Banco de dados "${dbName}" criado`);
        } catch (error) {
            if (error.code === '42P04') {
                console.log(`ℹ️ Banco de dados "${dbName}" já existe`);
            } else {
                throw error;
            }
        }

        // Criar usuário se não existir
        console.log('\n3️⃣ Criando usuário do banco...');
        const dbUser = process.env.DB_USER || 'mdm_user';
        const dbPassword = process.env.DB_PASSWORD || 'mdm_password';
        
        try {
            await client.query(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
            console.log(`✅ Usuário "${dbUser}" criado`);
        } catch (error) {
            if (error.code === '42710') {
                console.log(`ℹ️ Usuário "${dbUser}" já existe`);
            } else {
                throw error;
            }
        }

        // Conceder privilégios
        console.log('\n4️⃣ Concedendo privilégios...');
        await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser}`);
        await client.query(`ALTER USER ${dbUser} CREATEDB`);
        console.log('✅ Privilégios concedidos');

        // Fechar conexão atual
        await client.end();

        // Conectar ao banco específico
        console.log('\n5️⃣ Conectando ao banco específico...');
        const dbClient = new Client({
            ...dbConfig,
            database: dbName
        });

        await dbClient.connect();
        console.log(`✅ Conectado ao banco "${dbName}"`);

        // Executar schema
        console.log('\n6️⃣ Executando schema do banco...');
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await dbClient.query(schema);
            console.log('✅ Schema executado com sucesso');
        } else {
            console.log('⚠️ Arquivo schema.sql não encontrado');
        }

        // Inserir dados iniciais
        console.log('\n7️⃣ Inserindo dados iniciais...');
        await insertInitialData(dbClient);
        console.log('✅ Dados iniciais inseridos');

        await dbClient.end();

        console.log('\n🎉 Setup do PostgreSQL concluído com sucesso!');
        console.log('\n📋 Informações de conexão:');
        console.log(`   Host: ${dbConfig.host}`);
        console.log(`   Port: ${dbConfig.port}`);
        console.log(`   Database: ${dbName}`);
        console.log(`   User: ${dbUser}`);
        console.log(`   Password: ${dbPassword}`);
        
        console.log('\n📋 Próximos passos:');
        console.log('   1. Configure as variáveis de ambiente');
        console.log('   2. Execute: node migrate-to-postgresql.js');
        console.log('   3. Reinicie o servidor WebSocket');

    } catch (error) {
        console.error('\n❌ Erro durante o setup:', error.message);
        console.log('\n🔧 Solução de problemas:');
        console.log('   1. Verifique se o PostgreSQL está rodando');
        console.log('   2. Confirme as credenciais do usuário postgres');
        console.log('   3. Verifique se o usuário tem permissões para criar bancos');
        process.exit(1);
    }
}

async function insertInitialData(client) {
    try {
        // Verificar se já existe organização padrão
        const orgResult = await client.query('SELECT id FROM organizations WHERE slug = $1', ['default']);
        
        if (orgResult.rows.length === 0) {
            // Criar organização padrão
            const orgInsert = await client.query(`
                INSERT INTO organizations (name, slug, description) 
                VALUES ($1, $2, $3) 
                RETURNING id
            `, ['Organização Padrão', 'default', 'Organização padrão do sistema MDM']);
            
            const orgId = orgInsert.rows[0].id;
            console.log('   ✅ Organização padrão criada');

            // Criar usuário admin padrão
            const bcrypt = require('bcrypt');
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            
            await client.query(`
                INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [orgId, 'admin@mdm.local', hashedPassword, 'Admin', 'Sistema', 'admin']);
            
            console.log('   ✅ Usuário admin padrão criado');
            
            // Inserir configurações padrão
            const defaultConfigs = [
                {
                    key: 'websocket_port',
                    value: { port: 3002 },
                    description: 'Porta do servidor WebSocket'
                },
                {
                    key: 'heartbeat_interval',
                    value: { interval: 10000 },
                    description: 'Intervalo do heartbeat em ms'
                },
                {
                    key: 'max_pings_per_minute',
                    value: { max: 60 },
                    description: 'Máximo de pings por minuto por dispositivo'
                },
                {
                    key: 'log_level',
                    value: { level: 'info' },
                    description: 'Nível de log do sistema'
                }
            ];
            
            for (const config of defaultConfigs) {
                await client.query(`
                    INSERT INTO system_configs (organization_id, config_key, config_value, description) 
                    VALUES ($1, $2, $3, $4)
                `, [orgId, config.key, config.value, config.description]);
            }
            
            console.log('   ✅ Configurações padrão inseridas');
        } else {
            console.log('   ℹ️ Dados iniciais já existem');
        }
        
    } catch (error) {
        console.error('   ❌ Erro ao inserir dados iniciais:', error.message);
        throw error;
    }
}

// Executar setup
if (require.main === module) {
    setupDatabase().catch(console.error);
}

module.exports = { setupDatabase };
