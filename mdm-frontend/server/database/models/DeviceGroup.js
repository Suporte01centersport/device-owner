// Modelo de Grupo de Dispositivos para PostgreSQL
const { query, transaction } = require('../config');

class DeviceGroupModel {
    // Criar grupo
    static async create(groupData, organizationId = null) {
        try {
            // Se não especificou organização, usar padrão
            if (!organizationId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                organizationId = orgResult.rows[0].id;
            }

            const result = await query(`
                INSERT INTO device_groups (organization_id, name, description, color)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [organizationId, groupData.name, groupData.description, groupData.color || '#3B82F6']);

            return result.rows[0];
        } catch (error) {
            console.error('Erro ao criar grupo:', error);
            throw error;
        }
    }

    // Buscar grupo por ID
    static async findById(groupId, organizationId = null) {
        try {
            let queryText = `
                SELECT dg.*, o.name as organization_name,
                       COUNT(dgm.device_id) as device_count
                FROM device_groups dg
                LEFT JOIN organizations o ON dg.organization_id = o.id
                LEFT JOIN device_group_memberships dgm ON dg.id = dgm.group_id
                WHERE dg.id = $1
            `;
            let params = [groupId];

            if (organizationId) {
                queryText += ' AND dg.organization_id = $2';
                params.push(organizationId);
            }

            queryText += ' GROUP BY dg.id, o.id';

            const result = await query(queryText, params);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar grupo:', error);
            throw error;
        }
    }

    // Listar todos os grupos
    static async findAll(organizationId = null, filters = {}) {
        try {
            let queryText = `
                SELECT dg.*, o.name as organization_name,
                       COUNT(dgm.device_id) as device_count
                FROM device_groups dg
                LEFT JOIN organizations o ON dg.organization_id = o.id
                LEFT JOIN device_group_memberships dgm ON dg.id = dgm.group_id
                WHERE 1=1
            `;
            let params = [];
            let paramCount = 0;

            if (organizationId) {
                paramCount++;
                queryText += ` AND dg.organization_id = $${paramCount}`;
                params.push(organizationId);
            }

            if (filters.search) {
                paramCount++;
                queryText += ` AND (dg.name ILIKE $${paramCount} OR dg.description ILIKE $${paramCount})`;
                params.push(`%${filters.search}%`);
            }

            queryText += `
                GROUP BY dg.id, o.id
                ORDER BY dg.created_at DESC
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
            return result.rows;
        } catch (error) {
            console.error('Erro ao listar grupos:', error);
            throw error;
        }
    }

    // Atualizar grupo
    static async update(groupId, updateData, organizationId = null) {
        try {
            const updates = [];
            const params = [];
            let paramCount = 0;

            if (updateData.name !== undefined) {
                paramCount++;
                updates.push(`name = $${paramCount}`);
                params.push(updateData.name);
            }
            if (updateData.description !== undefined) {
                paramCount++;
                updates.push(`description = $${paramCount}`);
                params.push(updateData.description);
            }
            if (updateData.color !== undefined) {
                paramCount++;
                updates.push(`color = $${paramCount}`);
                params.push(updateData.color);
            }
            if (updateData.allowed_networks !== undefined) {
                paramCount++;
                updates.push(`allowed_networks = $${paramCount}`);
                params.push(updateData.allowed_networks);
            }
            if (updateData.allowed_location !== undefined) {
                paramCount++;
                updates.push(`allowed_location = $${paramCount}`);
                params.push(JSON.stringify(updateData.allowed_location));
            }

            if (updates.length === 0) {
                throw new Error('Nenhum campo para atualizar');
            }

            updates.push('updated_at = NOW()');

            let queryText = `
                UPDATE device_groups 
                SET ${updates.join(', ')}
                WHERE id = $${++paramCount}
            `;
            params.push(groupId);

            if (organizationId) {
                queryText += ` AND organization_id = $${++paramCount}`;
                params.push(organizationId);
            }

            queryText += ' RETURNING *';

            const result = await query(queryText, params);
            return result.rows[0];
        } catch (error) {
            console.error('Erro ao atualizar grupo:', error);
            throw error;
        }
    }

    // Obter configurações de rede e localização permitidas
    static async getRestrictions(groupId) {
        try {
            const result = await query(`
                SELECT allowed_networks, allowed_location
                FROM device_groups
                WHERE id = $1
            `, [groupId]);
            return result.rows[0] || { allowed_networks: [], allowed_location: null };
        } catch (error) {
            console.error('Erro ao buscar restrições do grupo:', error);
            throw error;
        }
    }

    // Deletar grupo
    static async delete(groupId, organizationId = null) {
        try {
            return await transaction(async (client) => {
                // Verificar se grupo existe
                let groupQuery = 'SELECT id FROM device_groups WHERE id = $1';
                let groupParams = [groupId];

                if (organizationId) {
                    groupQuery += ' AND organization_id = $2';
                    groupParams.push(organizationId);
                }

                const groupResult = await client.query(groupQuery, groupParams);
                if (groupResult.rows.length === 0) {
                    throw new Error('Grupo não encontrado');
                }

                // Deletar dados relacionados (cascata)
                await client.query('DELETE FROM device_group_memberships WHERE group_id = $1', [groupId]);
                await client.query('DELETE FROM app_policies WHERE group_id = $1', [groupId]);
                await client.query('DELETE FROM device_groups WHERE id = $1', [groupId]);

                return { success: true, message: 'Grupo deletado com sucesso' };
            });
        } catch (error) {
            console.error('Erro ao deletar grupo:', error);
            throw error;
        }
    }

    // Adicionar dispositivo ao grupo
    static async addDevice(groupId, deviceId, assignedBy = null, organizationId = null) {
        try {
            return await transaction(async (client) => {
                // Verificar se grupo existe
                let groupQuery = 'SELECT id FROM device_groups WHERE id = $1';
                let groupParams = [groupId];

                if (organizationId) {
                    groupQuery += ' AND organization_id = $2';
                    groupParams.push(organizationId);
                }

                const groupResult = await client.query(groupQuery, groupParams);
                if (groupResult.rows.length === 0) {
                    throw new Error('Grupo não encontrado');
                }

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

                // Adicionar dispositivo ao grupo
                const result = await client.query(`
                    INSERT INTO device_group_memberships (device_id, group_id, assigned_by)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (device_id, group_id) DO UPDATE SET
                        assigned_at = NOW()
                    RETURNING *
                `, [deviceInternalId, groupId, assignedBy]);

                return result.rows[0];
            });
        } catch (error) {
            console.error('Erro ao adicionar dispositivo ao grupo:', error);
            throw error;
        }
    }

    // Remover dispositivo do grupo
    static async removeDevice(groupId, deviceId, organizationId = null) {
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

                // Remover dispositivo do grupo
                const result = await client.query(`
                    DELETE FROM device_group_memberships 
                    WHERE device_id = $1 AND group_id = $2
                    RETURNING *
                `, [deviceInternalId, groupId]);

                if (result.rows.length === 0) {
                    throw new Error('Dispositivo não está no grupo');
                }

                return { success: true, message: 'Dispositivo removido do grupo com sucesso' };
            });
        } catch (error) {
            console.error('Erro ao remover dispositivo do grupo:', error);
            throw error;
        }
    }

    // Listar dispositivos do grupo
    static async getGroupDevices(groupId, organizationId = null) {
        try {
            let queryText = `
                SELECT 
                    d.*, 
                    dr.*, 
                    dgm.assigned_at, 
                    dgm.assigned_by,
                    u.first_name, 
                    u.last_name,
                    dl.latitude as location_latitude,
                    dl.longitude as location_longitude,
                    dl.accuracy as location_accuracy,
                    dl.provider as location_provider,
                    dl.address as location_address,
                    dl.created_at as location_created_at
                FROM devices d
                LEFT JOIN device_restrictions dr ON d.id = dr.device_id
                JOIN device_group_memberships dgm ON d.id = dgm.device_id
                LEFT JOIN users u ON dgm.assigned_by = u.id
                LEFT JOIN LATERAL (
                    SELECT latitude, longitude, accuracy, provider, address, created_at
                    FROM device_locations
                    WHERE device_id = d.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) dl ON true
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
            console.error('Erro ao listar dispositivos do grupo:', error);
            throw error;
        }
    }

    // Estatísticas do grupo
    static async getGroupStats(groupId, organizationId = null) {
        try {
            let queryText = `
                SELECT 
                    COUNT(d.id) as total_devices,
                    COUNT(CASE WHEN d.status = 'online' THEN 1 END) as online_devices,
                    COUNT(CASE WHEN d.status = 'offline' THEN 1 END) as offline_devices,
                    AVG(d.battery_level) as avg_battery_level,
                    COUNT(CASE WHEN d.battery_level < 20 THEN 1 END) as low_battery_count
                FROM devices d
                JOIN device_group_memberships dgm ON d.id = dgm.device_id
                WHERE dgm.group_id = $1
            `;
            let params = [groupId];

            if (organizationId) {
                queryText += ' AND d.organization_id = $2';
                params.push(organizationId);
            }

            const result = await query(queryText, params);
            return result.rows[0];
        } catch (error) {
            console.error('Erro ao buscar estatísticas do grupo:', error);
            throw error;
        }
    }

    // Adicionar política de app ao grupo
    static async addAppPolicy(groupId, policyData, organizationId = null) {
        try {
            return await transaction(async (client) => {
                // Verificar se grupo existe
                let groupQuery = 'SELECT id, organization_id FROM device_groups WHERE id = $1';
                let groupParams = [groupId];

                if (organizationId) {
                    groupQuery += ' AND organization_id = $2';
                    groupParams.push(organizationId);
                }

                const groupResult = await client.query(groupQuery, groupParams);
                if (groupResult.rows.length === 0) {
                    throw new Error('Grupo não encontrado');
                }

                const orgId = groupResult.rows[0].organization_id;

                // Inserir ou atualizar política
                const result = await client.query(`
                    INSERT INTO app_policies (organization_id, group_id, package_name, app_name, policy_type)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (group_id, package_name) DO UPDATE SET
                        app_name = EXCLUDED.app_name,
                        policy_type = EXCLUDED.policy_type,
                        updated_at = NOW()
                    RETURNING *
                `, [orgId, groupId, policyData.packageName, policyData.appName, policyData.policyType || 'allow']);

                return result.rows[0];
            });
        } catch (error) {
            console.error('Erro ao adicionar política de app:', error);
            throw error;
        }
    }

    // Remover política de app do grupo
    static async removeAppPolicy(groupId, packageName, organizationId = null) {
        try {
            return await transaction(async (client) => {
                let queryText = `
                    DELETE FROM app_policies 
                    WHERE group_id = $1 AND package_name = $2
                `;
                let params = [groupId, packageName];

                if (organizationId) {
                    queryText += ' AND organization_id = $3';
                    params.push(organizationId);
                }

                queryText += ' RETURNING *';

                const result = await client.query(queryText, params);
                if (result.rows.length === 0) {
                    throw new Error('Política não encontrada');
                }

                return { success: true, message: 'Política removida com sucesso' };
            });
        } catch (error) {
            console.error('Erro ao remover política de app:', error);
            throw error;
        }
    }

    // Buscar políticas de apps do grupo
    static async getGroupPolicies(groupId, organizationId = null) {
        try {
            let queryText = `
                SELECT id, package_name, app_name, policy_type, created_at, updated_at
                FROM app_policies
                WHERE group_id = $1
            `;
            let params = [groupId];

            if (organizationId) {
                queryText += ' AND organization_id = $2';
                params.push(organizationId);
            }

            queryText += ' ORDER BY app_name ASC';

            const result = await query(queryText, params);
            return result.rows;
        } catch (error) {
            console.error('Erro ao buscar políticas do grupo:', error);
            throw error;
        }
    }

    // Sincronizar apps disponíveis do grupo com base nos apps instalados dos dispositivos
    static async syncGroupAvailableApps(groupId, deviceApps) {
        try {
            // deviceApps é um array de objetos: { deviceId, apps: [{ packageName, appName, icon }] }
            return await transaction(async (client) => {
                const appsMap = new Map(); // packageName -> { appName, icon, deviceIds }

                // Consolidar apps de todos os dispositivos
                for (const deviceData of deviceApps) {
                    const deviceId = deviceData.deviceId;
                    const apps = deviceData.apps || [];

                    for (const app of apps) {
                        const packageName = app.packageName;
                        if (!packageName) continue;

                        if (!appsMap.has(packageName)) {
                            appsMap.set(packageName, {
                                appName: app.appName || packageName,
                                icon: app.icon || null,
                                deviceIds: []
                            });
                        }

                        const appData = appsMap.get(packageName);
                        if (!appData.deviceIds.includes(deviceId)) {
                            appData.deviceIds.push(deviceId);
                        }

                        // Usar o appName mais completo se disponível
                        if (app.appName && app.appName.length > appData.appName.length) {
                            appData.appName = app.appName;
                        }

                        // Usar o ícone se não tiver ainda
                        if (!appData.icon && app.icon) {
                            appData.icon = app.icon;
                        }
                    }
                }

                // Inserir ou atualizar apps no banco
                for (const [packageName, appData] of appsMap.entries()) {
                    // Mesclar deviceIds existentes com os novos
                    const existingResult = await client.query(`
                        SELECT seen_in_devices 
                        FROM group_available_apps 
                        WHERE group_id = $1 AND package_name = $2
                    `, [groupId, packageName]);

                    let mergedDeviceIds = appData.deviceIds || [];
                    if (existingResult.rows.length > 0 && existingResult.rows[0].seen_in_devices) {
                        const existingIds = existingResult.rows[0].seen_in_devices;
                        mergedDeviceIds = [...new Set([...existingIds, ...appData.deviceIds])];
                    }

                    await client.query(`
                        INSERT INTO group_available_apps (
                            group_id, package_name, app_name, icon_base64,
                            seen_in_devices, first_seen_at, last_seen_at
                        )
                        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                        ON CONFLICT (group_id, package_name) DO UPDATE SET
                            app_name = EXCLUDED.app_name,
                            icon_base64 = COALESCE(EXCLUDED.icon_base64, group_available_apps.icon_base64),
                            seen_in_devices = $5,
                            last_seen_at = NOW()
                    `, [
                        groupId,
                        packageName,
                        appData.appName,
                        appData.icon,
                        mergedDeviceIds
                    ]);
                }

                return { synced: appsMap.size };
            });
        } catch (error) {
            console.error('Erro ao sincronizar apps do grupo:', error);
            throw error;
        }
    }

    // Buscar apps disponíveis do grupo
    static async getGroupAvailableApps(groupId) {
        try {
            const result = await query(`
                SELECT 
                    package_name,
                    app_name,
                    icon_base64 as icon,
                    seen_in_devices,
                    first_seen_at,
                    last_seen_at
                FROM group_available_apps
                WHERE group_id = $1
                ORDER BY app_name ASC
            `, [groupId]);

            return result.rows.map(row => ({
                packageName: row.package_name,
                appName: row.app_name,
                icon: row.icon,
                seenInDevices: row.seen_in_devices || [],
                firstSeenAt: row.first_seen_at,
                lastSeenAt: row.last_seen_at
            }));
        } catch (error) {
            console.error('Erro ao buscar apps disponíveis do grupo:', error);
            throw error;
        }
    }
}

module.exports = DeviceGroupModel;