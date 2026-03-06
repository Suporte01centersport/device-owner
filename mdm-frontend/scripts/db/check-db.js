process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || '.env.development';
require('../../server/load-env');
const { query } = require('../../server/database/config');

async function checkDatabase() {
    try {
        console.log('🔍 Verificando dados no banco...');
        
        // Verificar se há dados na tabela
        const result = await query('SELECT COUNT(*) as total FROM app_access_history');
        console.log('📊 Total de registros na tabela app_access_history:', result.rows[0].total);
        
        // Verificar últimos 10 acessos
        const recent = await query(`
            SELECT device_id, package_name, app_name, access_count, 
                   last_access_time, access_date
            FROM app_access_history 
            ORDER BY last_access_time DESC 
            LIMIT 10
        `);
        
        console.log('\n📱 Últimos 10 acessos:');
        recent.rows.forEach((row, i) => {
            console.log(`${i+1}. ${row.app_name} (${row.package_name})`);
            console.log(`   Device: ${row.device_id}`);
            console.log(`   Acessos: ${row.access_count}`);
            console.log(`   Data: ${row.access_date}`);
            console.log(`   Último: ${row.last_access_time}`);
            console.log('');
        });
        
        // Verificar dispositivos
        const devices = await query('SELECT device_id, name, status FROM devices ORDER BY last_seen DESC LIMIT 5');
        console.log('📱 Dispositivos registrados:');
        devices.rows.forEach(device => {
            console.log(`- ${device.name} (${device.device_id}) - ${device.status}`);
        });
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

checkDatabase();
