# 📦 Sistema de Atualização Automática de APK

Sistema completo para atualizar o MDM Launcher automaticamente usando o link do GitHub, com instalação silenciosa via Device Owner.

## 📋 Índice

1. [Como Funciona](#como-funciona)
2. [Métodos de Uso](#métodos-de-uso)
3. [Exemplos Práticos](#exemplos-práticos)
4. [Testando](#testando)
5. [Troubleshooting](#troubleshooting)

---

## 🔧 Como Funciona

### Fluxo Completo

```
Servidor Web → WebSocket → Dispositivo Android
     |             |              |
     |             |              ├─ Baixa APK
     |             |              ├─ Valida Device Owner
     |             |              ├─ Instala Silenciosamente
     |             |              └─ Envia Status
     |             |
     |             └── Monitora progresso
     |
     └── Recebe confirmação
```

### Componentes

#### 1. **Android (Cliente)**
- **`AppUpdater.kt`**: Gerenciador de download e instalação
  - Usa `DownloadManager` para baixar APK
  - Monitora progresso em tempo real (0-100%)
  - Instala silenciosamente via `PackageInstaller` (Device Owner)
  - Envia status para o servidor

- **`WebSocketService.kt`**: Processa comando `update_app`
  - Recebe URL do APK e versão
  - Chama `AppUpdater.downloadAndInstall()`
  - Envia progresso ao servidor

#### 2. **Servidor (Node.js)**
- **`websocket.js`**: Função `sendAppUpdateCommand()`
  - Envia comando para dispositivos específicos ou todos
  - Rastreia sucesso/falha
  - Retorna resultados

- **`/api/devices/update-app`**: API REST
  - Endpoint HTTP para facilitar integração
  - Aceita `deviceIds`, `apkUrl` e `version`

---

## 📡 Métodos de Uso

### Método 1: Console do Servidor (Mais Simples)

Conecte-se ao console do servidor Node.js e execute:

```javascript
// Atualizar dispositivo específico
sendAppUpdateCommand(
  "device123", 
  "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
  "1.0.1"
);

// Atualizar múltiplos dispositivos
sendAppUpdateCommand(
  ["device123", "device456", "device789"], 
  "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
  "1.0.1"
);

// Atualizar TODOS os dispositivos conectados
sendAppUpdateCommand(
  "all", 
  "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
  "1.0.1"
);
```

### Método 2: API REST

Use qualquer cliente HTTP (Postman, curl, frontend):

#### Endpoint
```
POST http://localhost:3000/api/devices/update-app
```

#### Headers
```json
{
  "Content-Type": "application/json"
}
```

#### Body (JSON)
```json
{
  "deviceIds": ["device123"],
  "apkUrl": "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
  "version": "1.0.1"
}
```

#### Exemplo com cURL
```bash
curl -X POST http://localhost:3000/api/devices/update-app \
  -H "Content-Type: application/json" \
  -d '{
    "deviceIds": "all",
    "apkUrl": "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
    "version": "1.0.1"
  }'
```

#### Exemplo com PowerShell
```powershell
$body = @{
    deviceIds = "all"
    apkUrl = "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk"
    version = "1.0.1"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/devices/update-app" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

---

## 💡 Exemplos Práticos

### Exemplo 1: Atualizar Um Dispositivo

```javascript
// No console do servidor
sendAppUpdateCommand(
  "SAMSUNG-SM-G973F-R28M70DDCEA",
  "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
  "1.0.1"
);
```

**Saída esperada:**
```
═══════════════════════════════════════════════
📥 ENVIANDO COMANDO DE ATUALIZAÇÃO DE APK
═══════════════════════════════════════════════
Dispositivos: SAMSUNG-SM-G973F-R28M70DDCEA
URL do APK: https://github.com/.../app-debug.apk
Versão: 1.0.1
🎯 Enviando para dispositivo específico: SAMSUNG-SM-G973F-R28M70DDCEA
✅ Comando enviado para dispositivo: SAMSUNG-SM-G973F-R28M70DDCEA
═══════════════════════════════════════════════
📊 Resultado: 1 enviados, 0 falharam
═══════════════════════════════════════════════
```

### Exemplo 2: Atualizar Todos os Dispositivos

```javascript
sendAppUpdateCommand(
  "all",
  "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
  "1.0.2"
);
```

### Exemplo 3: Via API com Fetch (Frontend)

```javascript
async function atualizarDispositivos() {
  try {
    const response = await fetch('http://localhost:3000/api/devices/update-app', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deviceIds: 'all',
        apkUrl: 'https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk',
        version: '1.0.3'
      })
    });

    const result = await response.json();
    console.log('Atualização iniciada:', result);
  } catch (error) {
    console.error('Erro ao atualizar:', error);
  }
}

// Chamar a função
atualizarDispositivos();
```

---

## 🧪 Testando

### 1. Verificar Servidor Rodando

```bash
# Verificar se o servidor WebSocket está ativo
netstat -an | findstr :3002
```

### 2. Verificar Dispositivos Conectados

No console do servidor Node.js:

```javascript
// Ver dispositivos conectados
Array.from(connectedDevices.keys())

// Exemplo de saída:
// ['SAMSUNG-SM-G973F-R28M70DDCEA', 'XIAOMI-Redmi-Note-8-1234567']
```

### 3. Testar Download (Sem Instalar)

```javascript
// Usar um URL de teste menor
sendAppUpdateCommand(
  "device123",
  "https://exemplo.com/test-small.apk",
  "test"
);
```

### 4. Monitorar Logs

#### No Android (via ADB)
```bash
adb logcat -s AppUpdater:* WebSocketService:* -v time
```

**Logs esperados:**
```
📥 INICIANDO ATUALIZAÇÃO AUTOMÁTICA
✅ App é Device Owner - instalação silenciosa permitida
🔽 Download iniciado - ID: 12345
📊 Progresso: 25%
📊 Progresso: 50%
📊 Progresso: 75%
✅ Download concluído!
📦 INSTALANDO APK SILENCIOSAMENTE
✅ Instalação iniciada
```

#### No Servidor (Console Node.js)
```
═══════════════════════════════════════════════
📥 ENVIANDO COMANDO DE ATUALIZAÇÃO DE APK
═══════════════════════════════════════════════
✅ Comando enviado para dispositivo: device123
📊 Resultado: 1 enviados, 0 falharam
```

---

## 🔍 Troubleshooting

### Problema 1: "App não é Device Owner"

**Erro:**
```
❌ App não é Device Owner - não pode instalar automaticamente
```

**Solução:**
```bash
# Verificar se é Device Owner
adb shell dpm list-owners

# Ativar Device Owner (se necessário)
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

### Problema 2: Download Falha

**Erro:**
```
❌ Download falhou - Status: 16, Reason: 1008
```

**Causas Comuns:**
- URL inválida ou inacessível
- Sem conexão com internet
- Permissões de armazenamento

**Verificar:**
```bash
# Testar URL manualmente
adb shell am start -a android.intent.action.VIEW -d "URL_DO_APK"

# Verificar permissões
adb shell dumpsys package com.mdm.launcher | findstr permission
```

### Problema 3: Dispositivo Não Conectado

**Erro:**
```
⚠️ Dispositivo device123 não encontrado
```

**Solução:**
```javascript
// 1. Listar dispositivos conectados
Array.from(connectedDevices.keys())

// 2. Verificar se o device ID está correto
// 3. Aguardar dispositivo conectar (pode levar até 20s após servidor reiniciar)
// 4. Verificar logs do dispositivo
```

```bash
# No Android
adb logcat -s WebSocketService:* -v time

# No servidor
pm2 logs mdm-websocket | grep "device_connected"
```

**Nota:** Após reiniciar servidor com `pm2 restart`, aguarde 20 segundos para launchers reconectarem automaticamente.

### Problema 4: Instalação Falha

**Erro:**
```
❌ Instalação falhou: INSTALL_FAILED_VERSION_DOWNGRADE
```

**Causas:**
- Tentando instalar versão mais antiga
- APK corrompido
- Assinatura diferente

**Solução:**
```bash
# Desinstalar versão anterior (se necessário)
adb shell pm uninstall com.mdm.launcher

# Instalar via ADB primeiro para testar
adb install -r caminho/para/app.apk
```

---

## ✅ Checklist de Implantação

Antes de usar em produção:

- [ ] Servidor WebSocket rodando e acessível
- [ ] Dispositivos conectados ao servidor
- [ ] Dispositivos são Device Owner
- [ ] URL do APK acessível pelos dispositivos
- [ ] Permissões de internet e armazenamento concedidas
- [ ] Testado em um dispositivo primeiro
- [ ] Backup dos dispositivos realizado

---

## 📊 Monitoramento de Status

O servidor recebe updates de progresso:

```json
{
  "type": "update_status",
  "deviceId": "device123",
  "timestamp": 1697123456789,
  "success": true,
  "message": "Baixando atualização",
  "progress": 75
}
```

Estados possíveis:
- `progress: 0` - Download iniciado
- `progress: 1-99` - Download em andamento
- `progress: 100, success: true` - Instalação em andamento
- `success: false` - Erro ocorreu

---

## 🔄 Reconexão Automática (Atualização 21/10/2024)

O sistema agora **reconecta automaticamente** após o servidor reiniciar:

### **Melhorias:**
- ✅ Launcher reconecta em 10-20s após servidor reiniciar
- ✅ Não precisa mais reinstalar app após `pm2 restart`
- ✅ Cache otimizado (30s) para reconexão mais rápida
- ✅ Sistema anti-travamento detecta conexões presas

### **Importante para Atualizações:**
Quando enviar comando de atualização após servidor reiniciar:
1. **Aguarde 20 segundos** para launcher reconectar
2. **Verifique logs** para confirmar conexão:
   ```bash
   pm2 logs mdm-websocket | grep "device_connected"
   ```
3. **Envie o comando** de atualização normalmente

---

## 🚀 Próximos Passos

1. **Integrar com UI**: Criar interface web para gerenciar atualizações
2. **Agendamento**: Permitir agendar atualizações para horários específicos
3. **Rollback**: Sistema para reverter para versão anterior em caso de problemas
4. **Notificações**: Alertas quando atualizações são concluídas
5. **Versionamento**: Controle de versões e histórico de atualizações

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs do Android: `adb logcat -s AppUpdater:* WebSocketService:*`
2. Verificar logs do servidor Node.js
3. Consultar este documento
4. Verificar conectividade WebSocket
5. Confirmar Device Owner ativo: `adb shell dpm list-owners`

## 🔗 Links Úteis

- **Documentação Device Owner**: https://developer.android.com/work/dpc/dedicated-devices
- **PackageInstaller API**: https://developer.android.com/reference/android/content/pm/PackageInstaller
- **OkHttp WebSocket**: https://square.github.io/okhttp/

---

**Última atualização:** 21/10/2024

