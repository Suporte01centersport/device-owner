#!/usr/bin/env node

/**
 * Script para deletar dispositivos específicos do banco de dados
 * Uso: node server/delete-devices.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mdmweb',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function deleteDevices() {
    const client = await pool.connect();
    
    try {
        console.log('🗑️  Iniciando remoção de dispositivos...');
        
        // Buscar dispositivos para deletar
        const devicesToDelete = [
            { name: 'CSSPNOT0038', deviceId: null },
            { name: 'Teste2', deviceId: null }
        ];
        
        // Primeiro, buscar os IDs dos dispositivos
        for (const device of devicesToDelete) {
            const result = await client.query(
                'SELECT device_id, name FROM devices WHERE name = $1',
                [device.name]
            );
            
            if (result.rows.length > 0) {
                device.deviceId = result.rows[0].device_id;
                console.log(`📋 Encontrado: ${device.name} (${device.deviceId})`);
            } else {
                console.log(`⚠️  Dispositivo não encontrado: ${device.name}`);
            }
        }
        
        // Deletar cada dispositivo encontrado
        for (const device of devicesToDelete) {
            if (device.deviceId) {
                console.log(`\n🗑️  Deletando dispositivo: ${device.name} (${device.deviceId})...`);
                
                // Deletar vínculos de usuário primeiro (se houver)
                await client.query(
                    'UPDATE devices SET assigned_device_user_id = NULL WHERE device_id = $1',
                    [device.deviceId]
                );
                console.log(`  ✅ Vínculo de usuário removido`);
                
                // Deletar o dispositivo
                const deleteResult = await client.query(
                    'DELETE FROM devices WHERE device_id = $1',
                    [device.deviceId]
                );
                
                if (deleteResult.rowCount > 0) {
                    console.log(`  ✅ Dispositivo ${device.name} deletado com sucesso`);
                } else {
                    console.log(`  ⚠️  Dispositivo ${device.name} não foi deletado`);
                }
            }
        }
        
        // Verificar se há computadores com esses nomes também
        console.log('\n🔍 Verificando computadores...');
        const computersToDelete = ['CSSPNOT0038', 'Teste2'];
        
        for (const name of computersToDelete) {
            const result = await client.query(
                'SELECT computer_id, name FROM computers WHERE name = $1',
                [name]
            );
            
            if (result.rows.length > 0) {
                const computer = result.rows[0];
                console.log(`💻 Encontrado computador: ${computer.name} (${computer.computer_id})`);
                
                // Deletar computador
                await client.query('DELETE FROM computers WHERE computer_id = $1', [computer.computer_id]);
                console.log(`  ✅ Computador ${computer.name} deletado`);
            }
        }
        
        console.log('\n✅ Processo concluído!');
        
    } catch (error) {
        console.error('❌ Erro ao deletar dispositivos:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Executar
deleteDevices()
    .then(() => {
        console.log('✅ Script concluído com sucesso');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Falha no script:', error);
        process.exit(1);
    });

