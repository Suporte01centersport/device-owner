#!/usr/bin/env node
/**
 * Cria usuário mdm_user e banco mdm_owner_dev no PostgreSQL
 * Execute: node server/scripts/setup-db-user.js
 * Ou com senha do postgres: PG_POSTGRES_PASSWORD=sua_senha node server/scripts/setup-db-user.js
 */
require('dotenv').config({ path: '.env.development' });

const { Pool } = require('pg');

const postgresPassword = process.env.PG_POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5432', 10);

const adminPool = new Pool({
  user: 'postgres',
  host,
  database: 'postgres',
  password: postgresPassword,
  port,
});

async function setup() {
  const client = await adminPool.connect();
  try {
    console.log('🔧 Configurando banco para MDM...');

    // 1. Criar usuário (ignora se já existir)
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mdm_user') THEN
            CREATE USER mdm_user WITH PASSWORD 'mdm_dev_password';
            RAISE NOTICE 'Usuário mdm_user criado';
          ELSE
            ALTER USER mdm_user WITH PASSWORD 'mdm_dev_password';
            RAISE NOTICE 'Senha do mdm_user atualizada';
          END IF;
        END
        $$;
      `);
      console.log('✅ Usuário mdm_user configurado');
    } catch (e) {
      if (e.message.includes('already exists')) {
        await client.query(`ALTER USER mdm_user WITH PASSWORD 'mdm_dev_password'`);
        console.log('✅ Senha do mdm_user atualizada');
      } else throw e;
    }

    // 2. Criar banco (ignora se já existir)
    const dbCheck = await client.query(`
      SELECT 1 FROM pg_database WHERE datname = 'mdm_owner_dev'
    `);
    if (dbCheck.rows.length === 0) {
      await client.query(`CREATE DATABASE mdm_owner_dev OWNER mdm_user`);
      console.log('✅ Banco mdm_owner_dev criado');
    } else {
      console.log('✅ Banco mdm_owner_dev já existe');
    }

    // 3. Conceder privilégios
    await client.query(`
      GRANT ALL PRIVILEGES ON DATABASE mdm_owner_dev TO mdm_user;
      GRANT CONNECT ON DATABASE mdm_owner_dev TO mdm_user;
    `).catch(() => {});
    
    console.log('✅ Privilégios concedidos');
    console.log('\n🎉 Setup concluído! Reinicie o servidor (npm run dev:all)');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.code === '28P01') {
      console.log('\n💡 Dica: A senha do postgres pode estar errada.');
      console.log('   Tente: PG_POSTGRES_PASSWORD=sua_senha node server/scripts/setup-db-user.js');
      console.log('   Ou execute manualmente no psql:');
      console.log('   psql -U postgres -f server/database/setup-db-user.sql');
    }
    process.exit(1);
  } finally {
    client.release();
    await adminPool.end();
  }
}

setup();
