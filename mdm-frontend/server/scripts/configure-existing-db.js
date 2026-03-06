#!/usr/bin/env node

// Script para configurar MDM Owner com banco PostgreSQL existente
// Execute: node configure-existing-db.js

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Interface para entrada do usuário
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function configureExistingDatabase() {
    console.log('🔧 Configurando MDM Owner com banco PostgreSQL existente...\n');

    try {
        // Coletar informações do banco
        console.log('📋 Informações do banco de dados:');
        const dbHost = await question('Host (localhost): ') || 'localhost';
        const dbPort = await question('Porta (5432): ') || '5432';
        const dbName = await question('Nome do banco: ');
        const dbUser = await question('Usuário: ');
        const dbPassword = await question('Senha: ');
        
        if (!dbName || !dbUser || !dbPassword) {
            console.error('❌ Nome do banco, usuário e senha são obrigatórios');
            process.exit(1);
        }

        // Testar conexão
        console.log('\n🔍 Testando conexão...');
        const client = new Client({
            host: dbHost,
            port: dbPort,
            database: dbName,
            user: dbUser,
            password: dbPassword,
            ssl: false
        });

        await client.connect();
        console.log('✅ Conexão estabelecida com sucesso!');

        // Verificar se já existem tabelas do MDM
        console.log('\n🔍 Verificando tabelas existentes...');
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('devices', 'organizations', 'users', 'device_groups')
        `);

        if (tablesResult.rows.length > 0) {
            console.log('⚠️ Encontradas tabelas do MDM existentes:');
            tablesResult.rows.forEach(row => console.log(`   - ${row.table_name}`));
            
            const overwrite = await question('\nDeseja recriar as tabelas? (y/N): ');
            if (overwrite.toLowerCase() === 'y') {
                console.log('🗑️ Removendo tabelas existentes...');
                await dropExistingTables(client);
            } else {
                console.log('ℹ️ Usando tabelas existentes');
            }
        }

        // Executar schema
        console.log('\n📊 Executando schema do MDM...');
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await client.query(schema);
            console.log('✅ Schema executado com sucesso');
        } else {
            console.error('❌ Arquivo schema.sql não encontrado');
            process.exit(1);
        }

        // Inserir dados iniciais
        console.log('\n📝 Inserindo dados iniciais...');
        await insertInitialData(client);
        console.log('✅ Dados iniciais inseridos');

        await client.end();

        // Criar arquivo .env
        console.log('\n📄 Criando arquivo de configuração...');
        const envContent = `# Configurações do Banco de Dados PostgreSQL
DB_HOST=${dbHost}
DB_PORT=${dbPort}
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_SSL=false

# Configurações de Autenticação
ADMIN_PASSWORD=admin123
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Configurações do Servidor WebSocket
WEBSOCKET_PORT=3001
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

        const envPath = path.join(__dirname, '..', '.env');
        fs.writeFileSync(envPath, envContent);
        console.log('✅ Arquivo .env criado');

        // Migrar dados dos arquivos JSON
        console.log('\n🔄 Migrando dados dos arquivos JSON...');
        await migrateFromJsonFiles(dbHost, dbPort, dbName, dbUser, dbPassword);

        console.log('\n🎉 Configuração concluída com sucesso!');
        console.log('\n📋 Próximos passos:');
        console.log('   1. Reinicie o servidor WebSocket: npm run websocket');
        console.log('   2. Teste a conectividade dos dispositivos');
        console.log('   3. Verifique se os dados estão sendo salvos no PostgreSQL');

    } catch (error) {
        console.error('\n❌ Erro durante a configuração:', error.message);
        console.log('\n🔧 Solução de problemas:');
        console.log('   1. Verifique as credenciais do banco de dados');
        console.log('   2. Confirme se o PostgreSQL está rodando');
        console.log('   3. Verifique se o usuário tem permissões adequadas');
        process.exit(1);
    } finally {
        rl.close();
    }
}

async function dropExistingTables(client) {
    const tables = [
        'audit_logs',
        'support_messages',
        'device_restrictions',
        'app_policies',
        'device_group_memberships',
        'device_groups',
        'installed_apps',
        'device_locations',
        'devices',
        'system_configs',
        'users',
        'organizations'
    ];

    for (const table of tables) {
        try {
            await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            console.log(`   ✅ Tabela ${table} removida`);
        } catch (error) {
            console.log(`   ⚠️ Erro ao remover ${table}: ${error.message}`);
        }
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
            const adminPassword = 'admin123';
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            
            await client.query(`
                INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [orgId, 'admin@mdm.local', hashedPassword, 'Admin', 'Sistema', 'admin']);
            
            console.log('   ✅ Usuário admin padrão criado');
            console.log('   📧 Email: admin@mdm.local');
            console.log('   🔑 Senha: admin123');
            
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

async function migrateFromJsonFiles(host, port, database, user, password) {
    try {
        const { Client } = require('pg');
        const client = new Client({
            host, port, database, user, password, ssl: false
        });

        await client.connect();

        // Obter organização padrão
        const orgResult = await client.query('SELECT id FROM organizations WHERE slug = $1', ['default']);
        if (orgResult.rows.length === 0) {
            throw new Error('Organização padrão não encontrada');
        }
        const orgId = orgResult.rows[0].id;

        // Migrar dispositivos
        const devicesPath = path.join(__dirname, 'devices.json');
        if (fs.existsSync(devicesPath)) {
            const devicesData = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            
            for (const device of devicesData) {
                // Converter deviceId para UUID válido se necessário
                let deviceId = device.deviceId;
                if (!deviceId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                    // Se não é UUID, converter para UUID válido
                    const crypto = require('crypto');
                    const hash = crypto.createHash('md5').update(deviceId).digest('hex');
                    deviceId = `${hash.substring(0,8)}-${hash.substring(8,12)}-${hash.substring(12,16)}-${hash.substring(16,20)}-${hash.substring(20,32)}`;
                }

                await client.query(`
                    INSERT INTO devices (
                        organization_id, device_id, name, model, manufacturer, android_version,
                        api_level, serial_number, imei, mac_address, ip_address, battery_level,
                        battery_status, is_charging, storage_total, storage_used, memory_total,
                        memory_used, cpu_architecture, screen_resolution, screen_density,
                        network_type, wifi_ssid, is_wifi_enabled, is_bluetooth_enabled,
                        is_location_enabled, is_developer_options_enabled, is_adb_enabled,
                        is_unknown_sources_enabled, is_device_owner, is_profile_owner,
                        is_kiosk_mode, app_version, timezone, language, country, status, last_seen
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                        $31, $32, $33, $34, $35, $36, $37, $38
                    ) ON CONFLICT (organization_id, device_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        model = EXCLUDED.model,
                        manufacturer = EXCLUDED.manufacturer,
                        android_version = EXCLUDED.android_version,
                        api_level = EXCLUDED.api_level,
                        serial_number = EXCLUDED.serial_number,
                        imei = EXCLUDED.imei,
                        mac_address = EXCLUDED.mac_address,
                        ip_address = EXCLUDED.ip_address,
                        battery_level = EXCLUDED.battery_level,
                        battery_status = EXCLUDED.battery_status,
                        is_charging = EXCLUDED.is_charging,
                        storage_total = EXCLUDED.storage_total,
                        storage_used = EXCLUDED.storage_used,
                        memory_total = EXCLUDED.memory_total,
                        memory_used = EXCLUDED.memory_used,
                        cpu_architecture = EXCLUDED.cpu_architecture,
                        screen_resolution = EXCLUDED.screen_resolution,
                        screen_density = EXCLUDED.screen_density,
                        network_type = EXCLUDED.network_type,
                        wifi_ssid = EXCLUDED.wifi_ssid,
                        is_wifi_enabled = EXCLUDED.is_wifi_enabled,
                        is_bluetooth_enabled = EXCLUDED.is_bluetooth_enabled,
                        is_location_enabled = EXCLUDED.is_location_enabled,
                        is_developer_options_enabled = EXCLUDED.is_developer_options_enabled,
                        is_adb_enabled = EXCLUDED.is_adb_enabled,
                        is_unknown_sources_enabled = EXCLUDED.is_unknown_sources_enabled,
                        is_device_owner = EXCLUDED.is_device_owner,
                        is_profile_owner = EXCLUDED.is_profile_owner,
                        is_kiosk_mode = EXCLUDED.is_kiosk_mode,
                        app_version = EXCLUDED.app_version,
                        timezone = EXCLUDED.timezone,
                        language = EXCLUDED.language,
                        country = EXCLUDED.country,
                        status = EXCLUDED.status,
                        last_seen = EXCLUDED.last_seen,
                        updated_at = NOW()
                `, [
                    orgId, deviceId, device.name, device.model, device.manufacturer,
                    device.androidVersion, device.apiLevel, device.serialNumber, device.imei,
                    device.macAddress, device.ipAddress, device.batteryLevel, device.batteryStatus,
                    device.isCharging, device.storageTotal, device.storageUsed, device.memoryTotal,
                    device.memoryUsed, device.cpuArchitecture, device.screenResolution,
                    device.screenDensity, device.networkType, device.wifiSSID, device.isWifiEnabled,
                    device.isBluetoothEnabled, device.isLocationEnabled, device.isDeveloperOptionsEnabled,
                    device.isAdbEnabled, device.isUnknownSourcesEnabled, device.isDeviceOwner,
                    device.isProfileOwner, device.isKioskMode, device.appVersion, device.timezone,
                    device.language, device.country, device.status || 'offline', 
                    device.lastSeen ? new Date(device.lastSeen) : new Date()
                ]);
            }
            
            console.log(`   ✅ ${devicesData.length} dispositivos migrados`);
        }

        // Migrar mensagens de suporte
        const supportPath = path.join(__dirname, 'support_messages.json');
        if (fs.existsSync(supportPath)) {
            const supportData = JSON.parse(fs.readFileSync(supportPath, 'utf8'));
            
            for (const message of supportData) {
                await client.query(`
                    INSERT INTO support_messages (
                        organization_id, device_id, device_name, message, android_version, model, status, received_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    orgId, message.deviceId, message.deviceName, message.message,
                    message.androidVersion, message.model, message.status || 'pending',
                    message.receivedAt ? new Date(message.receivedAt) : new Date()
                ]);
            }
            
            console.log(`   ✅ ${supportData.length} mensagens de suporte migradas`);
        }

        await client.end();

    } catch (error) {
        console.error('   ❌ Erro ao migrar dados do JSON:', error.message);
        throw error;
    }
}

// Executar configuração
if (require.main === module) {
    configureExistingDatabase().catch(console.error);
}

module.exports = { configureExistingDatabase };
