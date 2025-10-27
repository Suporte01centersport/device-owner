-- Script para criar a tabela app_access_history
-- Execute este script no PostgreSQL do servidor Linux

-- Verificar se a extensão uuid-ossp existe
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar a tabela app_access_history
CREATE TABLE IF NOT EXISTS app_access_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    access_date DATE NOT NULL,
    first_access_time TIMESTAMP WITH TIME ZONE NOT NULL,
    last_access_time TIMESTAMP WITH TIME ZONE NOT NULL,
    access_count INTEGER DEFAULT 1,
    total_duration_ms BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(device_id, package_name, access_date)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_app_access_history_device_id ON app_access_history(device_id);
CREATE INDEX IF NOT EXISTS idx_app_access_history_package_name ON app_access_history(package_name);
CREATE INDEX IF NOT EXISTS idx_app_access_history_access_date ON app_access_history(access_date);
CREATE INDEX IF NOT EXISTS idx_app_access_history_last_access_time ON app_access_history(last_access_time);

-- Criar trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_app_access_history_updated_at'
    ) THEN
        CREATE TRIGGER update_app_access_history_updated_at 
        BEFORE UPDATE ON app_access_history 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Verificar se a tabela foi criada
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'app_access_history' 
ORDER BY ordinal_position;
