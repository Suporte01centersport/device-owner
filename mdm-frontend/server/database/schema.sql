-- Schema do banco PostgreSQL para MDM Owner
-- Baseado no ScaleFusion para máxima compatibilidade

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Tabela de dispositivos
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(255),
    android_version VARCHAR(50),
    api_level INTEGER,
    app_version VARCHAR(50),
    battery_level INTEGER,
    battery_status VARCHAR(50),
    country VARCHAR(10),
    cpu_architecture VARCHAR(50),
    memory_used BIGINT,
    storage_used BIGINT,
    last_seen TIMESTAMP WITH TIME ZONE,
    connection_id VARCHAR(255),
    connected_at TIMESTAMP WITH TIME ZONE,
    is_connected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de aplicativos instalados
CREATE TABLE installed_apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    app_name VARCHAR(255) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    version_name VARCHAR(100),
    version_code BIGINT,
    install_time TIMESTAMP WITH TIME ZONE,
    update_time TIMESTAMP WITH TIME ZONE,
    is_allowed BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_system_app BOOLEAN DEFAULT FALSE,
    icon_base64 TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de localizações
CREATE TABLE device_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    accuracy DECIMAL(10, 2),
    altitude DECIMAL(10, 2),
    speed DECIMAL(10, 2),
    bearing DECIMAL(10, 2),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de mensagens de suporte
CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'info',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de configurações do sistema
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de senhas de administrador
CREATE TABLE admin_passwords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Índices para performance (seguindo padrões ScaleFusion)
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_connected ON devices(is_connected);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
CREATE INDEX idx_installed_apps_device_id ON installed_apps(device_id);
CREATE INDEX idx_installed_apps_package_name ON installed_apps(package_name);
CREATE INDEX idx_device_locations_device_id ON device_locations(device_id);
CREATE INDEX idx_device_locations_timestamp ON device_locations(timestamp);
CREATE INDEX idx_support_messages_device_id ON support_messages(device_id);
CREATE INDEX idx_support_messages_timestamp ON support_messages(timestamp);

-- Triggers para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_installed_apps_updated_at BEFORE UPDATE ON installed_apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tabela de grupos de dispositivos
CREATE TABLE device_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Cor hexadecimal para identificação visual
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de associação de dispositivos aos grupos
CREATE TABLE device_group_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by VARCHAR(255), -- Quem atribuiu o dispositivo ao grupo
    UNIQUE(device_id, group_id)
);

-- Tabela de políticas de aplicativos por grupo
CREATE TABLE group_app_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    is_allowed BOOLEAN DEFAULT TRUE,
    policy_type VARCHAR(50) DEFAULT 'allow', -- 'allow', 'block', 'require'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, package_name)
);

-- Índices para performance
CREATE INDEX idx_device_group_memberships_device_id ON device_group_memberships(device_id);
CREATE INDEX idx_device_group_memberships_group_id ON device_group_memberships(group_id);
CREATE INDEX idx_group_app_policies_group_id ON group_app_policies(group_id);
CREATE INDEX idx_group_app_policies_package_name ON group_app_policies(package_name);

-- Triggers para atualizar updated_at automaticamente
CREATE TRIGGER update_device_groups_updated_at BEFORE UPDATE ON device_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_app_policies_updated_at BEFORE UPDATE ON group_app_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir configurações padrão
INSERT INTO system_config (config_key, config_value, description) VALUES
('max_pings_per_minute', '60', 'Máximo de pings por minuto'),
('base_inactivity_timeout', '30000', 'Timeout base de inatividade em ms'),
('max_inactivity_timeout', '120000', 'Timeout máximo de inatividade em ms'),
('min_inactivity_timeout', '15000', 'Timeout mínimo de inatividade em ms'),
('health_score_threshold', '0.5', 'Limiar de score de saúde'),
('heartbeat_interval', '10000', 'Intervalo de heartbeat em ms'),
('ping_probability', '0.3', 'Probabilidade de ping'),
('max_reconnect_attempts', '20', 'Máximo de tentativas de reconexão'),
('initial_reconnect_delay', '1000', 'Delay inicial de reconexão em ms'),
('max_reconnect_delay', '30000', 'Delay máximo de reconexão em ms');

-- Inserir grupos padrão
INSERT INTO device_groups (name, description, color) VALUES
('Dispositivos Corporativos', 'Dispositivos destinados ao uso corporativo', '#3B82F6'),
('Dispositivos de Campo', 'Dispositivos utilizados em campo pelos funcionários', '#10B981'),
('Dispositivos de Demonstração', 'Dispositivos utilizados para demonstrações', '#F59E0B'),
('Dispositivos de Teste', 'Dispositivos utilizados para testes e desenvolvimento', '#8B5CF6');
