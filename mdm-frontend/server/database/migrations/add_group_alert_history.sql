-- Migration: add_group_alert_history
-- Objetivo: Criar tabela para armazenar histórico de alertas de grupos de dispositivos (60 dias)

CREATE TABLE IF NOT EXISTS group_alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    alert_type VARCHAR(20) NOT NULL, -- 'error', 'warning', 'info'
    alert_title VARCHAR(255) NOT NULL,
    alert_message TEXT NOT NULL,
    alert_data JSONB DEFAULT '{}', -- Dados adicionais do alerta (ex: batteryLevel, wifiSSID, etc)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_group_alert_history_group_id ON group_alert_history(group_id);
CREATE INDEX IF NOT EXISTS idx_group_alert_history_organization_id ON group_alert_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_group_alert_history_device_id ON group_alert_history(device_id);
CREATE INDEX IF NOT EXISTS idx_group_alert_history_created_at ON group_alert_history(created_at);
CREATE INDEX IF NOT EXISTS idx_group_alert_history_alert_type ON group_alert_history(alert_type);

-- Índice composto para buscar alertas por grupo e data
CREATE INDEX IF NOT EXISTS idx_group_alert_history_group_date 
ON group_alert_history(group_id, created_at DESC);

-- Função para limpar alertas antigos (mais de 60 dias)
CREATE OR REPLACE FUNCTION cleanup_old_group_alerts()
RETURNS void AS $$
BEGIN
    DELETE FROM group_alert_history
    WHERE created_at < NOW() - INTERVAL '60 days';
END;
$$ LANGUAGE plpgsql;

-- Comentários
COMMENT ON TABLE group_alert_history IS 'Histórico de alertas de grupos de dispositivos (retenção de 60 dias)';
COMMENT ON COLUMN group_alert_history.alert_type IS 'Tipo do alerta: error, warning, info';
COMMENT ON COLUMN group_alert_history.alert_data IS 'Dados adicionais do alerta em formato JSON (batteryLevel, wifiSSID, latitude, longitude, etc)';

