#!/usr/bin/env node

/**
 * Script para adicionar campos de localização (address e source) na tabela computers
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('../config');

async function runMigration() {
    try {
        console.log('🔄 Iniciando migração: Adicionar campos de localização...');
        
        const sqlFile = path.join(__dirname, 'add_computer_location_fields.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');
        
        // Executar SQL
        await query(sql);
        
        console.log('✅ Migração concluída com sucesso!');
        console.log('   - Adicionado campo location_address');
        console.log('   - Adicionado campo location_source');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao executar migração:', error);
        process.exit(1);
    }
}

runMigration();

