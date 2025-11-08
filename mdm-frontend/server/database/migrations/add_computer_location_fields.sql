-- Migração: Adicionar campos de endereço e fonte de localização para computadores
-- Data: 2025-11-06

-- Adicionar campos de localização na tabela computers
ALTER TABLE computers 
ADD COLUMN IF NOT EXISTS location_address TEXT,
ADD COLUMN IF NOT EXISTS location_source VARCHAR(50);

-- Comentários para documentação
COMMENT ON COLUMN computers.location_address IS 'Endereço formatado da localização (cidade, região, país)';
COMMENT ON COLUMN computers.location_source IS 'Fonte da localização (ip-api.com, windows, gps, etc.)';

