#!/usr/bin/env node
/**
 * Migração inicial do PostgreSQL - schema + dados iniciais
 * Cria o banco se não existir, depois aplica o schema.
 * Usa .env.development por padrão. Para produção: DOTENV_CONFIG_PATH=.env.production
 */
const path = require('path');
const envPath = process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '..', '.env.development');
require('dotenv').config({ path: envPath });

const { Pool } = require('pg');
const { testConnection, initializeDatabase } = require('./database/config');

const dbName = process.env.DB_NAME || 'mdm_owner_dev';

async function ensureDatabaseExists() {
  const maintenancePool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const client = await maintenancePool.connect();
  try {
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );
    if (res.rows.length === 0) {
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log('✅ Banco criado:', dbName);
    } else {
      console.log('   Banco já existe:', dbName);
    }
  } finally {
    client.release();
    await maintenancePool.end();
  }
}

async function migrate() {
  console.log('🔧 Migração PostgreSQL - MDM Owner');
  console.log('   Banco:', dbName);
  console.log('   Host:', process.env.DB_HOST || 'localhost');
  console.log('');

  try {
    await ensureDatabaseExists();
    const ok = await testConnection();
    if (!ok) {
      console.error('❌ Não foi possível conectar ao banco. Verifique SETUP-BANCO.md');
      process.exit(1);
    }

    await initializeDatabase();
    console.log('\n🎉 Migração concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('already exists') || msg.includes('duplicate key') || msg.includes('relation') || msg.includes('já existe')) {
      console.log('✅ Schema já aplicado - banco pronto.');
      process.exit(0);
    }
    console.error('❌ Erro na migração:', error.message);
    process.exit(1);
  }
}

migrate();
