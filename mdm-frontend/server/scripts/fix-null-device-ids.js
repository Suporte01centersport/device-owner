#!/usr/bin/env node

/**
 * Script para corrigir dispositivos com device_id NULL no banco
 */

require('dotenv').config();
const { query } = require('../database/config');

async function fixNullDeviceIds() {
    try {
        console.log('🔧 Verificando dispositivos com device_id NULL...');
        
        // 1. Buscar dispositivos com device_id NULL
        const nullDevices = await query(`
            SELECT id, device_id, name, model, created_at 
            FROM devices 
            WHERE device_id IS NULL OR device_id = 'null' OR device_id = ''
            ORDER BY created_at DESC
        `);
        
        if (nullDevices.rows.length === 0) {
            console.log('✅ Nenhum dispositivo com device_id NULL encontrado.');
            return;
        }
        
        console.log(`\n⚠️  Encontrados ${nullDevices.rows.length} dispositivos com device_id inválido:`);
        
        nullDevices.rows.forEach((device, index) => {
            console.log(`\n${index + 1}. ID: ${device.id}`);
            console.log(`   device_id: "${device.device_id}"`);
            console.log(`   name: "${device.name}"`);
            console.log(`   model: "${device.model}"`);
            console.log(`   criado: ${new Date(device.created_at).toLocaleString('pt-BR')}`);
        });
        
        // 2. Verificar confirmação
        const shouldFix = process.argv.includes('--confirm');
        
        if (!shouldFix) {
            console.log('\n⏸️  Execução cancelada. Use --confirm para corrigir.');
            console.log('   Exemplo: node fix-null-device-ids.js --confirm');
            console.log('\n⚠️  ATENÇÃO: Esta operação irá DELETAR dispositivos com device_id inválido!');
            return;
        }
        
        // 3. Deletar dispositivos com device_id inválido
        console.log('\n🗑️  Deletando dispositivos com device_id inválido...');
        
        for (const device of nullDevices.rows) {
            try {
                console.log(`   Deletando: ${device.name || 'Sem nome'} (ID: ${device.id})`);
                
                // Deletar dados relacionados primeiro
                await query('DELETE FROM device_locations WHERE device_id = $1', [device.id]);
                await query('DELETE FROM installed_apps WHERE device_id = $1', [device.id]);
                await query('DELETE FROM device_group_memberships WHERE device_id = $1', [device.id]);
                await query('DELETE FROM device_restrictions WHERE device_id = $1', [device.id]);
                
                // Deletar o dispositivo
                await query('DELETE FROM devices WHERE id = $1', [device.id]);
                
                console.log(`   ✅ Deletado com sucesso`);
            } catch (error) {
                console.log(`   ❌ Erro ao deletar: ${error.message}`);
            }
        }
        
        // 4. Verificar resultado
        const remainingDevices = await query('SELECT COUNT(*) as count FROM devices');
        console.log(`\n✅ Limpeza concluída!`);
        console.log(`   Dispositivos restantes: ${remainingDevices.rows[0].count}`);
        
        // 5. Mostrar dispositivos restantes
        const finalDevices = await query(`
            SELECT id, device_id, name, model, status, last_seen
            FROM devices 
            ORDER BY last_seen DESC
        `);
        
        console.log('\n📱 Dispositivos restantes:');
        finalDevices.rows.forEach((device, index) => {
            const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString('pt-BR') : 'nunca';
            console.log(`   ${index + 1}. ${device.name || 'Sem nome'} (${device.model}) - ${device.device_id} - ${device.status} - ${lastSeen}`);
        });
        
    } catch (error) {
        console.error('❌ Erro durante a correção:', error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    fixNullDeviceIds();
}

module.exports = { fixNullDeviceIds };
