-- Migration: add_location_index
-- Objetivo: Adicionar índice composto para melhorar queries de última localização

-- Índice composto para buscar última localização por dispositivo
-- Isso melhora a query: SELECT ... FROM device_locations WHERE device_id = ? ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_device_locations_device_id_created_at 
ON device_locations(device_id, created_at DESC);

-- Comentário explicativo
COMMENT ON INDEX idx_device_locations_device_id_created_at IS 
'Índice composto para otimizar busca da última localização de cada dispositivo';

