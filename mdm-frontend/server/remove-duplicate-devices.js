#!/usr/bin/env node

/**
 * Script para remover dispositivos duplicados
 * Remove dispositivos com mesmo modelo, mantendo apenas o mais recente
 */

require('dotenv').config();
const DeviceModel = require('./database/models/Device');
const { query } = require('./database/config');

async function removeDuplicateDevices() {
    try {
        console.log('🔍 Procurando dispositivos duplicados...');
        
        // 1. Buscar dispositivos agrupados por modelo
        const duplicates = await query(`
            SELECT 
                model,
                COUNT(*) as count,
                array_agg(device_id ORDER BY last_seen DESC) as device_ids,
                array_agg(name ORDER BY last_seen DESC) as names,
                array_agg(last_seen ORDER BY last_seen DESC) as last_seens,
                array_agg(created_at ORDER BY last_seen DESC) as created_ats
            FROM devices 
            GROUP BY model
            HAVING COUNT(*) > 1
            ORDER BY model
        `);
        
        if (duplicates.rows.length === 0) {
            console.log('✅ Nenhum dispositivo duplicado encontrado.');
            return;
        }
        
        console.log(`\n⚠️  Encontrados ${duplicates.rows.length} modelos com dispositivos duplicados:`);
        
        // 2. Mostrar duplicatas
        duplicates.rows.forEach((duplicate, index) => {
            console.log(`\n${index + 1}. Modelo: ${duplicate.model}`);
            console.log(`   Total de dispositivos: ${duplicate.count}`);
            
            for (let i = 0; i < duplicate.device_ids.length; i++) {
                const deviceId = duplicate.device_ids[i];
                const name = duplicate.names[i];
                const lastSeen = duplicate.last_seens[i] ? new Date(duplicate.last_seens[i]).toLocaleString('pt-BR') : 'nunca';
                const created = new Date(duplicate.created_ats[i]).toLocaleString('pt-BR');
                
                const marker = i === 0 ? '✅ MANTER' : '❌ REMOVER';
                console.log(`   ${marker} ${name || 'Sem nome'} (${deviceId.substring(0, 8)}...)`);
                console.log(`        Última vez visto: ${lastSeen}`);
                console.log(`        Criado: ${created}`);
            }
        });
        
        // 3. Verificar confirmação
        const shouldRemove = process.argv.includes('--confirm');
        
        if (!shouldRemove) {
            console.log('\n⏸️  Execução cancelada. Use --confirm para remover duplicatas.');
            console.log('   Exemplo: node remove-duplicate-devices.js --confirm');
            return;
        }
        
        // 4. Remover duplicatas (manter apenas o primeiro de cada grupo)
        console.log('\n🗑️  Removendo dispositivos duplicados...');
        
        for (const duplicate of duplicates.rows) {
            const deviceIdsToRemove = duplicate.device_ids.slice(1); // Remove todos exceto o primeiro
            
            for (const deviceId of deviceIdsToRemove) {
                try {
                    console.log(`   Removendo: ${deviceId.substring(0, 8)}... (${duplicate.model})`);
                    await DeviceModel.delete(deviceId);
                    console.log(`   ✅ Removido com sucesso`);
                } catch (error) {
                    console.log(`   ❌ Erro ao remover: ${error.message}`);
                }
            }
        }
        
        // 5. Verificar resultado
        const finalCount = await query(`SELECT COUNT(*) as count FROM devices`);
        console.log(`\n✅ Limpeza concluída!`);
        console.log(`   Dispositivos restantes: ${finalCount.rows[0].count}`);
        
        // 6. Mostrar dispositivos restantes
        const remainingDevices = await query(`
            SELECT device_id, name, model, status, last_seen
            FROM devices 
            ORDER BY last_seen DESC
        `);
        
        console.log('\n📱 Dispositivos restantes:');
        remainingDevices.rows.forEach((device, index) => {
            const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString('pt-BR') : 'nunca';
            console.log(`   ${index + 1}. ${device.name || 'Sem nome'} (${device.model}) - ${device.device_id.substring(0, 8)}... - ${device.status} - ${lastSeen}`);
        });
        
    } catch (error) {
        console.error('❌ Erro durante a limpeza:', error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    removeDuplicateDevices();
}

module.exports = { removeDuplicateDevices };
