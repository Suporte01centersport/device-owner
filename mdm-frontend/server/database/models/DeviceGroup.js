// Modelo de DeviceGroup para PostgreSQL
const { queryWithRetry, withTransaction } = require('../connection');

class DeviceGroupModel {
    // Buscar todos os grupos
    static async findAll() {
        const result = await queryWithRetry(`
            SELECT 
                dg.*,
                COUNT(dgm.device_id) as device_count,
                json_agg(
                    json_build_object(
                        'id', d.id,
                        'deviceId', d.device_id,
                        'deviceName', d.device_name,
                        'status', CASE WHEN d.is_connected THEN 'online' ELSE 'offline' END,
                        'lastSeen', d.last_seen
                    ) ORDER BY d.device_name
                ) FILTER (WHERE d.id IS NOT NULL) as devices
            FROM device_groups dg
            LEFT JOIN device_group_memberships dgm ON dg.id = dgm.group_id
            LEFT JOIN devices d ON dgm.device_id = d.id
            GROUP BY dg.id
            ORDER BY dg.name
        `);
        
        return result.rows.map(row => this.formatGroup(row));
    }

    // Buscar grupo por ID
    static async findById(groupId) {
        const result = await queryWithRetry(`
            SELECT 
                dg.*,
                COUNT(dgm.device_id) as device_count,
                json_agg(
                    json_build_object(
                        'id', d.id,
                        'deviceId', d.device_id,
                        'deviceName', d.device_name,
                        'status', CASE WHEN d.is_connected THEN 'online' ELSE 'offline' END,
                        'lastSeen', d.last_seen
                    ) ORDER BY d.device_name
                ) FILTER (WHERE d.id IS NOT NULL) as devices,
                json_agg(
                    json_build_object(
                        'id', gap.id,
                        'packageName', gap.package_name,
                        'appName', gap.app_name,
                        'isAllowed', gap.is_allowed,
                        'policyType', gap.policy_type
                    ) ORDER BY gap.app_name
                ) FILTER (WHERE gap.id IS NOT NULL) as app_policies
            FROM device_groups dg
            LEFT JOIN device_group_memberships dgm ON dg.id = dgm.group_id
            LEFT JOIN devices d ON dgm.device_id = d.id
            LEFT JOIN group_app_policies gap ON dg.id = gap.group_id
            WHERE dg.id = $1
            GROUP BY dg.id
        `, [groupId]);
        
        return result.rows.length > 0 ? this.formatGroup(result.rows[0]) : null;
    }

    // Criar novo grupo
    static async create(groupData) {
        const result = await queryWithRetry(`
            INSERT INTO device_groups (name, description, color)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [groupData.name, groupData.description || null, groupData.color || '#3B82F6']);
        
        return this.formatGroup(result.rows[0]);
    }

    // Atualizar grupo
    static async update(groupId, groupData) {
        const result = await queryWithRetry(`
            UPDATE device_groups 
            SET 
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                color = COALESCE($4, color),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [groupId, groupData.name, groupData.description, groupData.color]);
        
        return result.rows.length > 0 ? this.formatGroup(result.rows[0]) : null;
    }

    // Deletar grupo
    static async delete(groupId) {
        return await withTransaction(async (client) => {
            // Remover associações de dispositivos
            await client.query('DELETE FROM device_group_memberships WHERE group_id = $1', [groupId]);
            
            // Remover políticas de aplicativos
            await client.query('DELETE FROM group_app_policies WHERE group_id = $1', [groupId]);
            
            // Deletar grupo
            const result = await client.query('DELETE FROM device_groups WHERE id = $1 RETURNING *', [groupId]);
            
            return result.rows.length > 0;
        });
    }

    // Adicionar dispositivo ao grupo
    static async addDevice(groupId, deviceId, assignedBy = 'admin') {
        const result = await queryWithRetry(`
            INSERT INTO device_group_memberships (group_id, device_id, assigned_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (group_id, device_id) DO UPDATE SET
                assigned_by = EXCLUDED.assigned_by,
                assigned_at = NOW()
            RETURNING *
        `, [groupId, deviceId, assignedBy]);
        
        return result.rows[0];
    }

    // Remover dispositivo do grupo
    static async removeDevice(groupId, deviceId) {
        const result = await queryWithRetry(`
            DELETE FROM device_group_memberships 
            WHERE group_id = $1 AND device_id = $2
            RETURNING *
        `, [groupId, deviceId]);
        
        return result.rows.length > 0;
    }

    // Obter dispositivos de um grupo
    static async getGroupDevices(groupId) {
        const result = await queryWithRetry(`
            SELECT 
                d.*,
                dgm.assigned_at,
                dgm.assigned_by
            FROM devices d
            INNER JOIN device_group_memberships dgm ON d.id = dgm.device_id
            WHERE dgm.group_id = $1
            ORDER BY d.device_name
        `, [groupId]);
        
        return result.rows.map(row => ({
            ...DeviceModel.formatDevice(row),
            assignedAt: row.assigned_at,
            assignedBy: row.assigned_by
        }));
    }

    // Adicionar política de aplicativo ao grupo
    static async addAppPolicy(groupId, appPolicy) {
        const result = await queryWithRetry(`
            INSERT INTO group_app_policies (group_id, package_name, app_name, is_allowed, policy_type)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (group_id, package_name) DO UPDATE SET
                app_name = EXCLUDED.app_name,
                is_allowed = EXCLUDED.is_allowed,
                policy_type = EXCLUDED.policy_type,
                updated_at = NOW()
            RETURNING *
        `, [groupId, appPolicy.packageName, appPolicy.appName, appPolicy.isAllowed, appPolicy.policyType || 'allow']);
        
        return result.rows[0];
    }

    // Remover política de aplicativo do grupo
    static async removeAppPolicy(groupId, packageName) {
        const result = await queryWithRetry(`
            DELETE FROM group_app_policies 
            WHERE group_id = $1 AND package_name = $2
            RETURNING *
        `, [groupId, packageName]);
        
        return result.rows.length > 0;
    }

    // Obter políticas de aplicativos de um grupo
    static async getGroupAppPolicies(groupId) {
        const result = await queryWithRetry(`
            SELECT * FROM group_app_policies
            WHERE group_id = $1
            ORDER BY app_name
        `, [groupId]);
        
        return result.rows;
    }

    // Obter grupos de um dispositivo
    static async getDeviceGroups(deviceId) {
        const result = await queryWithRetry(`
            SELECT 
                dg.*,
                dgm.assigned_at,
                dgm.assigned_by
            FROM device_groups dg
            INNER JOIN device_group_memberships dgm ON dg.id = dgm.group_id
            WHERE dgm.device_id = $1
            ORDER BY dg.name
        `, [deviceId]);
        
        return result.rows.map(row => ({
            ...this.formatGroup(row),
            assignedAt: row.assigned_at,
            assignedBy: row.assigned_by
        }));
    }

    // Aplicar políticas de aplicativos a um dispositivo baseado em seus grupos
    static async getDeviceAppPolicies(deviceId) {
        const result = await queryWithRetry(`
            SELECT DISTINCT ON (gap.package_name)
                gap.*,
                dg.name as group_name,
                dg.color as group_color
            FROM group_app_policies gap
            INNER JOIN device_group_memberships dgm ON gap.group_id = dgm.group_id
            INNER JOIN device_groups dg ON gap.group_id = dg.id
            WHERE dgm.device_id = $1
            ORDER BY gap.package_name, gap.updated_at DESC
        `, [deviceId]);
        
        return result.rows;
    }

    // Estatísticas de grupos
    static async getStats() {
        const result = await queryWithRetry(`
            SELECT 
                COUNT(*) as total_groups,
                COUNT(dgm.device_id) as total_device_assignments,
                COUNT(DISTINCT dgm.device_id) as devices_in_groups,
                AVG(group_stats.device_count) as avg_devices_per_group
            FROM device_groups dg
            LEFT JOIN device_group_memberships dgm ON dg.id = dgm.group_id
            LEFT JOIN (
                SELECT group_id, COUNT(*) as device_count
                FROM device_group_memberships
                GROUP BY group_id
            ) group_stats ON dg.id = group_stats.group_id
        `);
        
        return result.rows[0];
    }

    // Formatar grupo para compatibilidade com frontend
    static formatGroup(row) {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            color: row.color,
            deviceCount: parseInt(row.device_count) || 0,
            devices: row.devices || [],
            appPolicies: row.app_policies || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

module.exports = DeviceGroupModel;

