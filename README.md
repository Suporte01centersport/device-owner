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
   adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
   
   # Verificar se foi ativado
   adb shell dpm list-owners
   ```

6. **Remover Device Owner (Para Testes/Debug)**
   
   ⚠️ **Via App (Recomendado):**
   - Abra o app no dispositivo
   - Toque **10 vezes rapidamente** no botão de configurações (⚙️)
   - Confirme a remoção no dialog que aparece
   - O app abrirá as configurações para desinstalar
   
   **Via ADB (Alternativa):**
   ```bash
   # Isso só funciona se o app não for Device Owner ou em modo de teste
   adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver
   adb uninstall com.mdm.launcher
   
   # Se não funcionar, use a opção via app ou factory reset
   ```

### 🔍 **Descoberta Automática do Servidor**

O sistema MDM implementa **descoberta automática do servidor** - não é necessário configurar IP manualmente em cada dispositivo!

#### Como Funciona

O app Android tenta descobrir o servidor automaticamente usando 4 estratégias:

1. **DNS Local** (mdm.local) - Para produção com DNS configurado
2. **Broadcast UDP** - O servidor responde a broadcasts na rede local
3. **IPs Comuns** - Testa IPs típicos (.1, .100, .10, etc)
4. **Configuração Manual** - Fallback para IP configurado

#### No Servidor (Automático)

O servidor já inicia automaticamente o sistema de descoberta:

```bash
cd mdm-frontend
npm run dev

# Você verá:
# 🔍 ═══════════════════════════════════════════════
#    SERVIDOR DE DESCOBERTA MDM INICIADO
# ═══════════════════════════════════════════════
# 📡 Porta UDP de descoberta: 3003
# 🌐 WebSocket será anunciado na porta: 3002
# 📍 IPs disponíveis para conexão:
#    - ws://192.168.1.100:3002  (exemplo)
```

#### No Dispositivo (Automático)

O app Android descobre e conecta automaticamente ao servidor:

```
2025-10-09 09:20:00.000 MainActivity  D  Servidor descoberto: ws://192.168.1.100:3002
2025-10-09 09:20:01.000 WebSocketClient  D  WebSocket conectado
```

#### Configuração Manual (Opcional)

Se a descoberta automática falhar, você pode configurar manualmente:

1. Abra o app no dispositivo
2. Toque no ícone de configurações (⚙️)
3. Digite a URL: `ws://SEU_IP:3002`
4. Salvar

#### Para Ambientes Corporativos

Configure um DNS local para `mdm.local` apontando para o servidor MDM:

```bash
# Windows (hosts file): C:\Windows\System32\drivers\etc\hosts
192.168.1.100  mdm.local

# Linux/Mac: /etc/hosts
192.168.1.100  mdm.local
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