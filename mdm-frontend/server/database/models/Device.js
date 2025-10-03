// Modelo de Dispositivo para PostgreSQL
const { query, transaction } = require('../config');

class DeviceModel {
    // Criar ou atualizar dispositivo
    static async upsert(deviceData, organizationId = null) {
        try {
            // Se não especificou organização, usar padrão
            if (!organizationId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                organizationId = orgResult.rows[0].id;
            }
            const result = await query(`
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
                RETURNING *
            `, [
                organizationId, deviceData.deviceId, deviceData.name, deviceData.model,
                deviceData.manufacturer, deviceData.androidVersion, deviceData.apiLevel,
                deviceData.serialNumber, deviceData.imei, deviceData.macAddress,
                deviceData.ipAddress, deviceData.batteryLevel, deviceData.batteryStatus,
                deviceData.isCharging, deviceData.storageTotal, deviceData.storageUsed,
                deviceData.memoryTotal, deviceData.memoryUsed, deviceData.cpuArchitecture,
                deviceData.screenResolution, deviceData.screenDensity, deviceData.networkType,
                deviceData.wifiSSID, deviceData.isWifiEnabled, deviceData.isBluetoothEnabled,
                deviceData.isLocationEnabled, deviceData.isDeveloperOptionsEnabled,
                deviceData.isAdbEnabled, deviceData.isUnknownSourcesEnabled,
                deviceData.isDeviceOwner, deviceData.isProfileOwner, deviceData.isKioskMode,
                deviceData.appVersion, deviceData.timezone, deviceData.language,
                deviceData.country, deviceData.status || 'online',
                deviceData.lastSeen ? new Date(deviceData.lastSeen) : new Date()
            ]);

            return result.rows[0];
        } catch (error) {
            console.error('Erro ao salvar dispositivo:', error);
            throw error;
        }
    }

    // Buscar dispositivo por ID
    static async findById(deviceId, organizationId = null) {
        try {
            let queryText = `
                SELECT d.*, dr.*, o.name as organization_name
                FROM devices d
                LEFT JOIN device_restrictions dr ON d.id = dr.device_id
                LEFT JOIN organizations o ON d.organization_id = o.id
                WHERE d.device_id = $1
            `;
            let params = [deviceId];

            if (organizationId) {
                queryText += ' AND d.organization_id = $2';
                params.push(organizationId);
            }

            const result = await query(queryText, params);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar dispositivo:', error);
            throw error;
        }
    }

    // Listar todos os dispositivos
    static async findAll(organizationId = null, filters = {}) {
        try {
            let queryText = `
                SELECT d.*, dr.*, o.name as organization_name,
                       COUNT(ia.id) as installed_apps_count,
                       COUNT(dgm.id) as group_count
                FROM devices d
                LEFT JOIN device_restrictions dr ON d.id = dr.device_id
                LEFT JOIN organizations o ON d.organization_id = o.id
                LEFT JOIN installed_apps ia ON d.id = ia.device_id
                LEFT JOIN device_group_memberships dgm ON d.id = dgm.device_id
                WHERE 1=1
            `;
            let params = [];
            let paramCount = 0;

            if (organizationId) {
                paramCount++;
                queryText += ` AND d.organization_id = $${paramCount}`;
                params.push(organizationId);
            }

            if (filters.status) {
                paramCount++;
                queryText += ` AND d.status = $${paramCount}`;
                params.push(filters.status);
            }

            if (filters.search) {
                paramCount++;
                queryText += ` AND (d.name ILIKE $${paramCount} OR d.model ILIKE $${paramCount} OR d.device_id ILIKE $${paramCount})`;
                params.push(`%${filters.search}%`);
            }

            queryText += `
                GROUP BY d.id, dr.id, o.id
                ORDER BY d.last_seen DESC
            `;

            if (filters.limit) {
                paramCount++;
                queryText += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
            }

            if (filters.offset) {
                paramCount++;
                queryText += ` OFFSET $${paramCount}`;
                params.push(filters.offset);
            }

            const result = await query(queryText, params);
            
            // Mapear campos do PostgreSQL para o formato esperado pelo frontend
            return result.rows.map(device => ({
                id: device.id,
                deviceId: device.device_id,
                name: device.name || device.model || 'Dispositivo Desconhecido',
                model: device.model,
                manufacturer: device.manufacturer,
                androidVersion: device.android_version,
                apiLevel: device.api_level,
                serialNumber: device.serial_number || 'n/d',
                imei: device.imei || 'n/d',
                macAddress: device.mac_address,
                ipAddress: device.ip_address,
                batteryLevel: device.battery_level || 0,
                batteryStatus: device.battery_status,
                isCharging: device.is_charging,
                storageTotal: device.storage_total || 0,
                storageUsed: device.storage_used || 0,
                memoryTotal: device.memory_total || 0,
                memoryUsed: device.memory_used || 0,
                cpuArchitecture: device.cpu_architecture,
                screenResolution: device.screen_resolution,
                screenDensity: device.screen_density,
                networkType: device.network_type,
                wifiSSID: device.wifi_ssid,
                isWifiEnabled: device.is_wifi_enabled,
                isBluetoothEnabled: device.is_bluetooth_enabled,
                isLocationEnabled: device.is_location_enabled,
                isDeveloperOptionsEnabled: device.is_developer_options_enabled,
                isAdbEnabled: device.is_adb_enabled,
                isUnknownSourcesEnabled: device.is_unknown_sources_enabled,
                isDeviceOwner: device.is_device_owner,
                isProfileOwner: device.is_profile_owner,
                isKioskMode: device.is_kiosk_mode,
                appVersion: device.app_version,
                timezone: device.timezone,
                language: device.language,
                country: device.country,
                status: device.status,
                lastSeen: device.last_seen,
                installedAppsCount: parseInt(device.installed_apps_count) || 0,
                installedApps: [],
                allowedApps: [],
                restrictions: {
                    wifiDisabled: device.wifi_disabled || false,
                    bluetoothDisabled: device.bluetooth_disabled || false,
                    cameraDisabled: device.camera_disabled || false,
                    statusBarDisabled: device.status_bar_disabled || false,
                    installAppsDisabled: device.install_apps_disabled || false,
                    uninstallAppsDisabled: device.uninstall_apps_disabled || false,
                    settingsDisabled: device.settings_disabled || false,
                    systemNotificationsDisabled: device.system_notifications_disabled || false,
                    screenCaptureDisabled: device.screen_capture_disabled || false,
                    sharingDisabled: device.sharing_disabled || false,
                    outgoingCallsDisabled: device.outgoing_calls_disabled || false,
                    smsDisabled: device.sms_disabled || false,
                    userCreationDisabled: device.user_creation_disabled || false,
                    userRemovalDisabled: device.user_removal_disabled || false
                }
            }));
        } catch (error) {
            console.error('Erro ao listar dispositivos:', error);
            throw error;
        }
    }

    // Atualizar status do dispositivo
    static async updateStatus(deviceId, status, organizationId = null) {
        try {
            let queryText = 'UPDATE devices SET status = $1, last_seen = NOW(), updated_at = NOW() WHERE device_id = $2';
            let params = [status, deviceId];

            if (organizationId) {
                queryText += ' AND organization_id = $3';
                params.push(organizationId);
            }

            queryText += ' RETURNING *';

            const result = await query(queryText, params);
            return result.rows[0];
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            throw error;
        }
    }

    // Deletar dispositivo
    static async delete(deviceId, organizationId = null) {
        try {
            return await transaction(async (client) => {
                // Buscar ID interno do dispositivo
                let deviceQuery = 'SELECT id FROM devices WHERE device_id = $1';
                let deviceParams = [deviceId];

                if (organizationId) {
                    deviceQuery += ' AND organization_id = $2';
                    deviceParams.push(organizationId);
                }

                const deviceResult = await client.query(deviceQuery, deviceParams);
                if (deviceResult.rows.length === 0) {
                    throw new Error('Dispositivo não encontrado');
                }

                const deviceInternalId = deviceResult.rows[0].id;

                // Deletar dados relacionados (cascata)
                await client.query('DELETE FROM device_locations WHERE device_id = $1', [deviceInternalId]);
                await client.query('DELETE FROM installed_apps WHERE device_id = $1', [deviceInternalId]);
                await client.query('DELETE FROM device_group_memberships WHERE device_id = $1', [deviceInternalId]);
                await client.query('DELETE FROM device_restrictions WHERE device_id = $1', [deviceInternalId]);
                await client.query('DELETE FROM devices WHERE id = $1', [deviceInternalId]);

                return { success: true, message: 'Dispositivo deletado com sucesso' };
            });
        } catch (error) {
            console.error('Erro ao deletar dispositivo:', error);
            throw error;
        }
    }

    // Estatísticas dos dispositivos
    static async getStats(organizationId = null) {
        try {
            let queryText = `
            SELECT 
                COUNT(*) as total_devices,
                    COUNT(CASE WHEN status = 'online' THEN 1 END) as online_devices,
                    COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_devices,
                    COUNT(CASE WHEN is_device_owner = true THEN 1 END) as device_owner_count,
                    COUNT(CASE WHEN is_profile_owner = true THEN 1 END) as profile_owner_count,
                AVG(battery_level) as avg_battery_level,
                    COUNT(CASE WHEN battery_level < 20 THEN 1 END) as low_battery_count
            FROM devices
                WHERE 1=1
            `;
            let params = [];

            if (organizationId) {
                queryText += ' AND organization_id = $1';
                params.push(organizationId);
            }

            const result = await query(queryText, params);
        return result.rows[0];
        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            throw error;
        }
    }

    // Buscar dispositivos por grupo
    static async findByGroup(groupId, organizationId = null) {
        try {
            let queryText = `
                SELECT d.*, dr.*, dgm.assigned_at, dgm.assigned_by
                FROM devices d
                LEFT JOIN device_restrictions dr ON d.id = dr.device_id
                JOIN device_group_memberships dgm ON d.id = dgm.device_id
                WHERE dgm.group_id = $1
            `;
            let params = [groupId];

            if (organizationId) {
                queryText += ' AND d.organization_id = $2';
                params.push(organizationId);
            }

            queryText += ' ORDER BY d.last_seen DESC';

            const result = await query(queryText, params);
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar dispositivos por grupo:', error);
            throw error;
        }
    }
}

module.exports = DeviceModel;