# 📱 MDM Owner - Device Owner App Launcher

Sistema completo de gerenciamento de dispositivos Android estilo Scalefusion, com Device Owner, launcher customizado e painel web de controle remoto.

## 🎯 Funcionalidades

### 📱 App Android (Launcher + Device Owner)
- ✅ **Launcher Customizado** - Substitui tela inicial do Android
- ✅ **Device Owner** - Controle total do dispositivo  
- ✅ **Modo Kiosque** - Um ou múltiplos apps fixos
- ✅ **Restrições Avançadas** - Wi-Fi, Bluetooth, câmera, configurações, status bar, instalação de apps
- ✅ **Sincronização Remota** - Comunicação em tempo real com servidor
- ✅ **Provisionamento QR** - Configuração automática via QR Code
- ✅ **Monitoramento de Sistema** - Bateria, armazenamento, memória, CPU
- ✅ **Informações Detalhadas** - Modelo, versão Android, IMEI, MAC address

### 🌐 Painel Web de Gerenciamento
- ✅ **Dashboard Moderno** - Interface React + Tailwind CSS
- ✅ **Controle Remoto** - Envio de comandos em tempo real
- ✅ **Gerenciamento de Dispositivos** - Status, restrições, apps, informações detalhadas
- ✅ **Provisionamento** - Geração de QR Codes para setup automático
- ✅ **WebSocket Robusto** - Comunicação bidirecional com reconexão automática
- ✅ **Fallback HTTP** - Continuidade de serviço quando WebSocket falha
- ✅ **Painel de Debug** - Monitoramento em tempo real das conexões
- ✅ **Sistema de Localização** - Rastreamento GPS com histórico e mapas
- ✅ **Mensagens de Suporte** - Sistema de comunicação com dispositivos
- ✅ **Persistência de Dados** - Salvamento automático no localStorage
- ✅ **Testes de Conectividade** - Ferramentas de diagnóstico integradas

### 🐳 Backend Self-Hosted
- ✅ **Appwrite** - Backend completo via Docker
- ✅ **API REST** - Sincronização de configurações
- ✅ **WebSocket Server** - Comandos em tempo real com logging detalhado
- ✅ **API HTTP Integrada** - Fallback para quando WebSocket não está disponível
- ✅ **Banco de Dados** - MariaDB + Redis para cache

## 🆕 **Atualizações Recentes - Sistema Completo**

### ✨ **Funcionalidades de Localização (v3.0)**
- 📍 **Rastreamento GPS** - Localização em tempo real dos dispositivos
- 🗺️ **Histórico de Localização** - Armazenamento e visualização de trajetos
- 🏠 **Geocodificação** - Conversão de coordenadas para endereços
- 📊 **Mapas Interativos** - Visualização em tempo real com OpenStreetMap
- ⏰ **Timestamps Precisos** - Registro detalhado de movimentação

### 💬 **Sistema de Suporte (v3.0)**
- 📱 **Mensagens de Dispositivos** - Comunicação bidirecional com dispositivos
- 🏷️ **Status de Mensagens** - Pending, Read, Resolved
- 📋 **Histórico Completo** - Todas as interações salvas
- 🔍 **Filtros Avançados** - Por dispositivo, status, data
- 📊 **Informações do Dispositivo** - Modelo, versão Android, contexto

### 💾 **Sistema de Persistência (v3.0)**
- 🔄 **Auto-save** - Salvamento automático de dados
- 💾 **LocalStorage** - Dados persistidos no navegador
- 🔧 **Debounce Inteligente** - Otimização de performance
- 📊 **Status de Sincronização** - Indicadores visuais de estado
- 🔍 **Detalhes de Persistência** - Monitoramento de dados salvos

### ✨ **Melhorias de Conectividade (v2.0)**
- 🔄 **Reconexão Automática** - Backoff exponencial inteligente
- 💓 **Sistema de Heartbeat** - Mantém conexões ativas
- 🌐 **Fallback HTTP** - Continuidade quando WebSocket falha
- 📋 **Fila de Mensagens** - Garantia de entrega com prioridades
- 🔧 **Painel de Debug** - Monitoramento em tempo real
- 🔒 **Suporte WSS** - Funciona em produção com HTTPS

### 📊 **Monitoramento Avançado**
- 📈 **Estatísticas em Tempo Real** - Conexões, mensagens, dispositivos
- 📝 **Logs Detalhados** - Timestamps e contexto completo
- 🎯 **Indicadores Visuais** - Status claro de conectividade
- 🔍 **Ferramentas de Debug** - Histórico e controles avançados

## 🚀 Instalação Rápida

### 1. Clonar Repositório
```bash
git clone https://github.com/seu-usuario/device-owner.git
cd device-owner
```

### 2. Iniciar Servidor (Docker)
```bash
cd mdm-frontend
docker-compose up -d
```

### 3. Configurar Painel Web
```bash
npm install
npm run build
npm start
```

### 4. Testar Integração
```bash
# Testar sistema completo
node test-integration.js
```

### 5. Instalar App Android

#### 🚀 **Método Automático (Recomendado)**
```bash
cd ../mdm-owner
# Executar instalação inteligente
smart-install.bat
```

#### 🔧 **Método Manual**
```bash
cd ../mdm-owner
# Preparar dispositivo
prepare-device-owner.bat

# Instalar como Device Owner
install-device-owner.bat

# Verificar instalação
check-device-owner.bat
```

#### 📱 **Para Emulador**
```bash
# Instalação específica para emulador
install-emulator-device-owner.bat
```

## 📋 Configuração Device Owner

### 🚀 Método 1: Instalação via Android Studio (Recomendado)
1. Abrir projeto no Android Studio
2. Conectar dispositivo ou iniciar emulador
3. Fazer build e instalar (Run/Debug)
4. O app tentará se configurar automaticamente como Device Owner

### 📱 Método 2: QR Code (Setup Manual)
1. Factory reset do dispositivo
2. Acessar painel: `http://seu-servidor/provisioning`
3. Gerar QR Code com configurações
4. Na tela "Bem-vindo", tocar 6x e escanear QR

### 🔧 Método 3: ADB Manual
```bash
# Instalar APK
adb install mdm-owner.apk

# Ativar Device Owner
adb shell dpm set-device-owner com.mdmowner.launcher/.device.MDMDeviceAdminReceiver

# Verificar
adb shell dpm list-owners
```

## 🔧 Estrutura do Projeto

```
device-owner/
├── mdm-owner/                    # 📱 App Android (Kotlin)
│   ├── app/src/main/
│   │   ├── java/com/mdm/launcher/
│   │   │   ├── device/           # Device Admin & Policy Manager
│   │   │   ├── ui/               # Activities & ViewModels
│   │   │   ├── network/          # API & WebSocket Client
│   │   │   ├── service/          # Background Services
│   │   │   └── model/            # Data Models
│   │   ├── res/                  # Resources (layouts, strings, etc)
│   │   └── AndroidManifest.xml   # Permissões e configurações
│   ├── build.gradle              # Configuração do projeto
│   ├── smart-install.bat         # Instalação inteligente
│   ├── install-device-owner.bat  # Instalação manual
│   ├── prepare-device-owner.bat  # Preparação do dispositivo
│   └── DEVICE_OWNER_README.md    # Guia específico do Android
│
├── mdm-frontend/                 # 🌐 Painel Web + Backend
│   ├── app/                      # Next.js 14 App Router
│   │   ├── components/           # Componentes React
│   │   │   ├── Dashboard.tsx     # Painel principal
│   │   │   ├── DeviceCard.tsx    # Card de dispositivo
│   │   │   ├── DeviceModal.tsx   # Modal de detalhes
│   │   │   ├── LocationView.tsx  # Visualização de localização
│   │   │   ├── SupportMessagesModal.tsx # Sistema de suporte
│   │   │   ├── PersistenceStatus.tsx # Status de persistência
│   │   │   └── ConnectionDebug.tsx # Debug de conexão
│   │   ├── lib/                  # Utilitários
│   │   │   ├── websocket.ts      # Cliente WebSocket
│   │   │   ├── persistence.ts    # Sistema de persistência
│   │   │   ├── message-queue.ts  # Fila de mensagens
│   │   │   └── http-fallback.ts  # Fallback HTTP
│   │   ├── api/                  # API Routes
│   │   │   └── support-messages/ # Endpoint de mensagens
│   │   ├── types/                # TypeScript Types
│   │   │   └── device.ts         # Interface do dispositivo
│   │   ├── provisioning/         # Página de provisionamento
│   │   └── test/                 # Páginas de teste
│   ├── server/                   # Servidor WebSocket
│   │   ├── websocket.js          # Servidor WebSocket
│   │   ├── devices.json          # Dados dos dispositivos
│   │   └── admin_password.json   # Senha de administrador
│   ├── docker-compose.yml        # Appwrite + MariaDB + Redis
│   ├── package.json              # Dependencies
│   └── start-dev.bat             # Script de desenvolvimento
│
└── README.md                     # Este arquivo
```

## 🎮 Como Usar

### 1. Primeiro Acesso
1. Instalar e ativar Device Owner no dispositivo
2. Configurar URL do servidor no app
3. Dispositivo aparecerá no painel web

### 2. Configurar Restrições
- Acessar painel web
- Selecionar dispositivo
- Configurar restrições desejadas
- Salvar (aplicação automática)

### 3. Modo Kiosque
- Via painel: selecionar apps permitidos
- Via app: botão flutuante "Kiosque"
- Para sair: configurar no painel web

### 4. Monitoramento
- Status em tempo real no dashboard
- Logs de atividade
- Comandos remotos instantâneos

## 🔌 Servidor WebSocket - Detalhes Técnicos

### Funcionalidades do WebSocket Server
- **Conexão Bidirecional**: Comunicação em tempo real entre dispositivos e painel web
- **Gerenciamento de Clientes**: Distingue entre dispositivos Android e clientes web
- **Comandos Remotos**: Aplicação instantânea de restrições e comandos
- **Status em Tempo Real**: Monitoramento contínuo dos dispositivos conectados
- **Heartbeat**: Sistema de ping/pong para verificar conectividade

### Estrutura do Servidor
```javascript
// server/websocket.js
const WebSocket = require('ws');

// Porta configurável via variável de ambiente
const wss = new WebSocket.Server({ 
    port: process.env.WEBSOCKET_PORT || 3002,
    host: '0.0.0.0'  // Aceita conexões de qualquer IP
});

// Armazenamento em memória dos dispositivos conectados
const connectedDevices = new Map();
const webClients = new Set();
```

### Tipos de Mensagens Suportadas
| Tipo | Origem | Destino | Descrição |
|------|--------|---------|-----------|
| `device_status` | Android | Servidor | Status do dispositivo (bateria, conectividade) |
| `device_restrictions` | Android | Servidor | Confirmação de restrições aplicadas |
| `apply_restrictions` | Web | Android | Aplicar novas restrições |
| `remove_restrictions` | Web | Android | Remover todas as restrições |
| `lock_device` | Web | Android | Bloquear dispositivo |
| `unlock_device` | Web | Android | Desbloquear dispositivo |
| `web_client` | Web | Servidor | Identificar cliente web |
| `ping` | Qualquer | Servidor | Verificar conectividade |
| `pong` | Servidor | Qualquer | Resposta ao ping |

### Configuração de Produção
```bash
# Variáveis de ambiente para produção
WEBSOCKET_PORT=3002
WEBSOCKET_HOST=0.0.0.0
NEXT_PUBLIC_WEBSOCKET_URL=wss://seu-dominio.com:3002

# SSL/TLS (recomendado para produção)
# Configurar certificados SSL no proxy reverso (Traefik/Nginx)
```

## 🔒 Restrições Disponíveis

| Restrição | Descrição | Campo |
|-----------|-----------|-------|
| 🔌 Wi-Fi | Bloquear configurações de Wi-Fi | `wifiDisabled` |
| 📶 Bluetooth | Desabilitar Bluetooth completamente | `bluetoothDisabled` |
| 📷 Câmera | Bloquear acesso à câmera | `cameraDisabled` |
| 📱 Barra Status | Ocultar barra de notificações | `statusBarDisabled` |
| 📦 Instalar Apps | Impedir instalação de novos apps | `installAppsDisabled` |
| 🗑️ Desinstalar Apps | Impedir remoção de apps | `uninstallAppsDisabled` |
| ⚙️ Configurações | Bloquear acesso às configurações | `settingsDisabled` |
| 🔔 Notificações | Desabilitar notificações do sistema | `systemNotificationsDisabled` |
| 📸 Captura Tela | Impedir screenshots | `screenCaptureDisabled` |
| 📤 Compartilhamento | Bloquear compartilhamento de arquivos | `sharingDisabled` |
| 📞 Chamadas | Desabilitar chamadas telefônicas | `outgoingCallsDisabled` |
| 💬 SMS | Bloquear envio/recebimento de SMS | `smsDisabled` |
| 👤 Criação de Usuários | Impedir criação de novos usuários | `userCreationDisabled` |
| 🗑️ Remoção de Usuários | Impedir remoção de usuários | `userRemovalDisabled` |

## 🌐 API Endpoints

### Dispositivos
```http
POST /devices/register          # Registrar novo dispositivo
GET  /devices/{id}/config       # Obter configurações
POST /devices/{id}/restrictions # Aplicar restrições
POST /devices/{id}/kiosk       # Controlar modo kiosque
```

### Suporte
```http
GET  /api/support-messages      # Listar mensagens de suporte
PUT  /api/support-messages      # Atualizar status de mensagem
```

### Provisionamento
```http
GET  /provisioning              # Página de geração de QR Code
POST /provisioning/generate     # Gerar QR Code programaticamente
```

### WebSocket Events
```javascript
// Servidor → Dispositivo
{
  type: 'apply_restrictions',
  data: { camera: false, wifi: true, bluetooth: false }
}

{
  type: 'lock_device'
}

{
  type: 'unlock_device'
}

// Dispositivo → Servidor  
{
  type: 'device_status',
  data: { 
    deviceId: 'abc123', 
    status: 'online', 
    battery: 85,
    lastSeen: 1640995200000
  }
}

{
  type: 'device_restrictions',
  data: { camera: false, wifi: true }
}

{
  type: 'ping'
}

// Cliente Web → Servidor
{
  type: 'web_client'
}

{
  type: 'apply_restrictions',
  deviceId: 'abc123',
  restrictions: { camera: false }
}
```

## 📊 Dashboard Preview

```
┌─────────────────────────────────────────────────────────┐
│ MDM Owner - Painel de Controle            [+ Adicionar] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📱 Tablet Loja 1      🟢 Online    📱 Tablet Loja 2    │
│  Samsung Galaxy Tab A8  2min atrás    🔴 Offline       │
│  🚫 câmera 🚫 wifi                    Lenovo Tab M10    │
│                                       1h atrás          │
│  📱 Tablet Loja 3      🟢 Online                        │
│  iPad Air 2024         Agora                           │
│  🚫 status 🚫 apps                                      │
└─────────────────────────────────────────────────────────┘
```

## 🐳 Servidor - Arquitetura Completa

### Docker Services (Produção)
| Serviço | Porta | Descrição |
|---------|-------|-----------|
| **Appwrite** | 80 | Backend principal (API + Console) |
| **MariaDB** | 3306 | Banco de dados |
| **Redis** | 6379 | Cache e sessões |
| **InfluxDB** | 8086 | Métricas e analytics |
| **Traefik** | 80/443 | Proxy reverso e SSL |

### Serviços de Desenvolvimento
| Serviço | Porta | Descrição |
|---------|-------|-----------|
| **Next.js** | 3000 | Painel web (desenvolvimento) |
| **WebSocket** | 3002 | Comunicação em tempo real |

## 🔧 Configuração do Servidor

### Variáveis de Ambiente (.env)
```bash
# Configurações do Appwrite
APPWRITE_ENDPOINT=http://localhost:80
APPWRITE_PROJECT_ID=mdm-project
APPWRITE_API_KEY=your-api-key-here

# Configurações do Next.js
NEXT_PUBLIC_APPWRITE_ENDPOINT=http://localhost:80
NEXT_PUBLIC_APPWRITE_PROJECT_ID=mdm-project

# Configurações do WebSocket
WEBSOCKET_PORT=3002
WEBSOCKET_HOST=localhost
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3002

# Configurações de segurança
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-encryption-key-here
```

### Inicialização do Servidor

#### Desenvolvimento (Recomendado)
```bash
cd mdm-frontend

# Windows
start-dev.bat

# Linux/Mac
chmod +x start-dev.sh
./start-dev.sh
```

#### Produção com Docker
```bash
cd mdm-frontend
docker-compose up -d
```

#### Serviços Individuais
```bash
# Apenas WebSocket
npm run websocket

# Apenas painel web
npm run dev

# Ambos simultaneamente
npm run dev:all
```

## 📱 App Android - Detalhes Técnicos

### 🏗️ **Arquitetura do App**
- **Linguagem**: Kotlin 100%
- **Min SDK**: 24 (Android 7.0)
- **Target SDK**: 34 (Android 14)
- **Arquitetura**: MVVM com ViewBinding
- **Coroutines**: Para operações assíncronas
- **OkHttp**: Cliente WebSocket e HTTP

### 🔧 **Funcionalidades Implementadas**
- **Device Owner**: Controle total do dispositivo
- **Launcher Customizado**: Substitui tela inicial
- **WebSocket Client**: Comunicação em tempo real
- **Monitoramento de Sistema**: Bateria, armazenamento, memória
- **Coleta de Dados**: IMEI, MAC, serial, informações detalhadas
- **Restrições Avançadas**: 14 tipos de restrições diferentes
- **Modo Kiosque**: Lock Task Mode para apps específicos

### 📊 **Dados Coletados**
```kotlin
// Informações do dispositivo
- Modelo e fabricante
- Versão Android e API Level
- IMEI, MAC Address, Serial Number
- Resolução e densidade da tela
- Arquitetura do processador
- Status da bateria e carregamento
- Armazenamento total e usado
- Memória RAM total e usada
- Apps instalados (sistema e usuário)
- Configurações de rede (Wi-Fi, Bluetooth)
- Localização GPS (se habilitada)
```

### 🚀 **Scripts de Instalação**
- `smart-install.bat` - Instalação inteligente automática
- `install-device-owner.bat` - Instalação manual
- `prepare-device-owner.bat` - Preparação do dispositivo
- `install-emulator-device-owner.bat` - Para emuladores

## 📱 APK Build

```bash
cd mdm-owner
./gradlew assembleRelease

# APK estará em:
# app/build/outputs/apk/release/app-release.apk
```

## 🎯 Casos de Uso

### 🏪 **Varejo/Lojas**
- Tablets como PDV fixo
- Bloquear configurações e apps desnecessários
- Modo kiosque com apps específicos
- **Localização**: Rastrear dispositivos em diferentes lojas
- **Suporte**: Comunicação direta com dispositivos

### 🏭 **Indústria**  
- Dispositivos de chão de fábrica
- Modo kiosque com app único
- Monitoramento remoto de status
- **Localização**: Controle de acesso por área
- **Restrições**: Máxima segurança e controle

### 🏫 **Educação**
- Tablets estudantis controlados
- Apps educacionais apenas
- Restrições de câmera/wifi
- **Suporte**: Comunicação com alunos/professores
- **Localização**: Rastreamento de dispositivos escolares

### 🏥 **Saúde**
- Dispositivos médicos
- Compliance HIPAA
- Acesso restrito a dados
- **Localização**: Controle de acesso por setor
- **Persistência**: Dados críticos sempre salvos

### 🚚 **Logística**
- Dispositivos de entrega
- **Localização**: Rastreamento em tempo real
- **Histórico**: Trajetos e paradas
- **Suporte**: Comunicação com motoristas

### 🏢 **Corporativo**
- Tablets de reunião
- **Localização**: Controle de acesso por andar/setor
- **Suporte**: IT support remoto
- **Persistência**: Configurações corporativas salvas

## 🚨 Troubleshooting

### Device Owner não ativa
```bash
# Verificar se há conta Google
adb shell pm list users

# Factory reset completo necessário
```

### App não conecta servidor
```bash
# Testar conectividade
adb shell ping 192.168.1.100

# Verificar firewall
ufw status
```

### Logs de debug
```bash
# Android
adb logcat | grep MDM

# Servidor Docker
docker-compose logs -f appwrite
docker-compose logs -f mariadb
docker-compose logs -f redis

# WebSocket Server
# Logs aparecem no console onde foi iniciado
node server/websocket.js

# Next.js
npm run dev
# Logs aparecem no terminal
```

### Comandos de Gerenciamento do Servidor

#### Docker
```bash
# Iniciar todos os serviços
docker-compose up -d

# Parar todos os serviços
docker-compose down

# Ver logs em tempo real
docker-compose logs -f

# Reiniciar um serviço específico
docker-compose restart appwrite

# Backup do banco de dados
docker-compose exec mariadb mysqldump -u user -p appwrite > backup.sql

# Restaurar backup
docker-compose exec -T mariadb mysql -u user -p appwrite < backup.sql
```

#### Desenvolvimento
```bash
# Instalar dependências
npm install

# Build para produção
npm run build

# Iniciar em produção
npm start

# Verificar status dos serviços
netstat -tulpn | grep :3000  # Next.js
netstat -tulpn | grep :3002  # WebSocket
```

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🤝 Contribuição

1. Fork do projeto
2. Criar branch feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit changes (`git commit -am 'Adicionar nova funcionalidade'`)
4. Push branch (`git push origin feature/nova-funcionalidade`)
5. Abrir Pull Request

## 📞 Suporte

- 📧 Email: suporte@mdmowner.com
- 💬 Discord: [MDM Owner Community](https://discord.gg/mdmowner)
- 📖 Wiki: [Documentação Completa](https://github.com/seu-usuario/device-owner/wiki)
- 🐛 Issues: [Bug Reports](https://github.com/seu-usuario/device-owner/issues)

---

⭐ **Se este projeto foi útil, deixe uma estrela!** ⭐
