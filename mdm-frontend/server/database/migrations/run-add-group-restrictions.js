// Script para executar a migration de adicionar restrições de grupo
require('../../load-env');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mdm_owner',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Executando migration: add_group_restrictions');
    
    const sqlPath = path.join(__dirname, 'add_group_restrictions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✅ Migration executada com sucesso!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao executar migration:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

