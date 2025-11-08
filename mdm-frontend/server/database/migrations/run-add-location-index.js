// Script para aplicar migração de índice de localização
require('../../load-env');
const { query } = require('../config');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('🔄 Aplicando migração: add_location_index');
        
        const sqlPath = path.join(__dirname, 'add_location_index.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        await query(sql);
        
        console.log('✅ Migração aplicada com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao aplicar migração:', error);
        process.exit(1);
    }
}

runMigration();

