// Configuração PostgreSQL para MDM Owner
const { Pool } = require('pg');

// Configurações do banco de dados
const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mdmweb',
    password: process.env.DB_PASSWORD, // Deve ser definido no .env - não usar string vazia
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20, // Máximo de conexões no pool
    idleTimeoutMillis: 30000, // Tempo para fechar conexões inativas
    connectionTimeoutMillis: 2000, // Tempo limite para conexão
};

// Pool de conexões
const pool = new Pool(dbConfig);

// Event listeners para monitoramento
pool.on('connect', (client) => {
    console.log('Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err) => {
    console.error('Erro inesperado no pool PostgreSQL:', err);
    process.exit(-1);
});

// Função para executar queries
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Query executada', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Erro na query:', { text, error: error.message });
        throw error;
    }
};

// Função para transações
const transaction = async (callback) => {
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
};

// Função para testar conexão
const testConnection = async () => {
    try {
        const result = await query('SELECT NOW()');
        console.log('✅ Conexão PostgreSQL estabelecida:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar PostgreSQL:', error.message);
        return false;
    }
};

// Função para inicializar banco (criar tabelas se não existirem)
const initializeDatabase = async () => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Ler schema SQL
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Executar schema
        await query(schema);
        console.log('✅ Schema PostgreSQL inicializado com sucesso');
        
        // Inserir dados iniciais se necessário
        await insertInitialData();
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco PostgreSQL:', error.message);
        throw error;
    }
};

// Função para inserir dados iniciais
const insertInitialData = async () => {
    try {
        // Verificar se já existe organização padrão
        const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
        
        if (orgResult.rows.length === 0) {
            // Criar organização padrão
            const orgInsert = await query(`
                INSERT INTO organizations (name, slug, description) 
                VALUES ($1, $2, $3) 
                RETURNING id
            `, ['Organização Padrão', 'default', 'Organização padrão do sistema MDM']);
            
            const orgId = orgInsert.rows[0].id;
            console.log('✅ Organização padrão criada:', orgId);
            
            // Criar usuário admin padrão
            const bcrypt = require('bcrypt');
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin@123';
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            
            await query(`
                INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [orgId, 'admin@mdm.local', hashedPassword, 'Admin', 'Sistema', 'admin']);
            
            console.log('✅ Usuário admin padrão criado');
            
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
                await query(`
                    INSERT INTO system_configs (organization_id, config_key, config_value, description) 
                    VALUES ($1, $2, $3, $4)
                `, [orgId, config.key, config.value, config.description]);
            }
            
            console.log('✅ Configurações padrão inseridas');
        }
        
    } catch (error) {
        console.error('❌ Erro ao inserir dados iniciais:', error.message);
        throw error;
    }
};

// Função para migrar dados dos arquivos JSON
const migrateFromJson = async () => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Obter organização padrão
        const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
        if (orgResult.rows.length === 0) {
            throw new Error('Organização padrão não encontrada');
        }
        const orgId = orgResult.rows[0].id;
        
        // Migrar dispositivos
        const devicesPath = path.join(__dirname, '..', 'devices.json');
        if (fs.existsSync(devicesPath)) {
            const devicesData = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            
            for (const device of devicesData) {
                await query(`
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
                    orgId, device.deviceId, device.name, device.model, device.manufacturer,
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
            
            console.log(`✅ ${devicesData.length} dispositivos migrados do JSON`);
        }
        
        // Migrar mensagens de suporte
        const supportPath = path.join(__dirname, '..', 'support_messages.json');
        if (fs.existsSync(supportPath)) {
            const supportData = JSON.parse(fs.readFileSync(supportPath, 'utf8'));
            
            for (const message of supportData) {
                await query(`
                    INSERT INTO support_messages (
                        organization_id, device_id, device_name, message, android_version, model, status, received_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    orgId, message.deviceId, message.deviceName, message.message,
                    message.androidVersion, message.model, message.status || 'pending',
                    message.receivedAt ? new Date(message.receivedAt) : new Date()
                ]);
            }
            
            console.log(`✅ ${supportData.length} mensagens de suporte migradas do JSON`);
        }
        
    } catch (error) {
        console.error('❌ Erro ao migrar dados do JSON:', error.message);
        throw error;
    }
};

module.exports = {
    pool,
    query,
    transaction,
    testConnection,
    initializeDatabase,
    migrateFromJson
};
