const { Pool } = require('pg');
const poolModule = require('../config');
const { query } = poolModule;

class AppAccessHistory {
    /**
     * Salva ou atualiza um registro de acesso a app
     * @param {string} deviceId - ID do dispositivo
     * @param {string} packageName - Nome do pacote do app
     * @param {string} appName - Nome do app
     * @param {Date} accessTime - Timestamp do acesso
     * @param {number} duration - Duração em milissegundos
     * @param {boolean} isAllowed - Se o app está na lista de permitidos
     */
    static async saveAppAccess(deviceId, packageName, appName, accessTime, duration = 0, isAllowed = true) {
        const accessDate = accessTime.toISOString().split('T')[0]; // YYYY-MM-DD
        
        try {
            // Verificar se já existe registro para este app neste dia
            const existingQuery = `
                SELECT id, access_count, first_access_time, last_access_time, total_duration_ms
                FROM app_access_history 
                WHERE device_id = $1 AND package_name = $2 AND access_date = $3
            `;
            
            const existingResult = await query(existingQuery, [deviceId, packageName, accessDate]);
            
            if (existingResult.rows.length > 0) {
                // Atualizar registro existente
                const existing = existingResult.rows[0];
                const updateQuery = `
                    UPDATE app_access_history 
                    SET 
                        access_count = $1,
                        last_access_time = $2,
                        total_duration_ms = $3,
                        is_allowed = $4,
                        updated_at = NOW()
                    WHERE id = $5
                    RETURNING *
                `;
                
                const newCount = existing.access_count + 1;
                const newTotalDuration = existing.total_duration_ms + duration;
                
                const updateResult = await query(updateQuery, [
                    newCount,
                    accessTime,
                    newTotalDuration,
                    isAllowed,
                    existing.id
                ]);
                
                console.log(`📊 App access atualizado: ${appName} (${packageName}) - ${newCount} acessos`);
                return updateResult.rows[0];
            } else {
                // Criar novo registro
                const insertQuery = `
                    INSERT INTO app_access_history (
                        device_id, package_name, app_name, access_date,
                        first_access_time, last_access_time, access_count, total_duration_ms, is_allowed
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                `;
                
                const insertResult = await query(insertQuery, [
                    deviceId,
                    packageName,
                    appName,
                    accessDate,
                    accessTime,
                    accessTime,
                    1,
                    duration,
                    isAllowed
                ]);
                
                console.log(`📊 Novo app access criado: ${appName} (${packageName})`);
                return insertResult.rows[0];
            }
        } catch (error) {
            console.error('❌ Erro ao salvar acesso do app:', error);
            throw error;
        }
    }

    /**
     * Busca histórico de apps acessados por dispositivo (agrupado por app e dia)
     * @param {string} deviceId - ID do dispositivo
     * @param {number} limit - Limite de registros (padrão: 100)
     * @param {number} offset - Offset para paginação (padrão: 0)
     */
    static async getDeviceAppHistory(deviceId, limit = 100, offset = 0) {
        try {
            const query = `
                SELECT 
                    package_name,
                    app_name,
                    access_date,
                    first_access_time,
                    last_access_time,
                    access_count,
                    total_duration_ms,
                    created_at,
                    updated_at
                FROM app_access_history 
                WHERE device_id = $1
                ORDER BY access_date DESC, last_access_time DESC
                LIMIT $2 OFFSET $3
            `;
            
            const result = await pool.query(query, [deviceId, limit, offset]);
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar histórico de apps:', error);
            throw error;
        }
    }

    /**
     * Busca histórico agrupado por app e dia (um registro por app por dia)
     * @param {string} deviceId - ID do dispositivo
     * @param {number} limit - Limite de registros (padrão: 100)
     * @param {number} offset - Offset para paginação (padrão: 0)
     */
    static async getGroupedAppHistory(deviceId, limit = 100, offset = 0) {
        try {
            const query = `
                SELECT 
                    package_name,
                    app_name,
                    access_date,
                    first_access_time,
                    last_access_time,
                    access_count,
                    total_duration_ms,
                    created_at,
                    updated_at
                FROM app_access_history 
                WHERE device_id = $1
                ORDER BY access_date DESC, last_access_time DESC
                LIMIT $2 OFFSET $3
            `;
            
            const result = await pool.query(query, [deviceId, limit, offset]);
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar histórico agrupado de apps:', error);
            throw error;
        }
    }

    /**
     * Busca resumo de apps mais acessados por dispositivo
     * @param {string} deviceId - ID do dispositivo
     * @param {number} days - Número de dias para buscar (padrão: 30)
     */
    static async getTopAccessedApps(deviceId, days = 30) {
        try {
            const query = `
                SELECT 
                    package_name,
                    app_name,
                    SUM(access_count) as total_accesses,
                    SUM(total_duration_ms) as total_duration_ms,
                    MAX(last_access_time) as last_access_time,
                    COUNT(DISTINCT access_date) as days_used
                FROM app_access_history 
                WHERE device_id = $1 
                AND access_date >= CURRENT_DATE - INTERVAL '${days} days'
                GROUP BY package_name, app_name
                ORDER BY total_accesses DESC, last_access_time DESC
                LIMIT 50
            `;
            
            const result = await pool.query(query, [deviceId]);
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar apps mais acessados:', error);
            throw error;
        }
    }

    /**
     * Busca histórico agrupado por data
     * @param {string} deviceId - ID do dispositivo
     * @param {number} days - Número de dias para buscar (padrão: 7)
     */
    static async getDailyAppUsage(deviceId, days = 7) {
        try {
            const query = `
                SELECT 
                    access_date,
                    COUNT(DISTINCT package_name) as unique_apps,
                    SUM(access_count) as total_accesses,
                    SUM(total_duration_ms) as total_duration_ms
                FROM app_access_history 
                WHERE device_id = $1 
                AND access_date >= CURRENT_DATE - INTERVAL '${days} days'
                GROUP BY access_date
                ORDER BY access_date DESC
            `;
            
            const result = await pool.query(query, [deviceId]);
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar uso diário de apps:', error);
            throw error;
        }
    }

    /**
     * Remove histórico antigo (manutenção)
     * @param {number} daysToKeep - Dias para manter (padrão: 90)
     */
    static async cleanupOldHistory(daysToKeep = 90) {
        try {
            const query = `
                DELETE FROM app_access_history 
                WHERE access_date < CURRENT_DATE - INTERVAL '${daysToKeep} days'
            `;
            
            const result = await pool.query(query);
            console.log(`🧹 Limpeza de histórico: ${result.rowCount} registros removidos`);
            return result.rowCount;
        } catch (error) {
            console.error('❌ Erro na limpeza de histórico:', error);
            throw error;
        }
    }
}

module.exports = AppAccessHistory;
