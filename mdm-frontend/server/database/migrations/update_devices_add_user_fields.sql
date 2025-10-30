-- Migration: Adicionar campos de vínculo de usuário aos dispositivos
-- Para bancos de dados já existentes

BEGIN;

-- Adicionar colunas apenas se não existirem
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS assigned_user_id VARCHAR(255);

ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS assigned_user_name VARCHAR(255);

-- Adicionar comentários
COMMENT ON COLUMN devices.assigned_user_id IS 'ID do usuário vinculado ao dispositivo';
COMMENT ON COLUMN devices.assigned_user_name IS 'Nome do usuário vinculado (primeiro nome)';

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_devices_assigned_user ON devices(assigned_user_id);

COMMIT;


