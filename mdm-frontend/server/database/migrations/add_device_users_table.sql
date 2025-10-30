-- Migration: Criar tabela device_users e vincular com devices
-- Data: 2025-10-28
-- Descrição: Cria estrutura robusta para gerenciar usuários finais vinculados a dispositivos

-- 1. Criar tabela de usuários finais
CREATE TABLE IF NOT EXISTS device_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) UNIQUE NOT NULL, -- ID customizado do usuário
    name VARCHAR(255) NOT NULL, -- Nome completo
    cpf VARCHAR(14) UNIQUE NOT NULL, -- CPF do usuário
    email VARCHAR(255),
    phone VARCHAR(20),
    department VARCHAR(100),
    position VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Criar índices para device_users
CREATE INDEX IF NOT EXISTS idx_device_users_organization_id ON device_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_device_users_user_id ON device_users(user_id);
CREATE INDEX IF NOT EXISTS idx_device_users_cpf ON device_users(cpf);
CREATE INDEX IF NOT EXISTS idx_device_users_is_active ON device_users(is_active);

-- 3. Criar trigger para updated_at
DROP TRIGGER IF EXISTS update_device_users_updated_at ON device_users;
CREATE TRIGGER update_device_users_updated_at 
    BEFORE UPDATE ON device_users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Adicionar nova coluna na tabela devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS assigned_device_user_id UUID REFERENCES device_users(id) ON DELETE SET NULL;

-- 5. Criar índice para a nova coluna
CREATE INDEX IF NOT EXISTS idx_devices_assigned_device_user_id ON devices(assigned_device_user_id);

-- 6. Migrar dados existentes (se houver assigned_user_id e assigned_user_name)
-- Criar usuários temporários para devices que já têm usuários vinculados
DO $$
DECLARE
    device_record RECORD;
    new_device_user_id UUID;
    default_org_id UUID;
    has_old_columns BOOLEAN;
    old_user_id_exists BOOLEAN;
    old_user_name_exists BOOLEAN;
BEGIN
    -- Verificar se as colunas antigas existem
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' AND column_name = 'assigned_user_id'
    ) INTO old_user_id_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' AND column_name = 'assigned_user_name'
    ) INTO old_user_name_exists;
    
    has_old_columns := old_user_id_exists AND old_user_name_exists;
    
    IF NOT has_old_columns THEN
        RAISE NOTICE '✅ Colunas antigas não encontradas. Pulando migração de dados.';
        RAISE NOTICE 'ℹ️ Esta é uma instalação nova ou já migrada.';
    ELSE
        RAISE NOTICE '🔄 Colunas antigas encontradas. Iniciando migração de dados...';
        
        -- Buscar uma organização padrão (ou criar uma se não existir)
        SELECT id INTO default_org_id FROM organizations LIMIT 1;
        
        -- Se não houver organização, criar uma padrão
        IF default_org_id IS NULL THEN
            INSERT INTO organizations (name, slug, description)
            VALUES ('Organização Padrão', 'default', 'Organização criada automaticamente durante migração')
            RETURNING id INTO default_org_id;
        END IF;

        -- Para cada dispositivo com usuário vinculado (campos antigos)
        FOR device_record IN 
            EXECUTE format('SELECT id, device_id, assigned_user_id, assigned_user_name, organization_id
                           FROM devices 
                           WHERE assigned_user_id IS NOT NULL AND assigned_user_id != ''''')
        LOOP
            -- Verificar se já existe um device_user com esse user_id
            SELECT id INTO new_device_user_id 
            FROM device_users 
            WHERE user_id = device_record.assigned_user_id;
            
            -- Se não existir, criar um novo
            IF new_device_user_id IS NULL THEN
                INSERT INTO device_users (
                    organization_id,
                    user_id,
                    name,
                    cpf,
                    is_active
                ) VALUES (
                    COALESCE(device_record.organization_id, default_org_id),
                    device_record.assigned_user_id,
                    COALESCE(device_record.assigned_user_name, 'Usuário Migrado'),
                    'MIGRADO-' || device_record.assigned_user_id, -- CPF temporário
                    true
                )
                RETURNING id INTO new_device_user_id;
                
                RAISE NOTICE '✅ Criado device_user para %', device_record.assigned_user_id;
            END IF;
            
            -- Atualizar o device com o novo vínculo
            UPDATE devices 
            SET assigned_device_user_id = new_device_user_id
            WHERE id = device_record.id;
            
            RAISE NOTICE '✅ Vinculado device % ao device_user %', device_record.device_id, new_device_user_id;
        END LOOP;
        
        RAISE NOTICE '✅ Migração de usuários concluída!';
    END IF;
END $$;

-- 7. Após confirmar que a migração funcionou, as colunas antigas podem ser removidas
-- IMPORTANTE: Execute isso manualmente após verificar que tudo está funcionando
-- ALTER TABLE devices DROP COLUMN IF EXISTS assigned_user_id;
-- ALTER TABLE devices DROP COLUMN IF EXISTS assigned_user_name;

-- 8. Comentários nas tabelas
COMMENT ON TABLE device_users IS 'Usuários finais vinculados aos dispositivos (funcionários, alunos, etc.)';
COMMENT ON COLUMN device_users.user_id IS 'ID customizado do usuário (pode ser matrícula, código de funcionário, etc.)';
COMMENT ON COLUMN device_users.cpf IS 'CPF do usuário brasileiro (formato: 000.000.000-00)';
COMMENT ON COLUMN devices.assigned_device_user_id IS 'Vínculo com usuário final via foreign key para device_users';

-- Finalizado
SELECT 'Migration completed successfully!' AS status;

