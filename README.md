# 📱 MDM Owner - Sistema de Gerenciamento de Dispositivos Android

Sistema completo de MDM (Mobile Device Management) com Device Owner, launcher customizado e painel web de controle remoto em tempo real.

> **🔐 ATUALIZAÇÃO DE PERMISSÕES (14/10/2025):** Permissões otimizadas e corrigidas! Ver [PERMISSIONS-CHANGELOG.md](mdm-owner/PERMISSIONS-CHANGELOG.md) para detalhes.

## 🚀 Início Rápido

### 1. **Servidor Backend (WebSocket + PostgreSQL)**
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
Acesse: http://localhost:3000

### 3. **App Android**
```bash
cd mdm-owner

# Opção 1: Script automático (RECOMENDADO)
install-and-setup.bat

# Opção 2: Manual
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

## 📋 Comandos Principais

### **Servidor**
```bash
# Iniciar servidor WebSocket
node mdm-frontend/server/websocket.js

# Iniciar painel web
cd mdm-frontend && npm run dev

# Iniciar ambos juntos
cd mdm-frontend && npm run dev:all
```

### **Android**
```bash
# Instalação automática (RECOMENDADO)
cd mdm-owner
install-and-setup.bat        # Instalação completa com validações
quick-install.bat            # Instalação rápida
build-and-install.bat        # Recompilar e instalar
uninstall.bat                # Desinstalar

# Comandos manuais
./gradlew assembleDebug      # Compilar APK
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dpm set-device-owner com.mdm.launcher/.device.MDMDeviceAdminReceiver

# Remover Device Owner
# Toque 10x no botão ⚙️ no app

# Logs
adb logcat | findstr MDM
```

### **Banco de Dados (PostgreSQL)**
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
```

## ✨ Funcionalidades

### **App Android (Device Owner)**
- ✅ Launcher customizado que substitui tela inicial
- ✅ Device Owner com controle total do dispositivo
- ✅ WebSocket com reconexão automática e adaptativa
- ✅ Heartbeat inteligente (15s tela ativa / 30s bloqueada)
- ✅ Monitoramento: bateria, armazenamento, apps, localização
- ✅ GPS em tempo real com histórico inteligente
- ✅ Descoberta automática do servidor (UDP broadcast)
- ✅ WakeLock para manter conexão quando tela ativa
- ✅ Health check a cada 60 segundos

### **Painel Web**
- ✅ Dashboard com status em tempo real
- ✅ Controle remoto via WebSocket
- ✅ Mapas de localização interativos
- ✅ Mensagens de suporte bidirecionais
- ✅ Políticas de apps por dispositivo/grupo
- ✅ Detecção rápida de offline (30s)
- ✅ Interface de carregamento durante sincronização

### **Servidor WebSocket**
- ✅ Timeout adaptativo baseado em latência (60s-180s)
- ✅ Throttling de ping (max 60/min por dispositivo)
- ✅ Score de saúde da conexão por dispositivo
- ✅ Logs configuráveis (error, warn, info, debug)
- ✅ PostgreSQL para persistência
- ✅ Descoberta automática via UDP

## 🔧 Configuração

### **Servidor WebSocket**
Edite `mdm-frontend/server/config.js`:
```javascript
{
  LOG_LEVEL: 'info',                    // error, warn, info, debug
  MAX_PINGS_PER_MINUTE: 60,             // Throttling de ping
  BASE_INACTIVITY_TIMEOUT: 90000,       // 90s
  MAX_INACTIVITY_TIMEOUT: 180000,       // 3min
  HEARTBEAT_INTERVAL: 30000,            // 30s
  PONG_TIMEOUT: 10000                   // 10s
}
```

### **PostgreSQL**
```bash
# Conectar ao PostgreSQL
psql -U postgres

# Criar banco
CREATE DATABASE mdm_devices;

# Configurar conexão em .env
DATABASE_URL=postgresql://user:password@localhost:5432/mdm_devices
```

### **Descoberta Automática do Servidor**
O app descobre o servidor automaticamente:
1. DNS Local (mdm.local)
2. UDP Broadcast na rede local
3. IPs comuns (.1, .100, .10, etc)
4. Configuração manual (fallback)

## 🚨 Troubleshooting

### **Device Owner não ativa**
```bash
# Verificar contas Google
adb shell pm list users
# Se houver, fazer factory reset

# Verificar status
adb shell dpm list-owners
```

### **App não conecta**
```bash
# Testar rede
adb shell ping 192.168.1.100

# Verificar WebSocket
netstat -ano | findstr :3002

# Logs do servidor
LOG_LEVEL=debug node mdm-frontend/server/websocket.js
```

### **Problemas de compilação Android**
```bash
# Limpar build
cd mdm-owner
./gradlew clean

# Recompilar
./gradlew assembleDebug
```

### **Logs úteis**
```bash
# Android - todos
adb logcat | grep MDM

# Android - WebSocket
adb logcat | grep WebSocket

# Android - Localização
adb logcat | grep Location

# Servidor
node mdm-frontend/server/websocket.js
```

## 📊 Estrutura do Projeto

```
device-owner/
├── mdm-frontend/          # Painel Web + Servidor
│   ├── app/              # Next.js App
│   ├── server/           # WebSocket Server
│   │   ├── websocket.js
│   │   ├── config.js
│   │   └── database/
│   └── package.json
│
└── mdm-owner/            # App Android
    ├── app/
    │   └── src/main/java/com/mdm/launcher/
    │       ├── MainActivity.kt
    │       ├── network/WebSocketClient.kt
    │       ├── service/
    │       │   ├── WebSocketService.kt
    │       │   └── LocationService.kt
    │       └── utils/
    └── build.gradle
```

## 🔐 Segurança e Permissões

### **Permissões Otimizadas** ✅
- ✅ Removidas permissões telefônicas desnecessárias
- ✅ Adicionado suporte para Android 12+ (Bluetooth)
- ✅ Background location para rastreamento 24/7
- ✅ Controle de WiFi e rede (ScaleFusion-like)
- ✅ Suporte NFC para funcionalidades enterprise
- ✅ device_admin.xml corrigido (apenas políticas válidas)

### **Scripts Úteis**
```bash
cd mdm-owner

# Recompilar após correções de permissões
rebuild-after-permissions.bat

# Validar permissões instaladas
validate-permissions.bat
```

### **Documentação de Permissões**
- 📄 [PERMISSIONS-CHANGELOG.md](mdm-owner/PERMISSIONS-CHANGELOG.md) - Todas as alterações
- 📄 [RUNTIME-PERMISSIONS-GUIDE.md](mdm-owner/RUNTIME-PERMISSIONS-GUIDE.md) - Guia de implementação
- 📄 [QUICK-START-PERMISSIONS.md](mdm-owner/QUICK-START-PERMISSIONS.md) - Início rápido

### **Segurança**
- Device Owner garante controle total
- Comunicação via WebSocket (pode adicionar WSS)
- PostgreSQL para dados sensíveis
- Launcher não pode ser desinstalado como Device Owner
- Permissões mínimas necessárias (princípio do menor privilégio)

## 📝 Notas Importantes

1. **Device Owner**: Dispositivo deve estar sem conta Google
2. **GPS**: Precisão varia 1-20m entre dispositivos (normal)
3. **Conexão**: Heartbeat adaptativo economiza bateria
4. **WakeLock**: Mantém conexão ativa quando tela desbloqueada
5. **Logs**: Use `LOG_LEVEL=debug` para troubleshooting

## 🆘 Suporte

- **Remover Device Owner**: Toque 10x no ⚙️ do app
- **Logs detalhados**: `LOG_LEVEL=debug`
- **Factory reset**: Última opção para remover Device Owner
