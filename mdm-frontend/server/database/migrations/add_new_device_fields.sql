-- Migration: Adicionar novos campos à tabela devices
-- Descrição: Adiciona os campos osType, meid e complianceStatus conforme estrutura conceitual do MDM
-- Data: 2025-10-28

-- Adicionar campo osType (tipo do sistema operacional)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS os_type VARCHAR(50) DEFAULT 'Android';

-- Adicionar campo meid (Mobile Equipment Identifier para dispositivos CDMA)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS meid VARCHAR(20);

-- Adicionar campo complianceStatus (status de conformidade com políticas)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(20) DEFAULT 'unknown';

-- Adicionar comentários nas colunas para documentação
COMMENT ON COLUMN devices.os_type IS 'Tipo do sistema operacional (Android, iOS, Windows, etc.)';
COMMENT ON COLUMN devices.meid IS 'Mobile Equipment Identifier para dispositivos CDMA (alternativa ao IMEI)';
COMMENT ON COLUMN devices.compliance_status IS 'Status de conformidade: compliant (conforme), non_compliant (não conforme), unknown (desconhecido)';

-- Criar índice para compliance_status para facilitar consultas de dispositivos em conformidade
CREATE INDEX IF NOT EXISTS idx_devices_compliance_status ON devices(compliance_status);

-- Atualizar dispositivos existentes que são Device Owner como "compliant"
-- (pode ser refinado posteriormente com base em regras mais complexas)
UPDATE devices 
SET compliance_status = 'compliant' 
WHERE is_device_owner = true 
  AND is_developer_options_enabled = false 
  AND is_adb_enabled = false 
  AND is_unknown_sources_enabled = false
  AND compliance_status = 'unknown';

-- Atualizar dispositivos que não são Device Owner como "non_compliant"
UPDATE devices 
SET compliance_status = 'non_compliant' 
WHERE is_device_owner = false 
  AND compliance_status = 'unknown';


