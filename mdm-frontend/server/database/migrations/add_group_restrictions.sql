-- Migration: add_group_restrictions
-- Objetivo: Adicionar campos para configuração de redes permitidas e localização permitida aos grupos

-- Adicionar campos de configuração ao grupo
ALTER TABLE device_groups
    ADD COLUMN IF NOT EXISTS allowed_networks TEXT[] DEFAULT '{}', -- Lista de SSIDs de WiFi permitidas
    ADD COLUMN IF NOT EXISTS allowed_location JSONB DEFAULT NULL; -- Configuração de localização permitida: { latitude, longitude, radius_km }

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_device_groups_allowed_networks ON device_groups USING GIN(allowed_networks);

