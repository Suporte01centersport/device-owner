// Modelo de Device para PostgreSQL
const { queryWithRetry, withTransaction } = require('../connection');

class DeviceModel {
    // Buscar todos os dispositivos
    static async findAll() {
        const result = await queryWithRetry(`
            SELECT 
                d.*,
                json_agg(
                    json_build_object(
                        'id', ia.id,
                        'appName', ia.app_name,
                        'packageName', ia.package_name,
                        'versionName', ia.version_name,
                        'versionCode', ia.version_code,
                        'installTime', ia.install_time,
                        'updateTime', ia.update_time,
                        'isAllowed', ia.is_allowed,
                        'isEnabled', ia.is_enabled,
                        'isSystemApp', ia.is_system_app,
                        'iconBase64', ia.icon_base64
                    )
                ) FILTER (WHERE ia.id IS NOT NULL) as installed_apps,
                json_build_object(
                    'latitude', dl.latitude,
                    'longitude', dl.longitude,
                    'accuracy', dl.accuracy,
                    'altitude', dl.altitude,
                    'speed', dl.speed,
                    'bearing', dl.bearing,
                    'timestamp', dl.timestamp
                ) as location
            FROM devices d
            LEFT JOIN installed_apps ia ON d.id = ia.device_id
            LEFT JOIN LATERAL (
                SELECT * FROM device_locations 
                WHERE device_id = d.id 
                ORDER BY timestamp DESC 
                LIMIT 1
            ) dl ON true
            GROUP BY d.id, dl.latitude, dl.longitude, dl.accuracy, dl.altitude, dl.speed, dl.bearing, dl.timestamp
            ORDER BY d.last_seen DESC
        `);
        
        return result.rows.map(row => this.formatDevice(row));
    }

    // Buscar dispositivo por ID
    static async findByDeviceId(deviceId) {
        const result = await queryWithRetry(`
            SELECT 
                d.*,
                json_agg(
                    json_build_object(
                        'id', ia.id,
                        'appName', ia.app_name,
                        'packageName', ia.package_name,
                        'versionName', ia.version_name,
                        'versionCode', ia.version_code,
                        'installTime', ia.install_time,
                        'updateTime', ia.update_time,
                        'isAllowed', ia.is_allowed,
                        'isEnabled', ia.is_enabled,
                        'isSystemApp', ia.is_system_app,
                        'iconBase64', ia.icon_base64
                    )
                ) FILTER (WHERE ia.id IS NOT NULL) as installed_apps,
                json_build_object(
                    'latitude', dl.latitude,
                    'longitude', dl.longitude,
                    'accuracy', dl.accuracy,
                    'altitude', dl.altitude,
                    'speed', dl.speed,
                    'bearing', dl.bearing,
                    'timestamp', dl.timestamp
                ) as location
            FROM devices d
            LEFT JOIN installed_apps ia ON d.id = ia.device_id
            LEFT JOIN LATERAL (
                SELECT * FROM device_locations 
                WHERE device_id = d.id 
                ORDER BY timestamp DESC 
                LIMIT 1
            ) dl ON true
            WHERE d.device_id = $1
            GROUP BY d.id, dl.latitude, dl.longitude, dl.accuracy, dl.altitude, dl.speed, dl.bearing, dl.timestamp
        `, [deviceId]);
        
        return result.rows.length > 0 ? this.formatDevice(result.rows[0]) : null;
    }

    // Criar ou atualizar dispositivo
    static async upsert(deviceData) {
        return await withTransaction(async (client) => {
            // Inserir/atualizar dispositivo
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
                RETURNING id, device_id
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

            const { id: deviceDbId, device_id } = deviceResult.rows[0];

            // Atualizar aplicativos se fornecidos
            if (deviceData.installedApps && deviceData.installedApps.length > 0) {
                // Remover apps antigos
                await client.query('DELETE FROM installed_apps WHERE device_id = $1', [deviceDbId]);

                // Inserir novos apps
                for (const app of deviceData.installedApps) {
                    await client.query(`
                        INSERT INTO installed_apps (
                            device_id, app_name, package_name, version_name, version_code,
                            install_time, update_time, is_allowed, is_enabled, is_system_app, icon_base64
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    `, [
                        deviceDbId,
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

            // Atualizar localização se fornecida
            if (deviceData.location) {
                await client.query(`
                    INSERT INTO device_locations (
                        device_id, latitude, longitude, accuracy, altitude, speed, bearing
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    deviceDbId,
                    deviceData.location.latitude || null,
                    deviceData.location.longitude || null,
                    deviceData.location.accuracy || null,
                    deviceData.location.altitude || null,
                    deviceData.location.speed || null,
                    deviceData.location.bearing || null
                ]);
            }

            return device_id;
        });
    }

    // Atualizar status de conexão
    static async updateConnectionStatus(deviceId, isConnected, connectionId = null) {
        await queryWithRetry(`
            UPDATE devices 
            SET 
                is_connected = $2,
                connection_id = $3,
                connected_at = CASE WHEN $2 = true THEN NOW() ELSE connected_at END,
                last_seen = NOW(),
                updated_at = NOW()
            WHERE device_id = $1
        `, [deviceId, isConnected, connectionId]);
    }

    // Atualizar heartbeat
    static async updateHeartbeat(deviceId, batteryLevel = null, batteryStatus = null) {
        await queryWithRetry(`
            UPDATE devices 
            SET 
                last_seen = NOW(),
                battery_level = COALESCE($2, battery_level),
                battery_status = COALESCE($3, battery_status),
                updated_at = NOW()
            WHERE device_id = $1
        `, [deviceId, batteryLevel, batteryStatus]);
    }

    // Buscar dispositivos conectados
    static async findConnected() {
        const result = await queryWithRetry(`
            SELECT device_id, connection_id, connected_at, last_seen
            FROM devices 
            WHERE is_connected = true
            ORDER BY last_seen DESC
        `);
        
        return result.rows;
    }

    // Buscar dispositivos por status de bateria
    static async findByBatteryLevel(minLevel, maxLevel) {
        const result = await queryWithRetry(`
            SELECT device_id, battery_level, battery_status, last_seen
            FROM devices 
            WHERE battery_level BETWEEN $1 AND $2
            ORDER BY battery_level ASC
        `, [minLevel, maxLevel]);
        
        return result.rows;
    }

    // Estatísticas de dispositivos
    static async getStats() {
        const result = await queryWithRetry(`
            SELECT 
                COUNT(*) as total_devices,
                COUNT(*) FILTER (WHERE is_connected = true) as connected_devices,
                COUNT(*) FILTER (WHERE battery_level < 20) as low_battery_devices,
                COUNT(*) FILTER (WHERE last_seen < NOW() - INTERVAL '1 hour') as inactive_devices,
                AVG(battery_level) as avg_battery_level,
                COUNT(DISTINCT country) as countries_count
            FROM devices
        `);
        
        return result.rows[0];
    }

    // Formatar dispositivo para compatibilidade com frontend
    static formatDevice(row) {
        return {
            id: row.id,
            deviceId: row.device_id,
            deviceName: row.device_name,
            androidVersion: row.android_version,
            apiLevel: row.api_level,
            appVersion: row.app_version,
            batteryLevel: row.battery_level,
            batteryStatus: row.battery_status,
            country: row.country,
            cpuArchitecture: row.cpu_architecture,
            memoryUsed: row.memory_used,
            storageUsed: row.storage_used,
            lastSeen: row.last_seen ? row.last_seen.getTime() : null,
            connectionId: row.connection_id,
            connectedAt: row.connected_at ? row.connected_at.getTime() : null,
            isConnected: row.is_connected,
            installedApps: row.installed_apps || [],
            location: row.location,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = DeviceModel;
