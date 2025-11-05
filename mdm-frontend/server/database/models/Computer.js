// Modelo de Computador para PostgreSQL (UEM)
const { query, transaction } = require('../config');

class ComputerModel {
    // Criar ou atualizar computador
    static async upsert(computerData, organizationId = null) {
        try {
            // Se não especificou organização, usar padrão
            if (!organizationId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                if (orgResult.rows.length === 0) {
                    throw new Error('Organização padrão não encontrada');
                }
                organizationId = orgResult.rows[0].id;
            }

            const result = await query(`
                INSERT INTO computers (
                    organization_id, computer_id, name, status, last_seen,
                    os_type, os_version, os_build, architecture, hostname, domain,
                    cpu_model, cpu_cores, cpu_threads, memory_total, memory_used,
                    storage_total, storage_used, ip_address, mac_address, network_type,
                    wifi_ssid, is_wifi_enabled, is_bluetooth_enabled,
                    agent_version, agent_installed_at, last_heartbeat,
                    logged_in_user, assigned_device_user_id,
                    compliance_status, antivirus_installed, antivirus_enabled,
                    antivirus_name, firewall_enabled, encryption_enabled,
                    latitude, longitude, location_accuracy, last_location_update
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
                    $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39
                ) ON CONFLICT (organization_id, computer_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    status = EXCLUDED.status,
                    last_seen = EXCLUDED.last_seen,
                    os_type = EXCLUDED.os_type,
                    os_version = EXCLUDED.os_version,
                    os_build = EXCLUDED.os_build,
                    architecture = EXCLUDED.architecture,
                    hostname = EXCLUDED.hostname,
                    domain = EXCLUDED.domain,
                    cpu_model = EXCLUDED.cpu_model,
                    cpu_cores = EXCLUDED.cpu_cores,
                    cpu_threads = EXCLUDED.cpu_threads,
                    memory_total = EXCLUDED.memory_total,
                    memory_used = EXCLUDED.memory_used,
                    storage_total = EXCLUDED.storage_total,
                    storage_used = EXCLUDED.storage_used,
                    ip_address = EXCLUDED.ip_address,
                    mac_address = EXCLUDED.mac_address,
                    network_type = EXCLUDED.network_type,
                    wifi_ssid = EXCLUDED.wifi_ssid,
                    is_wifi_enabled = EXCLUDED.is_wifi_enabled,
                    is_bluetooth_enabled = EXCLUDED.is_bluetooth_enabled,
                    agent_version = EXCLUDED.agent_version,
                    last_heartbeat = EXCLUDED.last_heartbeat,
                    logged_in_user = EXCLUDED.logged_in_user,
                    assigned_device_user_id = EXCLUDED.assigned_device_user_id,
                    compliance_status = EXCLUDED.compliance_status,
                    antivirus_installed = EXCLUDED.antivirus_installed,
                    antivirus_enabled = EXCLUDED.antivirus_enabled,
                    antivirus_name = EXCLUDED.antivirus_name,
                    firewall_enabled = EXCLUDED.firewall_enabled,
                    encryption_enabled = EXCLUDED.encryption_enabled,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    location_accuracy = EXCLUDED.location_accuracy,
                    last_location_update = EXCLUDED.last_location_update,
                    updated_at = NOW()
                RETURNING *
            `, [
                organizationId,
                computerData.computerId,
                computerData.name || null,
                computerData.status || 'offline',
                computerData.lastSeen ? new Date(computerData.lastSeen) : new Date(),
                computerData.osType || 'unknown',
                computerData.osVersion || null,
                computerData.osBuild || null,
                computerData.architecture || null,
                computerData.hostname || null,
                computerData.domain || null,
                computerData.cpuModel || null,
                computerData.cpuCores || null,
                computerData.cpuThreads || null,
                computerData.memoryTotal || 0,
                computerData.memoryUsed || 0,
                computerData.storageTotal || 0,
                computerData.storageUsed || 0,
                computerData.ipAddress || null,
                computerData.macAddress || null,
                computerData.networkType || null,
                computerData.wifiSSID || null,
                computerData.isWifiEnabled || false,
                computerData.isBluetoothEnabled || false,
                computerData.agentVersion || null,
                computerData.agentInstalledAt ? new Date(computerData.agentInstalledAt) : null,
                computerData.lastHeartbeat ? new Date(computerData.lastHeartbeat) : null,
                computerData.loggedInUser || null,
                computerData.assignedDeviceUserId || null,
                computerData.complianceStatus || 'unknown',
                computerData.antivirusInstalled || false,
                computerData.antivirusEnabled || false,
                computerData.antivirusName || null,
                computerData.firewallEnabled || false,
                computerData.encryptionEnabled || false,
                computerData.latitude || null,
                computerData.longitude || null,
                computerData.locationAccuracy || null,
                computerData.lastLocationUpdate ? new Date(computerData.lastLocationUpdate) : null
            ]);

            const computer = result.rows[0];

            // Atualizar storage drives
            if (computerData.storageDrives && Array.isArray(computerData.storageDrives)) {
                await this.updateStorageDrives(computer.id, computerData.storageDrives);
            }

            // Atualizar programas instalados
            if (computerData.installedPrograms && Array.isArray(computerData.installedPrograms)) {
                await this.updateInstalledPrograms(computer.id, computerData.installedPrograms);
            }

            // Atualizar restrições
            if (computerData.restrictions) {
                await this.updateRestrictions(computer.id, computerData.restrictions);
            }

            // Salvar localização se fornecida
            if (computerData.latitude && computerData.longitude) {
                await this.saveLocation(computer.id, {
                    latitude: computerData.latitude,
                    longitude: computerData.longitude,
                    accuracy: computerData.locationAccuracy,
                    address: computerData.address
                });
            }

            return computer;
        } catch (error) {
            console.error('Erro ao criar/atualizar computador:', error);
            throw error;
        }
    }

    // Buscar todos os computadores
    static async findAll(organizationId = null) {
        try {
            if (!organizationId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                if (orgResult.rows.length === 0) {
                    return [];
                }
                organizationId = orgResult.rows[0].id;
            }

            const result = await query(`
                SELECT c.*, 
                       du.user_id as assigned_user_id,
                       du.name as assigned_user_name,
                       du.cpf as assigned_user_cpf,
                       du.email as assigned_user_email
                FROM computers c
                LEFT JOIN device_users du ON c.assigned_device_user_id = du.id
                WHERE c.organization_id = $1
                ORDER BY c.last_seen DESC
            `, [organizationId]);

            const computers = await Promise.all(result.rows.map(async (row) => {
                const computer = await this.formatComputer(row);
                return computer;
            }));

            return computers;
        } catch (error) {
            console.error('Erro ao buscar computadores:', error);
            throw error;
        }
    }

    // Buscar computador por ID
    static async findById(computerId, organizationId = null) {
        try {
            if (!organizationId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                if (orgResult.rows.length === 0) {
                    return null;
                }
                organizationId = orgResult.rows[0].id;
            }

            const result = await query(`
                SELECT c.*, 
                       du.user_id as assigned_user_id,
                       du.name as assigned_user_name,
                       du.cpf as assigned_user_cpf,
                       du.email as assigned_user_email
                FROM computers c
                LEFT JOIN device_users du ON c.assigned_device_user_id = du.id
                WHERE c.computer_id = $1 AND c.organization_id = $2
            `, [computerId, organizationId]);

            if (result.rows.length === 0) {
                return null;
            }

            return await this.formatComputer(result.rows[0]);
        } catch (error) {
            console.error('Erro ao buscar computador:', error);
            throw error;
        }
    }

    // Deletar computador
    static async delete(computerId, organizationId = null) {
        try {
            if (!organizationId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                if (orgResult.rows.length === 0) {
                    throw new Error('Organização padrão não encontrada');
                }
                organizationId = orgResult.rows[0].id;
            }

            const result = await query(`
                DELETE FROM computers 
                WHERE computer_id = $1 AND organization_id = $2
                RETURNING *
            `, [computerId, organizationId]);

            return result.rows.length > 0;
        } catch (error) {
            console.error('Erro ao deletar computador:', error);
            throw error;
        }
    }

    // Atualizar status do computador
    static async updateStatus(computerId, status, organizationId = null) {
        try {
            if (!organizationId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                if (orgResult.rows.length === 0) {
                    throw new Error('Organização padrão não encontrada');
                }
                organizationId = orgResult.rows[0].id;
            }

            await query(`
                UPDATE computers 
                SET status = $1, last_seen = NOW(), last_heartbeat = NOW()
                WHERE computer_id = $2 AND organization_id = $3
            `, [status, computerId, organizationId]);
        } catch (error) {
            console.error('Erro ao atualizar status do computador:', error);
            throw error;
        }
    }

    // Atualizar storage drives
    static async updateStorageDrives(computerDbId, drives) {
        try {
            // Deletar drives antigos
            await query('DELETE FROM computer_storage_drives WHERE computer_id = $1', [computerDbId]);

            // Inserir novos drives
            for (const drive of drives) {
                await query(`
                    INSERT INTO computer_storage_drives 
                    (computer_id, drive, label, file_system, total, used, free)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    computerDbId,
                    drive.drive,
                    drive.label || null,
                    drive.fileSystem || null,
                    drive.total || 0,
                    drive.used || 0,
                    drive.free || 0
                ]);
            }
        } catch (error) {
            console.error('Erro ao atualizar storage drives:', error);
            throw error;
        }
    }

    // Atualizar programas instalados
    static async updateInstalledPrograms(computerDbId, programs) {
        try {
            // Deletar programas antigos
            await query('DELETE FROM computer_installed_programs WHERE computer_id = $1', [computerDbId]);

            // Inserir novos programas (limitar a 1000 para evitar problemas)
            const programsToInsert = programs.slice(0, 1000);
            for (const program of programsToInsert) {
                await query(`
                    INSERT INTO computer_installed_programs 
                    (computer_id, name, version, publisher, install_date, install_location, size)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (computer_id, name, version) DO UPDATE SET
                        publisher = EXCLUDED.publisher,
                        install_date = EXCLUDED.install_date,
                        install_location = EXCLUDED.install_location,
                        size = EXCLUDED.size
                `, [
                    computerDbId,
                    program.name,
                    program.version || null,
                    program.publisher || null,
                    program.installDate ? new Date(program.installDate) : null,
                    program.installLocation || null,
                    program.size || null
                ]);
            }
        } catch (error) {
            console.error('Erro ao atualizar programas instalados:', error);
            throw error;
        }
    }

    // Atualizar restrições
    static async updateRestrictions(computerDbId, restrictions) {
        try {
            await query(`
                INSERT INTO computer_restrictions (
                    computer_id, camera_disabled, screen_capture_disabled,
                    bluetooth_disabled, usb_data_transfer_disabled, wifi_disabled,
                    factory_reset_disabled, safe_boot_disabled, status_bar_disabled,
                    usb_devices_blocked, cd_rom_disabled, printer_install_disabled,
                    remote_desktop_disabled
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                ) ON CONFLICT (computer_id) DO UPDATE SET
                    camera_disabled = EXCLUDED.camera_disabled,
                    screen_capture_disabled = EXCLUDED.screen_capture_disabled,
                    bluetooth_disabled = EXCLUDED.bluetooth_disabled,
                    usb_data_transfer_disabled = EXCLUDED.usb_data_transfer_disabled,
                    wifi_disabled = EXCLUDED.wifi_disabled,
                    factory_reset_disabled = EXCLUDED.factory_reset_disabled,
                    safe_boot_disabled = EXCLUDED.safe_boot_disabled,
                    status_bar_disabled = EXCLUDED.status_bar_disabled,
                    usb_devices_blocked = EXCLUDED.usb_devices_blocked,
                    cd_rom_disabled = EXCLUDED.cd_rom_disabled,
                    printer_install_disabled = EXCLUDED.printer_install_disabled,
                    remote_desktop_disabled = EXCLUDED.remote_desktop_disabled
            `, [
                computerDbId,
                restrictions.cameraDisabled || false,
                restrictions.screenCaptureDisabled || false,
                restrictions.bluetoothDisabled || false,
                restrictions.usbDataTransferDisabled || false,
                restrictions.wifiDisabled || false,
                restrictions.factoryResetDisabled !== undefined ? restrictions.factoryResetDisabled : true,
                restrictions.safeBootDisabled !== undefined ? restrictions.safeBootDisabled : true,
                restrictions.statusBarDisabled || false,
                restrictions.usbDevicesBlocked || false,
                restrictions.cdRomDisabled || false,
                restrictions.printerInstallDisabled || false,
                restrictions.remoteDesktopDisabled || false
            ]);
        } catch (error) {
            console.error('Erro ao atualizar restrições:', error);
            throw error;
        }
    }

    // Salvar localização
    static async saveLocation(computerDbId, location) {
        try {
            await query(`
                INSERT INTO computer_locations 
                (computer_id, latitude, longitude, accuracy, address)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                computerDbId,
                location.latitude,
                location.longitude,
                location.accuracy || null,
                location.address || null
            ]);
        } catch (error) {
            console.error('Erro ao salvar localização:', error);
            throw error;
        }
    }

    // Formatar computador para resposta
    static async formatComputer(row) {
        const computer = {
            id: row.id,
            name: row.name || 'Computador sem nome',
            computerId: row.computer_id,
            status: row.status || 'offline',
            lastSeen: row.last_seen ? new Date(row.last_seen).getTime() : Date.now(),
            osType: row.os_type || 'unknown',
            osVersion: row.os_version || '',
            osBuild: row.os_build,
            architecture: row.architecture || 'unknown',
            hostname: row.hostname,
            domain: row.domain,
            cpuModel: row.cpu_model,
            cpuCores: row.cpu_cores,
            cpuThreads: row.cpu_threads,
            memoryTotal: parseInt(row.memory_total) || 0,
            memoryUsed: parseInt(row.memory_used) || 0,
            storageTotal: parseInt(row.storage_total) || 0,
            storageUsed: parseInt(row.storage_used) || 0,
            ipAddress: row.ip_address,
            macAddress: row.mac_address,
            networkType: row.network_type,
            wifiSSID: row.wifi_ssid,
            isWifiEnabled: row.is_wifi_enabled || false,
            isBluetoothEnabled: row.is_bluetooth_enabled || false,
            agentVersion: row.agent_version,
            agentInstalledAt: row.agent_installed_at ? new Date(row.agent_installed_at).getTime() : undefined,
            lastHeartbeat: row.last_heartbeat ? new Date(row.last_heartbeat).getTime() : undefined,
            loggedInUser: row.logged_in_user,
            assignedDeviceUserId: row.assigned_device_user_id,
            assignedUserId: row.assigned_user_id,
            assignedUserName: row.assigned_user_name,
            complianceStatus: row.compliance_status || 'unknown',
            antivirusInstalled: row.antivirus_installed || false,
            antivirusEnabled: row.antivirus_enabled || false,
            antivirusName: row.antivirus_name,
            firewallEnabled: row.firewall_enabled || false,
            encryptionEnabled: row.encryption_enabled || false,
            latitude: row.latitude ? parseFloat(row.latitude) : undefined,
            longitude: row.longitude ? parseFloat(row.longitude) : undefined,
            locationAccuracy: row.location_accuracy ? parseFloat(row.location_accuracy) : undefined,
            lastLocationUpdate: row.last_location_update ? new Date(row.last_location_update).getTime() : undefined,
            restrictions: {
                cameraDisabled: false,
                screenCaptureDisabled: false,
                bluetoothDisabled: false,
                usbDataTransferDisabled: false,
                wifiDisabled: false,
                factoryResetDisabled: true,
                safeBootDisabled: true,
                statusBarDisabled: false,
                usbDevicesBlocked: false,
                cdRomDisabled: false,
                printerInstallDisabled: false,
                remoteDesktopDisabled: false
            },
            installedPrograms: [],
            installedProgramsCount: 0
        };

        // Buscar storage drives
        const drivesResult = await query(
            'SELECT * FROM computer_storage_drives WHERE computer_id = $1',
            [row.id]
        );
        computer.storageDrives = drivesResult.rows.map(d => ({
            drive: d.drive,
            label: d.label,
            fileSystem: d.file_system,
            total: parseInt(d.total) || 0,
            used: parseInt(d.used) || 0,
            free: parseInt(d.free) || 0
        }));

        // Buscar programas instalados
        const programsResult = await query(
            'SELECT * FROM computer_installed_programs WHERE computer_id = $1 ORDER BY name LIMIT 500',
            [row.id]
        );
        computer.installedPrograms = programsResult.rows.map(p => ({
            name: p.name,
            version: p.version,
            publisher: p.publisher,
            installDate: p.install_date ? new Date(p.install_date).getTime() : undefined,
            installLocation: p.install_location,
            size: p.size ? parseInt(p.size) : undefined
        }));
        computer.installedProgramsCount = programsResult.rows.length;

        // Buscar restrições
        const restrictionsResult = await query(
            'SELECT * FROM computer_restrictions WHERE computer_id = $1',
            [row.id]
        );
        if (restrictionsResult.rows.length > 0) {
            const r = restrictionsResult.rows[0];
            computer.restrictions = {
                cameraDisabled: r.camera_disabled || false,
                screenCaptureDisabled: r.screen_capture_disabled || false,
                bluetoothDisabled: r.bluetooth_disabled || false,
                usbDataTransferDisabled: r.usb_data_transfer_disabled || false,
                wifiDisabled: r.wifi_disabled || false,
                factoryResetDisabled: r.factory_reset_disabled !== undefined ? r.factory_reset_disabled : true,
                safeBootDisabled: r.safe_boot_disabled !== undefined ? r.safe_boot_disabled : true,
                statusBarDisabled: r.status_bar_disabled || false,
                usbDevicesBlocked: r.usb_devices_blocked || false,
                cdRomDisabled: r.cd_rom_disabled || false,
                printerInstallDisabled: r.printer_install_disabled || false,
                remoteDesktopDisabled: r.remote_desktop_disabled || false
            };
        }

        return computer;
    }
}

module.exports = ComputerModel;


