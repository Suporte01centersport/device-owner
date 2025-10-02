#!/usr/bin/env node

// Script de setup completo para PostgreSQL
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setup PostgreSQL para MDM Owner');
console.log('=====================================\n');

// Verificar se PostgreSQL está instalado
function checkPostgreSQL() {
    try {
        const version = execSync('psql --version', { encoding: 'utf8' });
        console.log('✅ PostgreSQL encontrado:', version.trim());
        return true;
    } catch (error) {
        console.log('❌ PostgreSQL não encontrado. Instale primeiro o PostgreSQL.');
        console.log('💡 Baixe em: https://www.postgresql.org/download/');
        return false;
    }
}

// Criar banco de dados
async function createDatabase() {
    const { Pool } = require('pg');
    
    // Conectar ao banco padrão 'postgres'
    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: 'postgres', // Conectar ao banco padrão primeiro
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
    });

    try {
        console.log('🔧 Criando banco de dados...');
        
        // Verificar se o banco já existe
        const result = await pool.query(
            "SELECT 1 FROM pg_database WHERE datname = 'mdm_owner'"
        );
        
        if (result.rows.length === 0) {
            await pool.query('CREATE DATABASE mdm_owner');
            console.log('✅ Banco de dados "mdm_owner" criado!');
        } else {
            console.log('ℹ️ Banco de dados "mdm_owner" já existe.');
        }
        
    } catch (error) {
        console.error('❌ Erro ao criar banco:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

// Executar schema SQL
async function runSchema() {
    const { Pool } = require('pg');
    
    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: 'mdm_owner',
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
    });

    try {
        console.log('📋 Executando schema SQL...');
        
        const schemaPath = path.join(__dirname, 'database/schema.sql');
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        
        await pool.query(schemaSQL);
        console.log('✅ Schema executado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao executar schema:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

// Executar migração
async function runMigration() {
    try {
        console.log('🔄 Executando migração de dados...');
        
        const migration = require('./database/migration');
        await migration.migrateDevicesFromJSON();
        
    } catch (error) {
        console.error('❌ Erro na migração:', error.message);
        throw error;
    }
}

// Criar arquivo .env
function createEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', 'env.example');
    
    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
        fs.copyFileSync(envExamplePath, envPath);
        console.log('✅ Arquivo .env criado!');
        console.log('💡 Edite o arquivo .env com suas configurações do PostgreSQL.');
    } else if (fs.existsSync(envPath)) {
        console.log('ℹ️ Arquivo .env já existe.');
    }
}

// Função principal
async function main() {
    try {
        // Verificar PostgreSQL
        if (!checkPostgreSQL()) {
            process.exit(1);
        }
        
        // Criar banco
        await createDatabase();
        
        // Executar schema
        await runSchema();
        
        // Criar .env
        createEnvFile();
        
        // Perguntar sobre migração
        console.log('\n📦 Migração de dados:');
        console.log('Os dados do arquivo devices.json serão migrados para PostgreSQL.');
        console.log('Um backup será criado automaticamente.');
        
        // Executar migração
        await runMigration();
        
        console.log('\n🎉 Setup concluído com sucesso!');
        console.log('=====================================');
        console.log('✅ PostgreSQL configurado');
        console.log('✅ Banco de dados criado');
        console.log('✅ Schema executado');
        console.log('✅ Dados migrados');
        console.log('✅ Arquivo .env criado');
        console.log('\n💡 Próximos passos:');
        console.log('1. Edite o arquivo .env com suas configurações');
        console.log('2. Reinicie o servidor WebSocket');
        console.log('3. Os dados agora serão salvos no PostgreSQL!');
        
    } catch (error) {
        console.error('\n💥 Erro durante o setup:', error.message);
        console.log('\n🔧 Soluções:');
        console.log('1. Verifique se o PostgreSQL está rodando');
        console.log('2. Verifique as credenciais no arquivo .env');
        console.log('3. Execute: sudo -u postgres psql -c "CREATE USER postgres SUPERUSER;"');
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { main };
