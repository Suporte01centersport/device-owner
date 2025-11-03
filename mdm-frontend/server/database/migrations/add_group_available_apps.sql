-- Migration: add_group_available_apps
-- Objetivo: Armazenar apps únicos disponíveis por grupo (coletados dos dispositivos)

-- Tabela para armazenar apps únicos disponíveis por grupo
CREATE TABLE IF NOT EXISTS group_available_apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    icon_base64 TEXT,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    seen_in_devices TEXT[], -- Array de device_ids que têm esse app
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, package_name)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_group_available_apps_group_id ON group_available_apps(group_id);
CREATE INDEX IF NOT EXISTS idx_group_available_apps_package_name ON group_available_apps(package_name);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_group_available_apps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_group_available_apps_updated_at ON group_available_apps;
CREATE TRIGGER update_group_available_apps_updated_at
    BEFORE UPDATE ON group_available_apps
    FOR EACH ROW
    EXECUTE FUNCTION update_group_available_apps_updated_at();


