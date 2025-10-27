const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do banco
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'mdm_owner',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Iniciando migração da tabela app_access_history...');
        
        // Ler o arquivo SQL
        const sqlPath = path.join(__dirname, 'create_app_access_history.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Executar a migração
        await client.query(sql);
        
        console.log('✅ Migração executada com sucesso!');
        
        // Verificar se a tabela foi criada
        const result = await client.query(`
            SELECT 
                table_name, 
                column_name, 
                data_type 
            FROM information_schema.columns 
            WHERE table_name = 'app_access_history' 
            ORDER BY ordinal_position
        `);
        
        console.log('📊 Estrutura da tabela app_access_history:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
        // Testar inserção
        console.log('🧪 Testando inserção...');
        const testResult = await client.query(`
            INSERT INTO app_access_history (
                device_id, package_name, app_name, access_date,
                first_access_time, last_access_time, access_count, total_duration_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, device_id, package_name, app_name, access_count
        `, [
            'test-device-id',
            'com.test.app',
            'Test App',
            new Date().toISOString().split('T')[0],
            new Date(),
            new Date(),
            1,
            0
        ]);
        
        console.log('✅ Teste de inserção bem-sucedido:', testResult.rows[0]);
        
        // Limpar dados de teste
        await client.query('DELETE FROM app_access_history WHERE device_id = $1', ['test-device-id']);
        console.log('🧹 Dados de teste removidos');
        
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Executar migração se chamado diretamente
if (require.main === module) {
    runMigration()
        .then(() => {
            console.log('🎉 Migração concluída com sucesso!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Falha na migração:', error);
            process.exit(1);
        });
}

module.exports = { runMigration };
