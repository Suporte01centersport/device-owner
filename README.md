# 📱 MDM Owner - Sistema Completo de Gerenciamento de Dispositivos

Sistema profissional de gerenciamento de dispositivos Android estilo ScaleFusion, com Device Owner, launcher customizado e painel web de controle remoto em tempo real.

## 🎯 Funcionalidades Principais

### 📱 **App Android (Device Owner)**
- ✅ **Launcher Customizado** - Substitui tela inicial do Android
- ✅ **Device Owner** - Controle total do dispositivo
- ✅ **Sincronização em Tempo Real** - WebSocket com reconexão automática
- ✅ **Monitoramento Completo** - Bateria, armazenamento, apps, localização
- ✅ **Coleta de Dados** - Serial, IMEI, MAC, informações detalhadas

### 🌐 **Painel Web de Gerenciamento**
- ✅ **Dashboard Moderno** - Interface React + Tailwind CSS
- ✅ **Controle Remoto** - Comandos em tempo real via WebSocket
- ✅ **Monitoramento em Tempo Real** - Status, bateria, armazenamento, apps
- ✅ **Sistema de Localização** - GPS com histórico e mapas interativos
- ✅ **Mensagens de Suporte** - Comunicação bidirecional com dispositivos
- ✅ **Detecção Rápida de Offline** - Status atualizado em 30 segundos
- ✅ **Interface de Carregamento** - Estados visuais para dados em sincronização

### 🚀 **Sistema Otimizado de Conexão**
- ✅ **Throttling de Ping** - Limite inteligente de pings por dispositivo
- ✅ **Timeout Adaptativo** - Baseado na latência da rede (15s-120s)
- ✅ **Monitor de Saúde** - Score de qualidade da conexão por dispositivo
- ✅ **Logs Configuráveis** - Níveis de log (error, warn, info, debug)
- ✅ **Reconexão Automática** - Backoff exponencial com fallback HTTP
- ✅ **Persistência de Dados** - Salvamento automático entre sessões

## 🚀 Instalação Rápida

### 1. **Clonar e Configurar**
```bash
git clone https://github.com/seu-usuario/device-owner.git
cd device-owner
```

### 2. **Iniciar Servidor WebSocket**
```bash
cd mdm-frontend/server
npm install
node websocket.js
```

### 3. **Iniciar Painel Web**
```bash
cd mdm-frontend
npm install
npm run dev
```

### 4. **Compilar e Instalar App Android**

#### 📱 **Via Android Studio (Recomendado)**

1. **Abrir Projeto no Android Studio**
   - Abrir Android Studio
   - File → Open → Selecionar pasta `mdm-owner`
   - Aguardar sincronização do Gradle

2. **Configurar Device Owner**
   ```bash
   # Conectar dispositivo via USB ou iniciar emulador
   adb devices
   
   # Verificar se dispositivo está conectado
   adb shell getprop ro.build.version.sdk
   ```

3. **Compilar APK**
   - Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Ou usar atalho: `Ctrl+Shift+A` → "Build APK"
   - **Ou via terminal**: `./gradlew.bat assembleDebug`
   - APK será gerado em: `app/build/outputs/apk/debug/app-debug.apk`

4. **Instalar APK**
   ```bash
   # Instalar APK no dispositivo via terminal
   adb install -r app\build\outputs\apk\debug\app-debug.apk
   
   # Ou usar Android Studio: Run → Run 'app'
   ```

5. **Ativar Device Owner**
   ```bash
   # Ativar Device Owner (dispositivo deve estar sem conta Google)
   adb shell dpm set-device-owner com.mdm.launcher/.device.MDMDeviceAdminReceiver
   
   # Verificar se foi ativado
   adb shell dpm list-owners
   ```

#### 🖥️ **Configurar Emulador Android**

1. **Criar AVD (Android Virtual Device)**
   - Android Studio → Tools → AVD Manager
   - Create Virtual Device
   - Escolher dispositivo (ex: Pixel 4)
   - Selecionar API Level 28+ (Android 9+)
   - **IMPORTANTE**: Não adicionar Google Play Services

2. **Configurações Especiais do Emulador**
   ```bash
   # Iniciar emulador com configurações específicas
   emulator -avd NOME_DO_AVD -no-snapshot -wipe-data
   
   # Ou usar Android Studio: Run → Select Device → Emulator
   ```

3. **Verificar Configuração**
   ```bash
   # Verificar se emulador está rodando
   adb devices
   
   # Verificar API Level
   adb shell getprop ro.build.version.sdk
   
   # Verificar se não há conta Google
   adb shell pm list users
   ```

4. **Instalar e Configurar Device Owner**
   ```bash
   # Instalar APK no emulador
   adb install -r app\build\outputs\apk\debug\app-debug.apk
   
   # Ativar Device Owner
   adb shell dpm set-device-owner com.mdm.launcher/.device.MDMDeviceAdminReceiver
   
   # Verificar ativação
   adb shell dpm list-owners
   ```

## 🚨 Troubleshooting

### **Device Owner não ativa**
```bash
# Verificar se há conta Google
adb shell pm list users

# Factory reset completo necessário se houver conta Google
```

### **App não conecta servidor**
```bash
# Testar conectividade
adb shell ping 192.168.1.100

# Verificar WebSocket
netstat -ano | findstr :3002
```

### **Logs de Debug**
```bash
# Android
adb logcat | grep MDM

# Servidor WebSocket
node server/websocket.js

# Painel Web
npm run dev
```

### **Testar Otimizações**
```bash
cd mdm-frontend/server
node test-optimizations.js
```