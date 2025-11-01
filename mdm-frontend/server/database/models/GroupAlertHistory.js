// Modelo para histórico de alertas de grupos de dispositivos
const { query, transaction } = require('../config');

class GroupAlertHistoryModel {
    // Verificar se já existe um alerta similar (mesmo grupo, dispositivo, tipo e título nos últimos X minutos)
    static async existsSimilarAlert(groupId, deviceId, alertType, alertTitle, withinMinutes = 5) {
        try {
            // Calcular timestamp limite (agora - X minutos)
            const limitTimestamp = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
            
            const result = await query(`
                SELECT id
                FROM group_alert_history
                WHERE group_id = $1
                AND device_id = $2
                AND alert_type = $3
                AND alert_title = $4
                AND created_at >= $5
                LIMIT 1
            `, [groupId, deviceId, alertType, alertTitle, limitTimestamp]);

            return result.rows.length > 0;
        } catch (error) {
            console.error('Erro ao verificar alerta similar:', error);
            // Em caso de erro, retornar false para permitir salvamento (melhor salvar duplicado do que perder)
            return false;
        }
    }

    // Salvar um alerta no histórico (verificando duplicatas primeiro)
    static async create(alertData) {
        try {
            console.log('📝 GroupAlertHistory.create() chamado com:', {
                groupId: alertData.groupId,
                deviceId: alertData.deviceId,
                alertType: alertData.alertType,
                alertTitle: alertData.alertTitle
            });

            const {
                groupId,
                organizationId,
                deviceId,
                deviceName,
                alertType,
                alertTitle,
                alertMessage,
                alertData: additionalData = {}
            } = alertData;

            // Verificar se já existe um alerta similar nos últimos 1 minuto (reduzido de 5 para 1)
            // Isso permite que alertas sejam salvos mais frequentemente, mas ainda evita spam no mesmo minuto
            const exists = await this.existsSimilarAlert(groupId, deviceId, alertType, alertTitle, 1);
            if (exists) {
                console.log('⏭️ Alerta similar já existe (último minuto), ignorando duplicata:', {
                    groupId,
                    deviceId,
                    alertType,
                    alertTitle
                });
                return null; // Retornar null para indicar que foi ignorado (não é erro)
            }

            // Obter organization_id se não fornecido
            let orgId = organizationId;
            if (!orgId) {
                const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default']);
                if (orgResult.rows.length > 0) {
                    orgId = orgResult.rows[0].id;
                    console.log('✅ Organization ID obtido:', orgId);
                } else {
                    console.warn('⚠️ Nenhuma organização encontrada com slug "default"');
                }
            }

            const result = await query(`
                INSERT INTO group_alert_history (
                    group_id,
                    organization_id,
                    device_id,
                    device_name,
                    alert_type,
                    alert_title,
                    alert_message,
                    alert_data,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                RETURNING *
            `, [
                groupId,
                orgId,
                deviceId,
                deviceName,
                alertType,
                alertTitle,
                alertMessage,
                JSON.stringify(additionalData)
            ]);

            console.log('✅ Alerta salvo com sucesso no banco:', result.rows[0]?.id);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Erro ao salvar alerta no histórico:', error);
            console.error('   Detalhes:', {
                message: error.message,
                code: error.code,
                detail: error.detail
            });
            throw error;
        }
    }

    // Buscar alertas por grupo e data (agrupados por tipo/dispositivo)
    static async findByGroupAndDate(groupId, date) {
        try {
            // date deve ser uma string no formato 'YYYY-MM-DD' ou Date object
            const dateStr = date instanceof Date 
                ? date.toISOString().split('T')[0]
                : date;

            // Buscar alertas agrupados: mesmo grupo, dispositivo, tipo e título
            // Mostrar primeiro e último timestamp, e quantidade total
            // Usar array_agg para pegar o primeiro ID, mensagem e dados (ordenado por created_at)
            const result = await query(`
                SELECT 
                    (array_agg(id ORDER BY created_at ASC))[1] as id,
                    group_id,
                    device_id,
                    device_name,
                    alert_type,
                    alert_title,
                    (array_agg(alert_message ORDER BY created_at ASC))[1] as alert_message,
                    (array_agg(alert_data ORDER BY created_at ASC))[1] as alert_data,
                    MIN(created_at) as first_occurrence,
                    MAX(created_at) as last_occurrence,
                    COUNT(*) as occurrence_count
                FROM group_alert_history
                WHERE group_id = $1
                AND DATE(created_at) = $2
                GROUP BY 
                    group_id,
                    device_id,
                    device_name,
                    alert_type,
                    alert_title
                ORDER BY first_occurrence DESC
            `, [groupId, dateStr]);

            return result.rows.map(row => ({
                id: row.id,
                groupId: row.group_id,
                deviceId: row.device_id,
                deviceName: row.device_name,
                alertType: row.alert_type,
                alertTitle: row.alert_title,
                alertMessage: row.alert_message,
                alertData: typeof row.alert_data === 'string' 
                    ? JSON.parse(row.alert_data) 
                    : row.alert_data,
                firstOccurrence: row.first_occurrence,
                lastOccurrence: row.last_occurrence,
                occurrenceCount: parseInt(row.occurrence_count || 1)
            }));
        } catch (error) {
            console.error('Erro ao buscar alertas do histórico:', error);
            throw error;
        }
    }

    // Limpar alertas antigos (mais de 60 dias)
    static async cleanupOldAlerts() {
        try {
            // Primeiro, contar quantos serão deletados
            const countResult = await query(`
                SELECT COUNT(*) as deleted_count
                FROM group_alert_history
                WHERE created_at < NOW() - INTERVAL '60 days'
            `);
            
            const deletedCount = parseInt(countResult.rows[0]?.deleted_count || 0);

            // Se houver registros para deletar, executar limpeza
            if (deletedCount > 0) {
                await query(`SELECT cleanup_old_group_alerts()`);
            }

            return {
                success: true,
                deletedCount: deletedCount
            };
        } catch (error) {
            console.error('Erro ao limpar alertas antigos:', error);
            throw error;
        }
    }

    // Obter datas disponíveis com alertas para um grupo
    static async getAvailableDates(groupId) {
        try {
            const result = await query(`
                SELECT DISTINCT DATE(created_at) as alert_date
                FROM group_alert_history
                WHERE group_id = $1
                AND created_at >= NOW() - INTERVAL '60 days'
                ORDER BY alert_date DESC
            `, [groupId]);

            return result.rows.map(row => row.alert_date);
        } catch (error) {
            console.error('Erro ao buscar datas disponíveis:', error);
            throw error;
        }
    }
}

module.exports = GroupAlertHistoryModel;

