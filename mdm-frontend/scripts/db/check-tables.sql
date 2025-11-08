-- Script SQL para verificar todas as tabelas no banco de dados PostgreSQL
-- Execute: psql -d seu_banco -f check-tables.sql

\echo '🔍 Verificando todas as tabelas do banco de dados...'
\echo ''

-- Lista de tabelas esperadas
\echo '📊 TABELAS ESPERADAS:'
\echo ''

-- Verificar existência das tabelas
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = t.table_name
        ) 
        THEN '✅ EXISTE'
        ELSE '❌ AUSENTE'
    END as status,
    t.table_name as tabela
FROM (VALUES
    ('organizations'),
    ('users'),
    ('device_users'),
    ('devices'),
    ('device_locations'),
    ('installed_apps'),
    ('device_groups'),
    ('device_group_memberships'),
    ('app_policies'),
    ('device_restrictions'),
    ('support_messages'),
    ('audit_logs'),
    ('system_configs'),
    ('app_access_history'),
    ('device_status_history'),
    ('group_alert_history'),
    ('group_available_apps')
) AS t(table_name)
ORDER BY t.table_name;

\echo ''
\echo '📈 ESTATÍSTICAS:'
\echo ''

SELECT 
    COUNT(DISTINCT CASE WHEN table_name IN (
        'organizations', 'users', 'device_users', 'devices', 'device_locations',
        'installed_apps', 'device_groups', 'device_group_memberships',
        'app_policies', 'device_restrictions', 'support_messages',
        'audit_logs', 'system_configs', 'app_access_history',
        'device_status_history', 'group_alert_history', 'group_available_apps'
    ) THEN table_name END) as "Tabelas Esperadas Encontradas",
    COUNT(*) as "Total de Tabelas no Banco"
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';

\echo ''
\echo '📊 TODAS AS TABELAS PRESENTES NO BANCO:'
\echo ''

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

\echo ''
\echo '✅ Verificação concluída!'
\echo ''
\echo '💡 Para contar registros em uma tabela específica:'
\echo '   SELECT COUNT(*) FROM nome_da_tabela;'

