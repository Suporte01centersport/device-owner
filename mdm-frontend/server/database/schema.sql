-- Schema PostgreSQL para MDM Owner
-- Criado para substituir arquivos JSON por banco de dados robusto

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Tabela de organizações (multi-tenancy)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de usuários
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer', -- admin, manager, operator, viewer
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de dispositivos
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    model VARCHAR(255),
    manufacturer VARCHAR(255),
    android_version VARCHAR(50),
    api_level INTEGER,
    serial_number VARCHAR(255),
    imei VARCHAR(20),
    mac_address VARCHAR(17),
    ip_address INET,
    battery_level INTEGER DEFAULT 0,
    battery_status VARCHAR(50),
    is_charging BOOLEAN DEFAULT false,
    storage_total BIGINT DEFAULT 0,
    storage_used BIGINT DEFAULT 0,
    memory_total BIGINT DEFAULT 0,
    memory_used BIGINT DEFAULT 0,
    cpu_architecture VARCHAR(50),
    screen_resolution VARCHAR(50),
    screen_density INTEGER,
    network_type VARCHAR(50),
    wifi_ssid VARCHAR(255),
    is_wifi_enabled BOOLEAN DEFAULT false,
    is_bluetooth_enabled BOOLEAN DEFAULT false,
    is_location_enabled BOOLEAN DEFAULT false,
    is_developer_options_enabled BOOLEAN DEFAULT false,
    is_adb_enabled BOOLEAN DEFAULT false,
    is_unknown_sources_enabled BOOLEAN DEFAULT false,
    is_device_owner BOOLEAN DEFAULT false,
    is_profile_owner BOOLEAN DEFAULT false,
    is_kiosk_mode BOOLEAN DEFAULT false,
    app_version VARCHAR(50),
    timezone VARCHAR(100),
    language VARCHAR(10),
    country VARCHAR(10),
    status VARCHAR(20) DEFAULT 'offline', -- online, offline
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, device_id)
);

-- Tabela de localizações
CREATE TABLE device_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    accuracy DECIMAL(8, 2),
    provider VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de aplicativos instalados
CREATE TABLE installed_apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    icon_base64 TEXT,
    is_system_app BOOLEAN DEFAULT false,
    is_enabled BOOLEAN DEFAULT true,
    version_name VARCHAR(100),
    version_code INTEGER,
    install_time TIMESTAMP WITH TIME ZONE,
    update_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(device_id, package_name)
);

-- Tabela de grupos de dispositivos
CREATE TABLE device_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- Tabela de membros de grupos
CREATE TABLE device_group_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(device_id, group_id)
);

-- Tabela de políticas de aplicativos
CREATE TABLE app_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    policy_type VARCHAR(20) DEFAULT 'allow', -- allow, block, require
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, package_name)
);

-- Tabela de restrições de dispositivos
CREATE TABLE device_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    wifi_disabled BOOLEAN DEFAULT false,
    bluetooth_disabled BOOLEAN DEFAULT false,
    camera_disabled BOOLEAN DEFAULT false,
    status_bar_disabled BOOLEAN DEFAULT false,
    install_apps_disabled BOOLEAN DEFAULT false,
    uninstall_apps_disabled BOOLEAN DEFAULT false,
    settings_disabled BOOLEAN DEFAULT false,
    system_notifications_disabled BOOLEAN DEFAULT false,
    screen_capture_disabled BOOLEAN DEFAULT false,
    sharing_disabled BOOLEAN DEFAULT false,
    outgoing_calls_disabled BOOLEAN DEFAULT false,
    sms_disabled BOOLEAN DEFAULT false,
    user_creation_disabled BOOLEAN DEFAULT false,
    user_removal_disabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(device_id)
);

-- Tabela de mensagens de suporte
CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    message TEXT NOT NULL,
    android_version VARCHAR(50),
    model VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending', -- pending, resolved, closed
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id)
);

-- Tabela de auditoria (logs de ações)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de configurações do sistema
CREATE TABLE system_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    config_key VARCHAR(100) NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, config_key)
);

-- Tabela para histórico de apps acessados
CREATE TABLE app_access_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    access_date DATE NOT NULL,
    first_access_time TIMESTAMP WITH TIME ZONE NOT NULL,
    last_access_time TIMESTAMP WITH TIME ZONE NOT NULL,
    access_count INTEGER DEFAULT 1,
    total_duration_ms BIGINT DEFAULT 0,
    is_allowed BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(device_id, package_name, access_date)
);

-- Tabela para histórico de status dos dispositivos
CREATE TABLE device_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) NOT NULL,
    status_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL, -- online, offline
    online_count INTEGER DEFAULT 0,
    last_online_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(device_id, status_date)
);

-- Índices para performance
CREATE INDEX idx_devices_organization_id ON devices(organization_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
CREATE INDEX idx_devices_device_id ON devices(device_id);

CREATE INDEX idx_device_locations_device_id ON device_locations(device_id);
CREATE INDEX idx_device_locations_created_at ON device_locations(created_at);

CREATE INDEX idx_installed_apps_device_id ON installed_apps(device_id);
CREATE INDEX idx_installed_apps_package_name ON installed_apps(package_name);

CREATE INDEX idx_device_groups_organization_id ON device_groups(organization_id);
CREATE INDEX idx_device_group_memberships_device_id ON device_group_memberships(device_id);
CREATE INDEX idx_device_group_memberships_group_id ON device_group_memberships(group_id);

CREATE INDEX idx_app_policies_organization_id ON app_policies(organization_id);
CREATE INDEX idx_app_policies_group_id ON app_policies(group_id);

CREATE INDEX idx_support_messages_organization_id ON support_messages(organization_id);
CREATE INDEX idx_support_messages_device_id ON support_messages(device_id);
CREATE INDEX idx_support_messages_status ON support_messages(status);

CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Índices para histórico de apps
CREATE INDEX idx_app_access_history_device_id ON app_access_history(device_id);
CREATE INDEX idx_app_access_history_package_name ON app_access_history(package_name);
CREATE INDEX idx_app_access_history_access_date ON app_access_history(access_date);
CREATE INDEX idx_app_access_history_last_access_time ON app_access_history(last_access_time);

-- Índices para histórico de status
CREATE INDEX idx_device_status_history_device_id ON device_status_history(device_id);
CREATE INDEX idx_device_status_history_status_date ON device_status_history(status_date);
CREATE INDEX idx_device_status_history_status ON device_status_history(status);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_installed_apps_updated_at BEFORE UPDATE ON installed_apps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_device_groups_updated_at BEFORE UPDATE ON device_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_app_policies_updated_at BEFORE UPDATE ON app_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_device_restrictions_updated_at BEFORE UPDATE ON device_restrictions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_configs_updated_at BEFORE UPDATE ON system_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_app_access_history_updated_at BEFORE UPDATE ON app_access_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_device_status_history_updated_at BEFORE UPDATE ON device_status_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();