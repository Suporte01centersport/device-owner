// Teste simples de conexão PostgreSQL
const { Client } = require('pg');

async function testConnection() {
    console.log('🔍 Testando conexão PostgreSQL...');
    
    const client = new Client({
        host: 'localhost',
        port: 5432,
        database: 'mdmweb',
        user: 'postgres',
        password: '2486',
        ssl: false
    });

    try {
        await client.connect();
        console.log('✅ Conectado ao PostgreSQL');

        // Testar query simples
        const result = await client.query('SELECT NOW()');
        console.log('✅ Query executada:', result.rows[0].now);

        // Verificar tabelas
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('📊 Tabelas encontradas:');
        tablesResult.rows.forEach(row => console.log(`   - ${row.table_name}`));

        // Verificar dados
        const devicesCount = await client.query('SELECT COUNT(*) FROM devices');
        const orgsCount = await client.query('SELECT COUNT(*) FROM organizations');
        const usersCount = await client.query('SELECT COUNT(*) FROM users');

        console.log('📈 Dados:');
        console.log(`   - Dispositivos: ${devicesCount.rows[0].count}`);
        console.log(`   - Organizações: ${orgsCount.rows[0].count}`);
        console.log(`   - Usuários: ${usersCount.rows[0].count}`);

        await client.end();
        console.log('✅ Teste concluído com sucesso!');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

testConnection();
