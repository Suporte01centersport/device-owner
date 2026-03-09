-- Migration: Adicionar role (operador/líder) e unlock_password em device_users
-- Líderes podem ter senha de 4 dígitos para desbloquear dispositivos

ALTER TABLE device_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'operador';
ALTER TABLE device_users ADD COLUMN IF NOT EXISTS unlock_password VARCHAR(10);

COMMENT ON COLUMN device_users.role IS 'operador ou líder';
COMMENT ON COLUMN device_users.unlock_password IS 'Senha de 4 dígitos para líder desbloquear dispositivo (apenas líderes)';
