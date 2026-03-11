-- Migration: Adicionar campo leader_type na tabela device_users
-- Tipos: full, estoque, pedidos, mapeamento (máximo 2 líderes por tipo)

ALTER TABLE device_users ADD COLUMN IF NOT EXISTS leader_type VARCHAR(50);

COMMENT ON COLUMN device_users.leader_type IS 'Tipo de líder: full, estoque, pedidos, mapeamento';
