// Script para verificar se todas as tabelas necessárias existem no banco de dados
require('dotenv').config();
const { query } = require('./server/database/config');

// Lista completa de tabelas esperadas (do schema.sql e migrations)
const expectedTables = [
    // Tabelas principais do schema.sql
    'organizations',
    'users',
    'device_users',
    'devices',
    'device_locations',
    'installed_apps',
    'device_groups',
    'device_group_memberships',
    'app_policies',
    'device_restrictions',
    'support_messages',
    'audit_logs',
    'system_configs',
    'app_access_history',
    'device_status_history',
    
    // Tabelas criadas por migrations
    'group_alert_history',
    'group_available_apps'
];

async function checkAllTables() {
    try {
        console.log('🔍 Verificando todas as tabelas do banco de dados...\n');
        
        // Buscar todas as tabelas que existem no banco
        const result = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);
        
        const existingTables = result.rows.map(row => row.table_name);
        
        console.log('📊 RESUMO DA VERIFICAÇÃO\n');
        console.log('═'.repeat(60));
        
        let allPresent = true;
        const missingTables = [];
        const extraTables = existingTables.filter(t => !expectedTables.includes(t));
        
        // Verificar cada tabela esperada
        console.log('\n✅ TABELAS ESPERADAS:\n');
        for (const tableName of expectedTables) {
            const exists = existingTables.includes(tableName);
            const status = exists ? '✅' : '❌';
            
            if (exists) {
                try {
                    const countResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
                    const count = countResult.rows[0]?.count || 0;
                    console.log(`  ${status} ${tableName.padEnd(35)} (${count} registros)`);
                } catch (err) {
                    console.log(`  ${status} ${tableName.padEnd(35)} (erro ao contar)`);
                }
            } else {
                console.log(`  ${status} ${tableName.padEnd(35)} AUSENTE`);
                allPresent = false;
                missingTables.push(tableName);
            }
        }
        
        // Mostrar tabelas extras (não esperadas)
        if (extraTables.length > 0) {
            console.log('\n⚠️  TABELAS EXTRAS (não esperadas):\n');
            extraTables.forEach(tableName => {
                console.log(`  ⚠️  ${tableName}`);
            });
        }
        
        // Resultado final
        console.log('\n' + '═'.repeat(60));
        if (allPresent) {
            console.log('\n✅ SUCESSO: Todas as tabelas esperadas estão presentes!');
        } else {
            console.log(`\n❌ FALTANDO: ${missingTables.length} tabela(s) não encontrada(s):`);
            missingTables.forEach(table => {
                console.log(`   - ${table}`);
            });
            
            console.log('\n💡 Para criar as tabelas faltantes:');
            console.log('   1. Execute o schema.sql: psql -d seu_banco -f server/database/schema.sql');
            console.log('   2. Execute as migrations: node server/database/migrations/run-migration.js');
        }
        
        // Estatísticas gerais
        console.log('\n📈 ESTATÍSTICAS:');
        console.log(`   Tabelas esperadas: ${expectedTables.length}`);
        console.log(`   Tabelas encontradas: ${existingTables.length}`);
        console.log(`   Tabelas faltando: ${missingTables.length}`);
        console.log(`   Tabelas extras: ${extraTables.length}`);
        
        process.exit(allPresent ? 0 : 1);
    } catch (error) {
        console.error('❌ Erro ao verificar tabelas:', error);
        process.exit(1);
    }
}

checkAllTables();

