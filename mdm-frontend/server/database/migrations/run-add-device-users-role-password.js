#!/usr/bin/env node

/**
 * Migration: Adicionar role (operador/líder) e unlock_password em device_users
 */

require('../../load-env');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mdmweb',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 5432,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🚀 Iniciando migration: add_device_users_role_password.sql');
        const migrationPath = path.join(__dirname, 'add_device_users_role_password.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        await client.query('BEGIN');
        await client.query(migrationSQL);
        const result = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'device_users'
            AND column_name IN ('role', 'unlock_password')
            ORDER BY column_name;
        `);
        console.log('✅ Campos adicionados:', result.rows.map(r => r.column_name).join(', '));
        await client.query('COMMIT');
        console.log('✅ Migration concluída!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(e => { console.error(e); process.exit(1); });
