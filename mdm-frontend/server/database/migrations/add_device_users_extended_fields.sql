-- Migration: Adicionar campos estendidos em device_users (ficha completa)
-- Campos: birth_year, device_model, device_serial_number

ALTER TABLE device_users ADD COLUMN IF NOT EXISTS birth_year INTEGER;
ALTER TABLE device_users ADD COLUMN IF NOT EXISTS device_model VARCHAR(255);
ALTER TABLE device_users ADD COLUMN IF NOT EXISTS device_serial_number VARCHAR(255);

COMMENT ON COLUMN device_users.birth_year IS 'Ano de nascimento do usuário';
COMMENT ON COLUMN device_users.device_model IS 'Modelo do celular do usuário';
COMMENT ON COLUMN device_users.device_serial_number IS 'Número de série do celular';
