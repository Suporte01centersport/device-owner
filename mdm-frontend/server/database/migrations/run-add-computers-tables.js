#!/usr/bin/env node

require('../../load-env');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mdmweb',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Iniciando migração das tabelas de computadores (UEM)...');
        
        // Ler o arquivo SQL
        const sqlPath = path.join(__dirname, 'add_computers_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Executar a migração
        await client.query(sql);
        
        console.log('✅ Migração executada com sucesso!');
        
        // Verificar se as tabelas foram criadas
        const tables = ['computers', 'computer_storage_drives', 'computer_installed_programs', 'computer_restrictions', 'computer_locations'];
        
        for (const table of tables) {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `, [table]);
            
            if (result.rows[0].exists) {
                console.log(`✅ Tabela ${table} criada com sucesso`);
            } else {
                console.log(`❌ Tabela ${table} não foi criada`);
            }
        }
        
        // Verificar estrutura da tabela principal
        const columnsResult = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'computers' 
            ORDER BY ordinal_position
        `);
        
        console.log('\n📊 Estrutura da tabela computers:');
        columnsResult.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
        console.log('\n✅ Migração concluída!');
        
    } catch (error) {
        console.error('❌ Erro ao executar migração:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Executar migração
runMigration()
    .then(() => {
        console.log('✅ Processo concluído com sucesso');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Falha na migração:', error);
        process.exit(1);
    });

