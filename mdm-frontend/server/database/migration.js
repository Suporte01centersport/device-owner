// Script de migração de JSON para PostgreSQL
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuração do banco PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mdm_owner',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

// Função para migrar dispositivos do JSON para PostgreSQL
async function migrateDevicesFromJSON() {
    const devicesPath = path.join(__dirname, '../devices.json');
    const adminPasswordPath = path.join(__dirname, '../admin_password.json');
    const supportMessagesPath = path.join(__dirname, '../support_messages.json');

    try {
        console.log('🔄 Iniciando migração de dados para PostgreSQL...');

        // Migrar dispositivos
        if (fs.existsSync(devicesPath)) {
            const devicesData = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            console.log(`📱 Migrando ${devicesData.length} dispositivos...`);

            for (const device of devicesData) {
                await migrateDevice(device);
            }
            console.log('✅ Dispositivos migrados com sucesso!');
        }

        // Migrar senha de administrador
        if (fs.existsSync(adminPasswordPath)) {
            const adminData = JSON.parse(fs.readFileSync(adminPasswordPath, 'utf8'));
            await migrateAdminPassword(adminData);
            console.log('✅ Senha de administrador migrada!');
        }

        // Migrar mensagens de suporte
        if (fs.existsSync(supportMessagesPath)) {
            const supportData = JSON.parse(fs.readFileSync(supportMessagesPath, 'utf8'));
            await migrateSupportMessages(supportData);
            console.log('✅ Mensagens de suporte migradas!');
        }

        console.log('🎉 Migração concluída com sucesso!');

    } catch (error) {
        console.error('❌ Erro durante a migração:', error);
        throw error;
    }
}

async function migrateDevice(deviceData) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Inserir dispositivo
        const deviceResult = await client.query(`
            INSERT INTO devices (
                device_id, device_name, android_version, api_level, app_version,
                battery_level, battery_status, country, cpu_architecture,
                memory_used, storage_used, last_seen, connection_id, connected_at, is_connected
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (device_id) DO UPDATE SET
                device_name = EXCLUDED.device_name,
                android_version = EXCLUDED.android_version,
                api_level = EXCLUDED.api_level,
                app_version = EXCLUDED.app_version,
                battery_level = EXCLUDED.battery_level,
                battery_status = EXCLUDED.battery_status,
                country = EXCLUDED.country,
                cpu_architecture = EXCLUDED.cpu_architecture,
                memory_used = EXCLUDED.memory_used,
                storage_used = EXCLUDED.storage_used,
                last_seen = EXCLUDED.last_seen,
                connection_id = EXCLUDED.connection_id,
                connected_at = EXCLUDED.connected_at,
                is_connected = EXCLUDED.is_connected,
                updated_at = NOW()
            RETURNING id
        `, [
            deviceData.deviceId,
            deviceData.deviceName || null,
            deviceData.androidVersion || null,
            deviceData.apiLevel || null,
            deviceData.appVersion || null,
            deviceData.batteryLevel || null,
            deviceData.batteryStatus || null,
            deviceData.country || null,
            deviceData.cpuArchitecture || null,
            deviceData.memoryUsed || null,
            deviceData.storageUsed || null,
            deviceData.lastSeen ? new Date(deviceData.lastSeen) : null,
            deviceData.connectionId || null,
            deviceData.connectedAt ? new Date(deviceData.connectedAt) : null,
            deviceData.isConnected || false
        ]);

        const deviceId = deviceResult.rows[0].id;

        // Migrar aplicativos instalados
        if (deviceData.installedApps && deviceData.installedApps.length > 0) {
            // Remover apps antigos
            await client.query('DELETE FROM installed_apps WHERE device_id = $1', [deviceId]);

            // Inserir novos apps
            for (const app of deviceData.installedApps) {
                await client.query(`
                    INSERT INTO installed_apps (
                        device_id, app_name, package_name, version_name, version_code,
                        install_time, update_time, is_allowed, is_enabled, is_system_app, icon_base64
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [
                    deviceId,
                    app.appName || null,
                    app.packageName || null,
                    app.versionName || null,
                    app.versionCode || null,
                    app.installTime ? new Date(app.installTime) : null,
                    app.updateTime ? new Date(app.updateTime) : null,
                    app.isAllowed || false,
                    app.isEnabled !== undefined ? app.isEnabled : true,
                    app.isSystemApp || false,
                    app.iconBase64 || null
                ]);
            }
        }

        // Migrar localização se existir
        if (deviceData.location) {
            await client.query(`
                INSERT INTO device_locations (
                    device_id, latitude, longitude, accuracy, altitude, speed, bearing
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                deviceId,
                deviceData.location.latitude || null,
                deviceData.location.longitude || null,
                deviceData.location.accuracy || null,
                deviceData.location.altitude || null,
                deviceData.location.speed || null,
                deviceData.location.bearing || null
            ]);
        }

        await client.query('COMMIT');
        console.log(`✅ Dispositivo ${deviceData.deviceId} migrado`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Erro ao migrar dispositivo ${deviceData.deviceId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function migrateAdminPassword(adminData) {
    const client = await pool.connect();
    
    try {
        await client.query(`
            INSERT INTO admin_passwords (password_hash, is_active)
            VALUES ($1, true)
            ON CONFLICT DO NOTHING
        `, [adminData.password]);
        
    } catch (error) {
        console.error('❌ Erro ao migrar senha de administrador:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function migrateSupportMessages(supportData) {
    const client = await pool.connect();
    
    try {
        for (const message of supportData) {
            // Buscar device_id pelo deviceId
            const deviceResult = await client.query(
                'SELECT id FROM devices WHERE device_id = $1',
                [message.deviceId]
            );

            if (deviceResult.rows.length > 0) {
                await client.query(`
                    INSERT INTO support_messages (device_id, message, message_type, timestamp)
                    VALUES ($1, $2, $3, $4)
                `, [
                    deviceResult.rows[0].id,
                    message.message,
                    message.type || 'info',
                    message.timestamp ? new Date(message.timestamp) : new Date()
                ]);
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao migrar mensagens de suporte:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Função para criar backup dos arquivos JSON
function createJSONBackup() {
    const backupDir = path.join(__dirname, '../backup');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}`);

    fs.mkdirSync(backupPath, { recursive: true });

    // Copiar arquivos JSON
    const files = ['devices.json', 'admin_password.json', 'support_messages.json'];
    files.forEach(file => {
        const sourcePath = path.join(__dirname, '..', file);
        const destPath = path.join(backupPath, file);
        
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
            console.log(`📁 Backup criado: ${file}`);
        }
    });

    return backupPath;
}

// Executar migração se chamado diretamente
if (require.main === module) {
    (async () => {
        try {
            console.log('🚀 Iniciando processo de migração...');
            
            // Criar backup
            const backupPath = createJSONBackup();
            console.log(`📦 Backup criado em: ${backupPath}`);
            
            // Executar migração
            await migrateDevicesFromJSON();
            
            console.log('🎉 Migração concluída! Os dados agora estão no PostgreSQL.');
            console.log('💡 Você pode remover os arquivos JSON após verificar se tudo está funcionando.');
            
        } catch (error) {
            console.error('💥 Falha na migração:', error);
            process.exit(1);
        } finally {
            await pool.end();
        }
    })();
}

module.exports = {
    migrateDevicesFromJSON,
    migrateDevice,
    migrateAdminPassword,
    migrateSupportMessages,
    createJSONBackup
};
