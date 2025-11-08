-- Migração: Adicionar tabelas para UEM (Computadores)
-- Data: 2024

-- Tabela de computadores (UEM - Unified Endpoint Management)
CREATE TABLE IF NOT EXISTS computers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    computer_id VARCHAR(255) NOT NULL, -- ID único do computador
    name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'offline', -- online, offline
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Informações do Sistema
    os_type VARCHAR(50) DEFAULT 'unknown', -- Windows, Linux, macOS, unknown
    os_version VARCHAR(255),
    os_build VARCHAR(100),
    architecture VARCHAR(50), -- x64, x86, ARM64, unknown
    hostname VARCHAR(255),
    domain VARCHAR(255),
    
    -- Hardware
    cpu_model VARCHAR(255),
    cpu_cores INTEGER,
    cpu_threads INTEGER,
    memory_total BIGINT DEFAULT 0, -- em bytes
    memory_used BIGINT DEFAULT 0, -- em bytes
    storage_total BIGINT DEFAULT 0, -- em bytes
    storage_used BIGINT DEFAULT 0, -- em bytes
    
    -- Rede
    ip_address INET,
    mac_address VARCHAR(17),
    network_type VARCHAR(50),
    wifi_ssid VARCHAR(255),
    is_wifi_enabled BOOLEAN DEFAULT false,
    is_bluetooth_enabled BOOLEAN DEFAULT false,
    
    -- Informações do Agente
    agent_version VARCHAR(50),
    agent_installed_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    
    -- Usuário
    logged_in_user VARCHAR(255),
    assigned_device_user_id UUID REFERENCES device_users(id) ON DELETE SET NULL,
    
    -- Conformidade
    compliance_status VARCHAR(20) DEFAULT 'unknown', -- compliant, non_compliant, unknown
    antivirus_installed BOOLEAN DEFAULT false,
    antivirus_enabled BOOLEAN DEFAULT false,
    antivirus_name VARCHAR(255),
    firewall_enabled BOOLEAN DEFAULT false,
    encryption_enabled BOOLEAN DEFAULT false,
    
    -- Localização (se aplicável)
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_accuracy DECIMAL(8, 2),
    last_location_update TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, computer_id)
);

-- Tabela de drives de armazenamento de computadores
CREATE TABLE IF NOT EXISTS computer_storage_drives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    computer_id UUID REFERENCES computers(id) ON DELETE CASCADE,
    drive VARCHAR(10) NOT NULL, -- C:, D:, etc
    label VARCHAR(255),
    file_system VARCHAR(50),
    total BIGINT DEFAULT 0, -- bytes
    used BIGINT DEFAULT 0, -- bytes
    free BIGINT DEFAULT 0, -- bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(computer_id, drive)
);

-- Tabela de programas instalados em computadores
CREATE TABLE IF NOT EXISTS computer_installed_programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    computer_id UUID REFERENCES computers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(100),
    publisher VARCHAR(255),
    install_date TIMESTAMP WITH TIME ZONE,
    install_location TEXT,
    size BIGINT, -- bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(computer_id, name, version)
);

-- Tabela de restrições de computadores
CREATE TABLE IF NOT EXISTS computer_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    computer_id UUID REFERENCES computers(id) ON DELETE CASCADE,
    camera_disabled BOOLEAN DEFAULT false,
    screen_capture_disabled BOOLEAN DEFAULT false,
    bluetooth_disabled BOOLEAN DEFAULT false,
    usb_data_transfer_disabled BOOLEAN DEFAULT false,
    wifi_disabled BOOLEAN DEFAULT false,
    factory_reset_disabled BOOLEAN DEFAULT true,
    safe_boot_disabled BOOLEAN DEFAULT true,
    status_bar_disabled BOOLEAN DEFAULT false,
    usb_devices_blocked BOOLEAN DEFAULT false,
    cd_rom_disabled BOOLEAN DEFAULT false,
    printer_install_disabled BOOLEAN DEFAULT false,
    remote_desktop_disabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(computer_id)
);

-- Tabela de localizações de computadores
CREATE TABLE IF NOT EXISTS computer_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    computer_id UUID REFERENCES computers(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    accuracy DECIMAL(8, 2),
    provider VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para computadores
CREATE INDEX IF NOT EXISTS idx_computers_organization_id ON computers(organization_id);
CREATE INDEX IF NOT EXISTS idx_computers_computer_id ON computers(computer_id);
CREATE INDEX IF NOT EXISTS idx_computers_status ON computers(status);
CREATE INDEX IF NOT EXISTS idx_computers_last_seen ON computers(last_seen);
CREATE INDEX IF NOT EXISTS idx_computers_compliance_status ON computers(compliance_status);
CREATE INDEX IF NOT EXISTS idx_computers_assigned_device_user_id ON computers(assigned_device_user_id);
CREATE INDEX IF NOT EXISTS idx_computers_os_type ON computers(os_type);

CREATE INDEX IF NOT EXISTS idx_computer_storage_drives_computer_id ON computer_storage_drives(computer_id);
CREATE INDEX IF NOT EXISTS idx_computer_installed_programs_computer_id ON computer_installed_programs(computer_id);
CREATE INDEX IF NOT EXISTS idx_computer_restrictions_computer_id ON computer_restrictions(computer_id);
CREATE INDEX IF NOT EXISTS idx_computer_locations_computer_id ON computer_locations(computer_id);
CREATE INDEX IF NOT EXISTS idx_computer_locations_created_at ON computer_locations(created_at);

-- Triggers para updated_at
CREATE TRIGGER update_computers_updated_at BEFORE UPDATE ON computers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_computer_storage_drives_updated_at BEFORE UPDATE ON computer_storage_drives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_computer_installed_programs_updated_at BEFORE UPDATE ON computer_installed_programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_computer_restrictions_updated_at BEFORE UPDATE ON computer_restrictions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


