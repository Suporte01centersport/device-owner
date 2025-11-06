#!/usr/bin/env node

/**
 * Script para limpar dispositivos órfãos do PostgreSQL
 * Remove dispositivos que podem ter sido criados com deviceId inválido
 */

require('dotenv').config();
const DeviceModel = require('../database/models/Device');
const { query } = require('../database/config');

async function cleanupOrphanedDevices() {
    try {
        console.log('🧹 Iniciando limpeza de dispositivos órfãos...');
        
        // 1. Listar todos os dispositivos no banco
        const allDevices = await query(`
            SELECT id, device_id, name, model, status, created_at, last_seen
            FROM devices 
            ORDER BY created_at DESC
        `);
        
        console.log(`\n📋 Dispositivos encontrados no banco: ${allDevices.rows.length}`);
        
        if (allDevices.rows.length === 0) {
            console.log('✅ Nenhum dispositivo encontrado. Nada para limpar.');
            return;
        }
        
        // 2. Mostrar dispositivos
        console.log('\n📱 Dispositivos no banco:');
        allDevices.rows.forEach((device, index) => {
            const createdDate = new Date(device.created_at).toLocaleString('pt-BR');
            const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString('pt-BR') : 'nunca';
            
            console.log(`\n${index + 1}. ${device.name || 'Sem nome'}`);
            console.log(`   DeviceId: ${device.device_id}`);
            console.log(`   Modelo: ${device.model || 'N/A'}`);
            console.log(`   Status: ${device.status}`);
            console.log(`   Criado: ${createdDate}`);
            console.log(`   Última vez visto: ${lastSeen}`);
            
            // Identificar dispositivos problemáticos
            if (device.device_id === 'unknown' || 
                device.device_id === 'unknown-device' ||
                device.device_id === 'null' ||
                device.device_id === 'undefined' ||
                !device.device_id ||
                device.device_id.length < 8) {
                console.log(`   ⚠️  DEVICE ID PROBLEMÁTICO!`);
            }
        });
        
        // 3. Identificar dispositivos com deviceId inválido
        const problematicDevices = allDevices.rows.filter(device => 
            device.device_id === 'unknown' || 
            device.device_id === 'unknown-device' ||
            device.device_id === 'null' ||
            device.device_id === 'undefined' ||
            !device.device_id ||
            device.device_id.length < 8
        );
        
        console.log(`\n⚠️  Dispositivos com DeviceId problemático: ${problematicDevices.length}`);
        
        if (problematicDevices.length === 0) {
            console.log('✅ Nenhum dispositivo com DeviceId problemático encontrado.');
            return;
        }
        
        // 4. Mostrar dispositivos problemáticos
        console.log('\n🚨 Dispositivos que serão removidos:');
        problematicDevices.forEach((device, index) => {
            console.log(`${index + 1}. ${device.name || 'Sem nome'} - DeviceId: "${device.device_id}"`);
        });
        
        // 5. Perguntar confirmação (simular - em produção, usar readline)
        console.log('\n❓ Deseja remover estes dispositivos problemáticos? (S/N)');
        console.log('   (Em ambiente de produção, use: node cleanup-orphaned-devices.js --confirm)');
        
        // Verificar se foi passado --confirm
        const shouldClean = process.argv.includes('--confirm');
        
        if (!shouldClean) {
            console.log('\n⏸️  Execução cancelada. Use --confirm para executar a limpeza.');
            console.log('   Exemplo: node cleanup-orphaned-devices.js --confirm');
            return;
        }
        
        // 6. Deletar dispositivos problemáticos
        console.log('\n🗑️  Removendo dispositivos problemáticos...');
        
        for (const device of problematicDevices) {
            try {
                console.log(`   Removendo: ${device.name || 'Sem nome'} (${device.device_id})`);
                await DeviceModel.delete(device.device_id);
                console.log(`   ✅ Removido com sucesso`);
            } catch (error) {
                console.log(`   ❌ Erro ao remover: ${error.message}`);
            }
        }
        
        // 7. Verificar resultado final
        const finalDevices = await query(`
            SELECT COUNT(*) as count FROM devices
        `);
        
        console.log(`\n✅ Limpeza concluída!`);
        console.log(`   Dispositivos restantes: ${finalDevices.rows[0].count}`);
        
    } catch (error) {
        console.error('❌ Erro durante a limpeza:', error.message);
        console.error(error);
    } finally {
        // Fechar conexão
        process.exit(0);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    cleanupOrphanedDevices();
}

module.exports = { cleanupOrphanedDevices };
