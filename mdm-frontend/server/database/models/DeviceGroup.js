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
            let queryText = `
                UPDATE device_groups 
                SET name = $1, description = $2, color = $3, updated_at = NOW()
                WHERE id = $4
            `;
            let params = [updateData.name, updateData.description, updateData.color, groupId];

            if (organizationId) {
                queryText += ' AND organization_id = $5';
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
                SELECT d.*, dr.*, dgm.assigned_at, dgm.assigned_by,
                       u.first_name, u.last_name
                FROM devices d
                LEFT JOIN device_restrictions dr ON d.id = dr.device_id
                JOIN device_group_memberships dgm ON d.id = dgm.device_id
                LEFT JOIN users u ON dgm.assigned_by = u.id
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
}

module.exports = DeviceGroupModel;