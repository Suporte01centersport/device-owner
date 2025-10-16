# 📱 MDM Owner - Sistema de Gerenciamento de Dispositivos Android

Sistema completo de MDM (Mobile Device Management) com Device Owner, launcher customizado e painel web de controle remoto em tempo real via WebSocket.

> **✅ ATUALIZADO (14/10/2025):** Android 13+ compatível | Descoberta automática otimizada | Launcher persistente

## 🚀 Início Rápido

### 1. **Servidor Backend (Node.js + PostgreSQL)**
```bash
cd mdm-frontend/server
npm install
node websocket.js
```

### 2. **Painel Web (Next.js)**
```bash
cd mdm-frontend
npm install
npm run dev
```
Acesse: **http://localhost:3000**

### 3. **App Android**
```bash
cd mdm-owner
gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

## 📋 Comandos Essenciais

### **Servidor**
```bash
# Servidor WebSocket (porta 3002)
node mdm-frontend/server/websocket.js

# Painel Web (porta 3000)
cd mdm-frontend
npm run dev

# Ambos juntos
cd mdm-frontend
npm run dev:all

# Servidor com debug
set LOG_LEVEL=debug && node mdm-frontend/server/websocket.js
```

### **Android**
```bash
cd mdm-owner

# Compilar APK
gradlew assembleDebug

# Instalar
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Ativar Device Owner (dispositivo SEM conta Google)
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver

# Verificar Device Owner
adb shell dpm list-owners

# Logs em tempo real
adb logcat -s MDM:* WebSocketClient:* WebSocketService:* ServerDiscovery:*

# Limpar e reinstalar
adb uninstall com.mdm.launcher
adb install app/build/outputs/apk/debug/app-debug.apk
```

### **Banco de Dados PostgreSQL**
```bash
cd mdm-frontend

# Configurar banco existente
npm run configure-existing

# Limpar dispositivos órfãos
npm run cleanup-devices
npm run cleanup-devices:confirm

# Remover duplicatas
npm run remove-duplicates
npm run remove-duplicates:confirm

# Corrigir IDs nulos
npm run fix-null-device-ids:confirm
```

## ✨ Funcionalidades

### **App Android (Device Owner)**
- ✅ **Launcher persistente** - não fecha ao limpar tarefas
- ✅ **Descoberta automática do servidor** via UDP broadcast (cache de 1 min)
- ✅ **Conexão WebSocket** com reconexão automática inteligente
- ✅ **Android 13/14 compatível** - BroadcastReceiver otimizado
- ✅ **Heartbeat adaptativo** - 15s tela ativa / 30s bloqueada
- ✅ **GPS em tempo real** com histórico
- ✅ **Monitoramento completo** - bateria, armazenamento, apps
- ✅ **Otimizações de bateria** - cache e debouncing

### **Painel Web**
- ✅ Dashboard em tempo real
- ✅ Controle remoto via WebSocket
- ✅ Mapas de localização (Leaflet)
- ✅ Mensagens bidirecionais
- ✅ Políticas de apps por dispositivo/grupo
- ✅ Detecção rápida de offline (30s)

### **Servidor WebSocket**
- ✅ **Discovery Server** UDP na porta 3003
- ✅ Timeout adaptativo (60s-180s baseado em latência)
- ✅ Throttling de ping (max 60/min)
- ✅ Score de saúde por dispositivo
- ✅ Logs configuráveis (error, warn, info, debug)
- ✅ PostgreSQL para persistência

## 🔧 Configuração

### **Servidor WebSocket** (`mdm-frontend/server/config.js`)
```javascript
{
  LOG_LEVEL: 'info',                // error, warn, info, debug
  MAX_PINGS_PER_MINUTE: 60,         // Throttling
  BASE_INACTIVITY_TIMEOUT: 90000,   // 90s
  MAX_INACTIVITY_TIMEOUT: 180000,   // 3min
  HEARTBEAT_INTERVAL: 30000,        // 30s
  PONG_TIMEOUT: 10000               // 10s
}
```

### **PostgreSQL**
```bash
# Criar banco
psql -U postgres
CREATE DATABASE mdm_devices;

# Configurar .env
DATABASE_URL=postgresql://user:password@localhost:5432/mdm_devices
```

### **Descoberta Automática**
O app descobre o servidor automaticamente (ordem de prioridade):
1. **DNS Local** (`mdm.local`)
2. **UDP Broadcast** na rede local (porta 3003)
3. **IPs comuns** (.1, .100, .10, .2, .50, .254)
4. **Cache** (60 segundos)
5. **SharedPreferences** (última URL conhecida)

## 🚨 Troubleshooting

### **App não conecta**

**1. Verificar servidor rodando:**
```bash
netstat -ano | findstr :3002
netstat -ano | findstr :3003
```

**2. Verificar rede do dispositivo:**
```bash
# IP do PC servidor
ipconfig

# Testar ping do dispositivo
adb shell ping 192.168.X.X
```

**3. Ver logs de descoberta:**
```bash
adb logcat -s ServerDiscovery:* -v time
```

**Problema comum:** Firewall bloqueando portas 3002/3003
```bash
# Windows: Abrir portas no firewall
netsh advfirewall firewall add rule name="MDM WebSocket" dir=in action=allow protocol=TCP localport=3002
netsh advfirewall firewall add rule name="MDM Discovery" dir=in action=allow protocol=UDP localport=3003
```

### **Device Owner não ativa**

**Erro:** `Not allowed to set the device owner`

**Solução:**
```bash
# 1. Dispositivo deve estar sem conta Google
adb shell pm list users

# 2. Se tiver conta, fazer factory reset
# 3. Instalar app ANTES de adicionar conta Google
# 4. Ativar Device Owner:
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

### **App crashando no Android 13/14**

✅ **RESOLVIDO** - BroadcastReceiver com flag `RECEIVER_NOT_EXPORTED`

Se ainda crashar:
```bash
# Ver crash completo
adb logcat -s AndroidRuntime:E

# Reinstalar versão atualizada
adb uninstall com.mdm.launcher
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### **Launcher não volta após limpar tarefas**

✅ **RESOLVIDO** - `launchMode="singleTask"` + `excludeFromRecents="true"`

Verificar se está como launcher padrão:
```bash
# Ver launcher atual
adb shell cmd package query-activities --component -a android.intent.action.MAIN -c android.intent.category.HOME

# Forçar definir como padrão (requer interação manual)
adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME
```

### **Descoberta do servidor muito lenta**

✅ **OTIMIZADO** - Cache de 60 segundos para evitar descobertas repetidas

Ver quantas descobertas estão acontecendo:
```bash
adb logcat -s ServerDiscovery:* | findstr "INICIANDO DESCOBERTA"
```

Se aparecer muito frequente, reiniciar app.

### **Logs úteis**
```bash
# Todos MDM
adb logcat -s MDM:*

# WebSocket
adb logcat -s WebSocketClient:* WebSocketService:*

# Localização
adb logcat -s LocationService:*

# Descoberta servidor
adb logcat -s ServerDiscovery:*

# Network Monitor
adb logcat -s NetworkMonitor:*

# Limpar logs
adb logcat -c
```

## 📊 Estrutura do Projeto

```
device-owner/
├── mdm-frontend/              # Painel Web + Servidor
│   ├── app/                   # Next.js 14
│   │   ├── api/               # API Routes
│   │   ├── components/        # React Components
│   │   ├── lib/               # WebSocket client, etc
│   │   └── types/             # TypeScript types
│   ├── server/                # Backend Node.js
│   │   ├── websocket.js       # Servidor WebSocket (porta 3002)
│   │   ├── discovery-server.js # Discovery UDP (porta 3003)
│   │   ├── config.js          # Configurações
│   │   └── database/          # PostgreSQL models
│   ├── package.json
│   └── start-dev.bat          # Iniciar desenvolvimento
│
└── mdm-owner/                 # App Android
    ├── app/src/main/
    │   ├── AndroidManifest.xml
    │   ├── java/com/mdm/launcher/
    │   │   ├── MainActivity.kt
    │   │   ├── DeviceAdminReceiver.kt
    │   │   ├── network/
    │   │   │   └── WebSocketClient.kt
    │   │   ├── service/
    │   │   │   ├── WebSocketService.kt
    │   │   │   └── LocationService.kt
    │   │   ├── utils/
    │   │   │   ├── ServerDiscovery.kt      # Descoberta automática
    │   │   │   ├── NetworkMonitor.kt       # Monitor de rede
    │   │   │   ├── DeviceIdManager.kt
    │   │   │   └── DeviceInfoCollector.kt
    │   │   └── receivers/
    │   │       └── SystemBootReceiver.kt
    │   └── res/                # Layouts, recursos
    ├── build.gradle
    ├── gradlew.bat
    ├── package.json            # Para QR Code
    └── gerar-qrcode.js         # Gerar QR para download
```

## 🔐 Segurança e Permissões

### **Permissões Críticas (Android)**
- ✅ `BIND_DEVICE_ADMIN` - Device Owner
- ✅ `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` - GPS 24/7
- ✅ `INTERNET` + `ACCESS_NETWORK_STATE` - WebSocket
- ✅ `FOREGROUND_SERVICE` - Serviços persistentes
- ✅ `WAKE_LOCK` - Manter conexão ativa
- ✅ `RECEIVE_BOOT_COMPLETED` - Iniciar após reboot
- ✅ `BLUETOOTH_CONNECT/SCAN` - Android 12+
- ✅ `POST_NOTIFICATIONS` - Android 13+

### **Device Owner Capabilities**
- ✅ Bloquear instalação/desinstalação de apps
- ✅ Definir apps permitidos (whitelist/blacklist)
- ✅ Bloquear configurações do sistema
- ✅ Lock/wipe remoto
- ✅ Políticas de senha
- ✅ Modo kiosk
- ✅ Não pode ser desinstalado sem remover Device Owner

### **Remover Device Owner**
```bash
# Método 1: No app (toque 10x no ⚙️)
# Método 2: Via ADB
adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver

# Método 3: Factory reset (última opção)
```

## 📝 Notas Importantes

1. **Device Owner**: Dispositivo DEVE estar **sem conta Google** antes de ativar
2. **Rede**: Dispositivo e servidor devem estar na **mesma rede WiFi**
3. **Portas**: 3002 (WebSocket) e 3003 (Discovery) devem estar **abertas no firewall**
4. **GPS**: Precisão varia 1-20m (normal)
5. **Bateria**: WakeLock usado apenas quando tela ativa
6. **Launcher**: Persiste mesmo ao limpar tarefas recentes
7. **Cache**: Descoberta do servidor em cache por 60s

## 🎯 Melhorias Recentes (14/10/2025)

✅ **Android 13/14 compatível** - Correção BroadcastReceiver  
✅ **Descoberta otimizada** - Cache de 60s, 90% menos chamadas  
✅ **NetworkMonitor** - Debounce de 5s para evitar eventos repetidos  
✅ **Launcher persistente** - `singleTask` + `excludeFromRecents`  
✅ **Conexão estável** - Reconexão inteligente após mudança de rede  

## 🆘 Suporte

**Problemas comuns e soluções:**

| Problema | Solução |
|----------|---------|
| App não conecta | Verificar firewall portas 3002/3003 |
| Device Owner não ativa | Remover conta Google e fazer factory reset |
| App crasha Android 13+ | Reinstalar versão atualizada |
| Launcher some ao limpar tarefas | Reinstalar versão atualizada |
| Descoberta muito lenta | Normal na primeira vez, depois usa cache |

**Logs debug:**
```bash
# Server
set LOG_LEVEL=debug
node mdm-frontend/server/websocket.js

# Android
adb logcat -s MDM:* WebSocketClient:* WebSocketService:* ServerDiscovery:* -v time
```

---

**Desenvolvido com foco em:** ScaleFusion, Workspace ONE, ManageEngine MDM
