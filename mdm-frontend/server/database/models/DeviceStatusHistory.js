// Modelo para histórico de status dos dispositivos
const { query } = require('../config');

class DeviceStatusHistory {
    // Registrar mudança de status
    static async recordStatus(deviceId, status) {
        try {
            const statusDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            
            // Verificar se já existe registro para hoje
            const existingQuery = `
                SELECT id, online_count, last_online_time
                FROM device_status_history 
                WHERE device_id = $1 AND status_date = $2
            `;
            
            const existingResult = await query(existingQuery, [deviceId, statusDate]);
            
            if (existingResult.rows.length > 0 && status === 'online') {
                // Atualizar registro existente
                const existing = existingResult.rows[0];
                const updateQuery = `
                    UPDATE device_status_history 
                    SET 
                        online_count = online_count + 1,
                        last_online_time = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *
                `;
                
                const updateResult = await query(updateQuery, [existing.id]);
                return updateResult.rows[0];
            } else if (existingResult.rows.length === 0) {
                // Criar novo registro
                const insertQuery = `
                    INSERT INTO device_status_history (
                        device_id, status_date, status, online_count, last_online_time
                    ) VALUES ($1, $2, $3, $4, NOW())
                    RETURNING *
                `;
                
                const insertResult = await query(insertQuery, [
                    deviceId,
                    statusDate,
                    status,
                    status === 'online' ? 1 : 0
                ]);
                
                return insertResult.rows[0];
            }
            
            return existingResult.rows[0];
        } catch (error) {
            console.error('❌ Erro ao registrar status:', error);
            throw error;
        }
    }
    
    // Buscar histórico por período
    static async getHistory(deviceId, startDate, endDate) {
        try {
            const queryText = `
                SELECT 
                    status_date,
                    status,
                    online_count,
                    last_online_time,
                    created_at,
                    updated_at
                FROM device_status_history 
                WHERE device_id = $1 
                AND status_date >= $2 
                AND status_date <= $3
                ORDER BY status_date ASC
            `;
            
            const result = await query(queryText, [deviceId, startDate, endDate]);
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar histórico:', error);
            throw error;
        }
    }
    
    // Buscar histórico de todos os dispositivos por período
    static async getAllDevicesHistory(startDate, endDate) {
        try {
            const queryText = `
                SELECT 
                    device_id,
                    status_date,
                    COUNT(DISTINCT device_id) as devices_online,
                    SUM(online_count) as total_connections
                FROM device_status_history 
                WHERE status_date >= $1 
                AND status_date <= $2
                AND status = 'online'
                GROUP BY device_id, status_date
                ORDER BY status_date ASC
            `;
            
            const result = await query(queryText, [startDate, endDate]);
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar histórico geral:', error);
            throw error;
        }
    }
    
    // Buscar total de dispositivos online por dia
    static async getDailyOnlineCounts(startDate, endDate) {
        try {
            const queryText = `
                SELECT 
                    status_date,
                    COUNT(DISTINCT device_id) as devices_online
                FROM device_status_history 
                WHERE status_date >= $1 
                AND status_date <= $2
                AND status = 'online'
                GROUP BY status_date
                ORDER BY status_date ASC
            `;
            
            const result = await query(queryText, [startDate, endDate]);
            return result.rows;
        } catch (error) {
            console.error('❌ Erro ao buscar contagem diária:', error);
            throw error;
        }
    }
    
    // Limpar registros antigos (mais de 90 dias)
    static async cleanOldRecords(daysToKeep = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
            
            const deleteQuery = `
                DELETE FROM device_status_history 
                WHERE status_date < $1
                RETURNING id
            `;
            
            const result = await query(deleteQuery, [cutoffDateStr]);
            console.log(`🗑️ ${result.rows.length} registros antigos removidos`);
            return result.rows.length;
        } catch (error) {
            console.error('❌ Erro ao limpar registros antigos:', error);
            throw error;
        }
    }
}

module.exports = DeviceStatusHistory;

