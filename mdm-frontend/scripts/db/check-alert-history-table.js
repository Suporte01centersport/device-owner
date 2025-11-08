// Script para verificar se a tabela group_alert_history existe
require('../../server/load-env');
const { query } = require('../../server/database/config');

async function checkTable() {
    try {
        console.log('🔍 Verificando se a tabela group_alert_history existe...');
        
        const result = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'group_alert_history'
            );
        `);
        
        const exists = result.rows[0]?.exists;
        
        if (exists) {
            console.log('✅ Tabela group_alert_history existe!');
            
            // Contar registros
            const countResult = await query('SELECT COUNT(*) as count FROM group_alert_history');
            console.log(`   Total de registros: ${countResult.rows[0]?.count || 0}`);
            
            // Mostrar estrutura
            const structureResult = await query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'group_alert_history'
                ORDER BY ordinal_position;
            `);
            
            console.log('\n📋 Estrutura da tabela:');
            structureResult.rows.forEach(row => {
                console.log(`   - ${row.column_name}: ${row.data_type}`);
            });
        } else {
            console.log('❌ Tabela group_alert_history NÃO existe!');
            console.log('   Execute: npm run db:migrate:alert-history');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao verificar tabela:', error);
        process.exit(1);
    }
}

checkTable();

