#!/usr/bin/env node

/**
 * Script para executar a migration add_new_device_fields.sql
 * Adiciona os campos osType, meid e complianceStatus à tabela devices
 */

require('../../load-env');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados
const pool = new Pool({
    user: process.env.DB_USER || 'mdm_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mdm_owner',
    password: process.env.DB_PASSWORD || 'mdm_password',
    port: process.env.DB_PORT || 5432,
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Iniciando migration: add_new_device_fields.sql');
        console.log('═══════════════════════════════════════════════════════════');
        
        // Ler o arquivo SQL
        const migrationPath = path.join(__dirname, 'add_new_device_fields.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Iniciar transação
        await client.query('BEGIN');
        
        console.log('📝 Executando SQL...');
        
        // Executar migration
        await client.query(migrationSQL);
        
        // Verificar se os campos foram adicionados
        const checkQuery = `
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'devices'
            AND column_name IN ('os_type', 'meid', 'compliance_status')
            ORDER BY column_name;
        `;
        
        const result = await client.query(checkQuery);
        
        console.log('\n✅ Campos adicionados com sucesso:');
        result.rows.forEach(row => {
            console.log(`   - ${row.column_name} (${row.data_type}) ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
        });
        
        // Verificar índice
        const indexCheck = await client.query(`
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'devices'
            AND indexname = 'idx_devices_compliance_status';
        `);
        
        if (indexCheck.rows.length > 0) {
            console.log('\n✅ Índice criado: idx_devices_compliance_status');
        }
        
        // Verificar dispositivos atualizados
        const statsQuery = `
            SELECT 
                compliance_status,
                COUNT(*) as count
            FROM devices
            GROUP BY compliance_status
            ORDER BY compliance_status;
        `;
        
        const stats = await client.query(statsQuery);
        
        if (stats.rows.length > 0) {
            console.log('\n📊 Estatísticas de conformidade:');
            stats.rows.forEach(row => {
                console.log(`   - ${row.compliance_status}: ${row.count} dispositivo(s)`);
            });
        }
        
        // Commit
        await client.query('COMMIT');
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('✅ Migration concluída com sucesso!');
        console.log('═══════════════════════════════════════════════════════════\n');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao executar migration:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Executar migration
runMigration().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
});


