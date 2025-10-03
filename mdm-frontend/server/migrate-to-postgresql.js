#!/usr/bin/env node

// Script de migração de JSON para PostgreSQL
// Execute: node migrate-to-postgresql.js

const { testConnection, initializeDatabase, migrateFromJson } = require('./database/config');
const path = require('path');
const fs = require('fs');

async function main() {
    console.log('🚀 Iniciando migração para PostgreSQL...\n');

    try {
        // 1. Testar conexão
        console.log('1️⃣ Testando conexão com PostgreSQL...');
        const connected = await testConnection();
        if (!connected) {
            console.error('❌ Não foi possível conectar ao PostgreSQL');
            console.log('\n📋 Verifique se:');
            console.log('   - PostgreSQL está rodando');
            console.log('   - Banco de dados "mdm_owner" existe');
            console.log('   - Usuário "mdm_user" tem permissões');
            console.log('   - Variáveis de ambiente estão configuradas');
            process.exit(1);
        }

        // 2. Inicializar banco de dados
        console.log('\n2️⃣ Inicializando schema do banco de dados...');
        await initializeDatabase();
        console.log('✅ Schema inicializado com sucesso');

        // 3. Migrar dados dos arquivos JSON
        console.log('\n3️⃣ Migrando dados dos arquivos JSON...');
        await migrateFromJson();
        console.log('✅ Dados migrados com sucesso');

        // 4. Criar backup dos arquivos JSON originais
        console.log('\n4️⃣ Criando backup dos arquivos JSON originais...');
        const backupDir = path.join(__dirname, 'backup', `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const filesToBackup = [
            'devices.json',
            'admin_password.json',
            'support_messages.json'
        ];

        for (const file of filesToBackup) {
            const sourcePath = path.join(__dirname, file);
            const backupPath = path.join(backupDir, file);
            
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, backupPath);
                console.log(`   📁 ${file} → backup criado`);
            }
        }

        // 5. Atualizar websocket.js para usar PostgreSQL
        console.log('\n5️⃣ Atualizando websocket.js para usar PostgreSQL...');
        await updateWebSocketFile();

        console.log('\n🎉 Migração concluída com sucesso!');
        console.log('\n📋 Próximos passos:');
        console.log('   1. Reinicie o servidor WebSocket');
        console.log('   2. Teste a conectividade dos dispositivos');
        console.log('   3. Verifique se os dados estão sendo salvos no PostgreSQL');
        console.log('   4. Os arquivos JSON originais foram movidos para backup/');

    } catch (error) {
        console.error('\n❌ Erro durante a migração:', error.message);
        console.log('\n🔧 Solução de problemas:');
        console.log('   1. Verifique se o PostgreSQL está rodando');
        console.log('   2. Confirme as credenciais do banco de dados');
        console.log('   3. Execute o script novamente');
        process.exit(1);
    }
}

async function updateWebSocketFile() {
    const websocketPath = path.join(__dirname, 'websocket.js');
    
    if (!fs.existsSync(websocketPath)) {
        console.log('   ⚠️ Arquivo websocket.js não encontrado, pulando atualização');
        return;
    }

    // Ler arquivo atual
    let content = fs.readFileSync(websocketPath, 'utf8');

    // Adicionar imports do PostgreSQL no início
    const postgresImports = `
// PostgreSQL imports
const DeviceModel = require('./database/models/Device');
const DeviceGroupModel = require('./database/models/DeviceGroup');
const { query, transaction } = require('./database/config');
`;

    // Inserir imports após os imports existentes
    const importIndex = content.indexOf("const config = require('./config');");
    if (importIndex !== -1) {
        content = content.slice(0, importIndex + "const config = require('./config');".length) + 
                 postgresImports + 
                 content.slice(importIndex + "const config = require('./config');".length);
    }

    // Substituir funções de persistência
    const oldPersistenceCode = `
// Funções de persistência
function loadDevicesFromFile() {
    try {
        if (fs.existsSync(DEVICES_FILE)) {
            const data = fs.readFileSync(DEVICES_FILE, 'utf8');
            const devices = JSON.parse(data);
            
            // Converter array para Map
            devices.forEach(device => {
                persistentDevices.set(device.deviceId, device);
            });
            
            log.info(\`Dispositivos carregados do arquivo\`, { count: devices.length });
        } else {
            log.info('Arquivo de dispositivos não encontrado, iniciando com lista vazia');
        }
    } catch (error) {
        log.error('Erro ao carregar dispositivos do arquivo', error);
    }
}

function saveDevicesToFile() {
    try {
        const devices = Array.from(persistentDevices.values());
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
        log.debug(\`Dispositivos salvos no arquivo\`, { count: devices.length });
    } catch (error) {
        log.error('Erro ao salvar dispositivos no arquivo', error);
    }
}`;

    const newPersistenceCode = `
// Funções de persistência PostgreSQL
async function loadDevicesFromDatabase() {
    try {
        const devices = await DeviceModel.findAll();
        
        // Converter array para Map para compatibilidade
        devices.forEach(device => {
            persistentDevices.set(device.device_id, device);
        });
        
        log.info(\`Dispositivos carregados do PostgreSQL\`, { count: devices.length });
    } catch (error) {
        log.error('Erro ao carregar dispositivos do PostgreSQL', error);
    }
}

async function saveDeviceToDatabase(deviceData) {
    try {
        await DeviceModel.upsert(deviceData);
        log.debug(\`Dispositivo salvo no PostgreSQL\`, { deviceId: deviceData.deviceId });
    } catch (error) {
        log.error('Erro ao salvar dispositivo no PostgreSQL', error);
    }
}`;

    content = content.replace(oldPersistenceCode, newPersistenceCode);

    // Atualizar chamadas de persistência
    content = content.replace(/loadDevicesFromFile\(\)/g, 'await loadDevicesFromDatabase()');
    content = content.replace(/saveDevicesToFile\(\)/g, 'await saveDeviceToDatabase(deviceData)');

    // Salvar arquivo atualizado
    fs.writeFileSync(websocketPath, content);
    console.log('   ✅ websocket.js atualizado para usar PostgreSQL');
}

// Executar migração
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
