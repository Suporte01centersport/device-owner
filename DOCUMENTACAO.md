# MDM Center — Documentação Completa

> Sistema de gerenciamento remoto de dispositivos Android (Mobile Device Management)
> Última atualização: março 2026

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Módulos do Sistema](#módulos-do-sistema)
   - [mdm-owner (App Android)](#mdm-owner-app-android)
   - [mdm-frontend (Painel Web + Servidor)](#mdm-frontend-painel-web--servidor)
4. [Funcionalidades Implementadas](#funcionalidades-implementadas)
5. [Configuração e Instalação](#configuração-e-instalação)
6. [Como Compilar e Instalar o APK](#como-compilar-e-instalar-o-apk)
7. [Variáveis de Ambiente](#variáveis-de-ambiente)
8. [Funcionamento Multi-Rede](#funcionamento-multi-rede)
9. [Fluxo de Comunicação](#fluxo-de-comunicação)
10. [Arquivos Importantes](#arquivos-importantes)
11. [Histórico de Mudanças](#histórico-de-mudanças)

---

## Visão Geral

O **MDM Center** é um sistema proprietário de gerenciamento de dispositivos Android desenvolvido para uso em frotas de celulares corporativos (ex: coletores de dados, celulares de operadores em armazéns).

**Componentes:**
- **App Android** (`mdm-owner/`) — instalado como Device Owner nos celulares gerenciados
- **Painel Web** (`mdm-frontend/app/`) — interface do administrador (Next.js)
- **Servidor WebSocket** (`mdm-frontend/server/`) — hub de comunicação em tempo real (Node.js)
- **Banco de Dados** — PostgreSQL para persistência de dispositivos, grupos, usuários e histórico

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    PAINEL WEB (Next.js)                  │
│              http://localhost:3000 ou produção           │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (API Routes)
                      ▼
┌─────────────────────────────────────────────────────────┐
│              SERVIDOR NODE.JS (websocket.js)             │
│                    porta 3001                            │
│  • WebSocket Server (dispositivos + painel)              │
│  • API HTTP REST (/api/*)                                │
│  • Discovery Server UDP (porta 3003)                     │
│  • PostgreSQL Client                                     │
│  • Serve APK em /apk/mdm.apk                            │
└──────────┬─────────────────────────────┬────────────────┘
           │ WebSocket                   │ WebSocket
           │ (ws://ip:3001)              │ (ws://ip:3001)
           ▼                             ▼
┌──────────────────┐         ┌──────────────────────────┐
│   CELULAR 1      │         │   CELULAR N               │
│  MDM Center APK  │   ...   │  MDM Center APK           │
│  Device Owner    │         │  Device Owner             │
│  WebSocketService│         │  WebSocketService         │
└──────────────────┘         └──────────────────────────┘
```

---

## Módulos do Sistema

### mdm-owner (App Android)

**Package:** `com.mdm.launcher`
**Min SDK:** API 24 (Android 7.0)
**Target SDK:** API 35 (Android 15)

#### Estrutura de arquivos principais

```
app/src/main/java/com/mdm/launcher/
├── MainActivity.kt                    # Activity principal — launcher kiosk
├── LockScreenActivity.kt              # Tela de cadeado (Lock Task Mode)
├── SetupActivity.kt                   # Configuração inicial do dispositivo
├── UpdateProgressActivity.kt          # Barra de progresso durante atualização APK
├── DeviceAdminReceiver.kt             # Receiver de Device Admin (remove PIN após autenticação)
├── AppChangeReceiver.kt               # Detecta instalação/remoção de apps
│
├── service/
│   ├── WebSocketService.kt            # Serviço principal — conexão com servidor
│   ├── LocationService.kt             # Localização GPS em tempo real
│   ├── AlarmService.kt                # Sirene de alarme (som contínuo)
│   ├── MdmNotificationListenerService.kt  # Bloqueia notificações de outros apps
│   └── WmsAccessibilityService.kt     # Captura erros HTTP/HTTPS da UI do WMS
│
├── utils/
│   ├── DevicePolicyHelper.kt          # Políticas Device Owner (senha, kiosk, WiFi, etc.)
│   ├── ServerDiscovery.kt             # Descoberta automática do servidor MDM
│   ├── DeviceIdManager.kt             # Gerencia ID único do dispositivo
│   ├── DeviceInfoCollector.kt         # Coleta info do celular (bateria, storage, etc.)
│   ├── ApkInstaller.kt                # Download e instalação de APK via URL
│   ├── ConnectionStateManager.kt      # Gerencia estado da conexão WebSocket
│   └── NetworkMonitor.kt             # Monitora mudanças de rede
│
├── network/
│   └── WebSocketClient.kt             # Cliente WebSocket (OkHttp)
│
├── receivers/
│   ├── BluetoothPairingReceiver.kt    # Bloqueia pareamento BT não autorizado
│   ├── DefaultLauncherReceiver.kt     # Mantém MDM como launcher padrão (desabilitado)
│   ├── ShutdownReceiver.kt            # Intercepta desligamento
│   └── SystemBootReceiver.kt          # Boot completed (desabilitado)
│
└── data/
    └── DeviceInfo.kt                  # Model de dados do dispositivo

app/src/main/res/
├── xml/
│   ├── device_admin.xml               # Permissões de Device Admin
│   ├── wms_accessibility_service_config.xml  # Config do AccessibilityService para WMS
│   └── network_security_config.xml    # Permite HTTP cleartext (ws://)
├── layout/
│   └── activity_main.xml              # Layout da tela principal
└── values/
    ├── strings.xml                    # Strings (incluindo descrição do accessibility service)
    └── colors.xml                     # Cores do tema
```

---

### mdm-frontend (Painel Web + Servidor)

**Framework:** Next.js 14 (App Router)
**Runtime do servidor:** Node.js 18+
**Banco:** PostgreSQL

#### Estrutura de arquivos principais

```
mdm-frontend/
├── .env                               # Variáveis de ambiente (não commitado)
├── .env.example                       # Template de configuração
│
├── app/
│   ├── page.tsx                       # Página principal — lista de dispositivos
│   ├── globals.css                    # Estilos globais + tema escuro
│   ├── layout.tsx                     # Layout raiz Next.js
│   ├── types/
│   │   └── device.ts                  # Interfaces TypeScript (Device, AppInfo, etc.)
│   │
│   ├── components/
│   │   ├── DeviceCard.tsx             # Card de dispositivo (bateria, armazenamento, botões)
│   │   ├── AllowedAppsPage.tsx        # Gerenciar apps liberados por celular/grupo
│   │   ├── SupportMessagesModal.tsx   # Modal de mensagens de suporte e controle
│   │   ├── BulkUpdateModal.tsx        # Atualização em massa de APK
│   │   ├── Sidebar.tsx                # Menu lateral de navegação
│   │   ├── AppIcon.tsx                # Ícone de app (Play Store ou emoji fallback)
│   │   ├── LocationMapModal.tsx       # Mapa de localização do dispositivo
│   │   ├── UpdateAppModal.tsx         # Modal de atualização individual de APK
│   │   └── ConfirmModal.tsx           # Modal de confirmação genérico
│   │
│   ├── lib/
│   │   ├── allowed-apps-preset.ts     # Lista de apps predefinidos (WMS obrigatório)
│   │   └── ...
│   │
│   └── api/                           # API Routes Next.js
│       ├── devices/
│       │   ├── route.ts               # GET/POST dispositivos
│       │   ├── bulk-update-mdm/route.ts   # Build e update em massa (Gradle)
│       │   ├── update-app/route.ts    # Enviar comando de atualização via WebSocket
│       │   └── send-notification/route.ts # Enviar notificação para celular
│       ├── groups/
│       │   ├── route.ts               # CRUD de grupos
│       │   └── [id]/
│       │       ├── policies/route.ts  # Políticas de apps do grupo
│       │       └── apply-policies/route.ts # Aplicar políticas em dispositivos do grupo
│       └── support-messages/
│           └── route.ts               # CRUD de mensagens de suporte
│
└── server/
    ├── websocket.js                   # Servidor principal WebSocket + HTTP
    ├── discovery-server.js            # Servidor UDP de descoberta (porta 3003)
    ├── config.js                      # Configurações do servidor
    ├── load-env.js                    # Carrega variáveis de ambiente
    └── database/
        ├── config.js                  # Conexão PostgreSQL
        ├── batch-queue.js             # Fila de escrita em lote no banco
        ├── location-cache.js          # Cache de localização
        └── models/
            ├── Device.js              # Model de dispositivo
            ├── DeviceGroup.js         # Model de grupo
            ├── Computer.js            # Model de computador (acesso remoto)
            ├── AppAccessHistory.js    # Histórico de acesso a apps
            └── DeviceStatusHistory.js # Histórico de status do dispositivo
```

---

## Funcionalidades Implementadas

### Gerenciamento de Dispositivos

| Funcionalidade | Descrição |
|---------------|-----------|
| **Inventário em tempo real** | Lista todos os dispositivos online/offline com bateria, armazenamento, versão Android, modelo, IP |
| **Localização GPS** | Solicitar localização do celular e exibir no mapa (OpenStreetMap) |
| **Travar dispositivo** | Tela preta com cadeado — permanece até desbloqueio remoto pelo painel |
| **Desbloquear** | Remove o cadeado remotamente |
| **Reiniciar** | Reinicia o dispositivo remotamente (via Device Owner API) |
| **Ligar tela** | Acorda o celular remotamente |
| **Deletar dispositivo** | Remove o dispositivo do painel (desconecta do servidor) |

### Atualização de APK

| Funcionalidade | Descrição |
|---------------|-----------|
| **Atualização individual** | Envia URL do APK para o celular via WebSocket → celular baixa e instala automaticamente |
| **Atualização em massa** | Selecionar múltiplos celulares online e atualizar todos simultaneamente |
| **Barra de progresso** | Progresso de download/instalação em tempo real (0-100%) enviado via WebSocket |
| **APK servido pelo servidor** | O próprio servidor Node.js serve o APK em `/apk/mdm.apk` para download |

### Controle de Apps (Kiosk)

| Funcionalidade | Descrição |
|---------------|-----------|
| **Apps liberados por dispositivo** | Definir quais apps cada celular pode usar |
| **Apps liberados por grupo** | Definir política de apps para um grupo inteiro |
| **WMS obrigatório** | WMS (`com.centersporti.wmsmobile`) sempre ativo, não pode ser removido |
| **Apps customizados** | Adicionar qualquer package name à lista de permitidos |
| **Instalar apps ausentes** | Ao salvar, apps não instalados são enviados para instalação via Play Store |

### Mensagens de Suporte

| Funcionalidade | Descrição |
|---------------|-----------|
| **Mensagens do celular** | O celular pode enviar mensagens de suporte ao painel web |
| **Notificação no painel** | Badge e notificação do navegador quando chega nova mensagem |
| **Enviar mensagem ao celular** | Admin pode enviar texto que aparece como notificação no celular |
| **Status da mensagem** | Pendente → Lida → Resolvida |
| **Histórico de mensagens enviadas** | Salvo em localStorage no navegador |

### Captura de Erros WMS

| Funcionalidade | Descrição |
|---------------|-----------|
| **AccessibilityService** | Monitora a UI do WMS (`com.centersporti.wmsmobile`) em tempo real |
| **14 padrões de erro** | HTTP 4XX/5XX, SSL/TLS, timeout, connection refused, socket error, rede indisponível, etc. |
| **Notificação automática** | Erro detectado → broadcast interno → WebSocket → notificação no painel do admin |
| **Debounce 5s** | Evita spam de erros repetidos |
| **NotificationListenerService** | Também captura notificações do sistema do WMS como segunda camada |

### Bluetooth

| Funcionalidade | Descrição |
|---------------|-----------|
| **Pareamento seletivo** | Apenas dispositivos com "barcoder" no nome podem ser pareados automaticamente |
| **Bloqueio de pareamento** | Outros dispositivos têm o pareamento rejeitado silenciosamente |

### Segurança / Kiosk Mode

| Funcionalidade | Descrição |
|---------------|-----------|
| **Device Owner** | App instalado como Device Owner via `adb dpm set-device-owner` |
| **Lock Task Mode** | Tela de cadeado usa Lock Task Mode — botão Home/Back não funciona |
| **Remoção de PIN** | Ao instalar como Device Owner, o PIN/senha do celular é removido automaticamente |
| **Quick Settings restrito** | Apenas: brilho, WiFi, Bluetooth, lanterna — sem edição |
| **Bloqueio de configurações** | Settings bloqueado (exceto WiFi/Bluetooth para operadores) |
| **Keyguard desabilitado** | Sem tela de desbloqueio padrão do Android |

### Multi-Rede (Internet)

| Funcionalidade | Descrição |
|---------------|-----------|
| **IP público configurável** | `WEBSOCKET_PUBLIC_URL` no `.env` define a URL pública do servidor |
| **Descoberta automática** | App tenta: URL pública salva → BuildConfig → UDP broadcast → IPs locais → fallback |
| **URL pública aprendida** | Servidor envia `server_config` com `publicWsUrl` na conexão → app salva para reconexão futura |
| **Broadcast UDP** | Resposta de descoberta inclui a URL pública para dispositivos na mesma rede aprenderem |
| **Fallback LINUX_SERVERS** | Lista de IPs de fallback em builds de produção (inclui IP público) |

---

## Configuração e Instalação

### Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- Android Studio (para compilar o APK)
- Java 11+

### 1. Configurar o servidor

```bash
cd mdm-frontend

# Copiar template de configuração
cp .env.example .env

# Editar .env com suas configurações
nano .env
```

**Conteúdo do `.env`:**

```env
# Banco de Dados
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mdmweb
DB_SSL=false

# Admin
ADMIN_PASSWORD=admin@123

# Servidor WebSocket
WEBSOCKET_HOST=0.0.0.0
WEBSOCKET_PORT=3001

# URL pública (OBRIGATÓRIO para celulares em redes diferentes)
# Coloque seu IP público ou domínio. Porta 3001 deve estar aberta no roteador.
WEBSOCKET_PUBLIC_URL=http://45.172.99.137:3001
```

### 2. Inicializar banco de dados

```bash
cd mdm-frontend
npm install
# O servidor cria as tabelas automaticamente na primeira execução
```

### 3. Iniciar o servidor

```bash
cd mdm-frontend
npm run dev        # Desenvolvimento (porta 3000 + 3001)
# ou
npm run build && npm start   # Produção
```

### 4. Abrir o firewall (para multi-rede)

**Windows (PowerShell como Administrador):**
```powershell
New-NetFirewallRule -DisplayName "MDM Server" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
New-NetFirewallRule -DisplayName "MDM Discovery" -Direction Inbound -Protocol UDP -LocalPort 3003 -Action Allow
```

**Roteador:** Configurar port forwarding da porta **3001 TCP** para o IP local do servidor.

---

## Como Compilar e Instalar o APK

### Pré-requisitos Android

- Android Studio instalado
- ADB configurado no PATH
- Celular em modo desenvolvedor com depuração USB ativa (apenas para a primeira instalação)

### Compilar APK de release (produção)

```bash
cd mdm-owner

# Build padrão (usa IP público configurado no build.gradle)
./gradlew assembleRelease

# Build com IP personalizado
./gradlew assembleRelease -PMDM_SERVER_URL="ws://seu.ip.publico:3001"
```

O APK gerado estará em:
```
mdm-owner/app/build/outputs/apk/release/app-release.apk
```

### Instalar via ADB (primeira vez)

```bash
# Listar dispositivos conectados
adb devices

# Instalar o APK
adb install -r app/build/outputs/apk/release/app-release.apk

# Configurar como Device Owner (OBRIGATÓRIO — fazer uma vez por dispositivo)
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

> **IMPORTANTE:** O `set-device-owner` só funciona se não houver contas Google cadastradas no celular. Remova todas as contas antes.

### Copiar APK para o servidor (para atualizações over-the-air)

```bash
# O servidor serve o APK em http://IP:3001/apk/mdm.apk
cp app/build/outputs/apk/release/app-release.apk ../mdm-frontend/public/apk/mdm.apk
```

### Atualizar celulares remotamente (sem USB)

Após a primeira instalação, use o painel web:
1. Compilar novo APK e copiar para `public/apk/mdm.apk`
2. No painel web → botão **Atualizar** no card do dispositivo
3. Ou usar **Atualização em Massa** para vários celulares

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DB_HOST` | `localhost` | Host do PostgreSQL |
| `DB_PORT` | `5432` | Porta do PostgreSQL |
| `DB_NAME` | `mdmweb` | Nome do banco de dados |
| `DB_USER` | `postgres` | Usuário do banco |
| `DB_PASSWORD` | — | Senha do banco |
| `DB_SSL` | `false` | Usar SSL na conexão com banco |
| `ADMIN_PASSWORD` | `admin@123` | Senha de acesso ao painel |
| `WEBSOCKET_HOST` | `0.0.0.0` | Interface de escuta do servidor WebSocket |
| `WEBSOCKET_PORT` | `3001` | Porta do servidor WebSocket |
| `WEBSOCKET_CLIENT_HOST` | auto | IP do servidor para clientes na mesma rede (auto-detectado se vazio) |
| `WEBSOCKET_PUBLIC_URL` | — | **URL pública** para celulares em redes/cidades diferentes (ex: `http://45.172.99.137:3001`) |
| `MDM_PUBLIC_URL` | — | URL base pública (usada para URL do APK se `WEBSOCKET_PUBLIC_URL` não estiver definida) |

---

## Funcionamento Multi-Rede

O sistema suporta celulares em locais/redes diferentes do servidor (diferentes cidades, WiFi, operadoras).

### Como funciona

```
Celular em rede diferente              Servidor (IP público: 45.172.99.137)
         │                                          │
         │  1. Tenta public_server_url salvo        │
         ├──────────────────────────────────────────►
         │  2. Se falhar, tenta BuildConfig.SERVER_URL
         ├──────────────────────────────────────────►
         │  3. Conectado!                           │
         │                                          │
         │◄─────────────────────────────────────────┤
         │  server_config { publicWsUrl }           │
         │                                          │
         │  Salva public_server_url nas SharedPrefs │
         │  (usado na próxima reconexão)            │
```

### Configuração necessária

1. **Servidor** — Definir no `.env`:
   ```
   WEBSOCKET_PUBLIC_URL=http://45.172.99.137:3001
   ```

2. **APK** — Compilar com IP público (já configurado no `build.gradle`):
   ```gradle
   // Já configurado com 45.172.99.137
   def serverUrl = 'ws://45.172.99.137:3001'
   ```

3. **Rede** — Porta 3001 aberta no firewall e roteador (port forwarding)

### Estratégias de descoberta do servidor (ordem de prioridade)

| Prioridade | Estratégia | Quando usa |
|-----------|-----------|-----------|
| 0 | `public_server_url` das SharedPrefs | URL pública aprendida do servidor anterior |
| 1 | `BuildConfig.SERVER_URL` (release) | Primeira conexão, IP compilado no APK |
| 2 | URL manual (SharedPrefs `server_url`) | Configurada via setup inicial |
| 3 | DNS `mdm.local` | Se tiver DNS local configurado |
| 4 | UDP Broadcast (porta 3003) | Descoberta automática na mesma rede |
| 5 | IPs comuns da rede local | Varredura de IPs 192.168.x.* |
| 6 | `LINUX_SERVERS` hardcoded | Fallback final (inclui IP público) |

---

## Fluxo de Comunicação

### Celular → Painel (eventos)

```
Celular                WebSocket Server              Painel Web
  │                         │                            │
  ├── device_status ────────►                            │
  │   (bateria, apps,       ├── device_connected ───────►│
  │    localização, etc.)   │   (atualiza UI)            │
  │                         │                            │
  ├── support_message ──────►                            │
  │   (erro WMS, pedido     ├── support_message ────────►│
  │    de suporte)          │   (notificação badge)      │
  │                         │                            │
  ├── update_app_progress ──►                            │
  │   (0% → 100%)           ├── update_app_progress ────►│
  │                         │   (barra de progresso)     │
  │                         │                            │
  ├── location_update ──────►                            │
  │   (lat, lng, accuracy)  ├── location_update ────────►│
  │                         │   (atualiza mapa)          │
```

### Painel → Celular (comandos)

```
Painel Web             WebSocket Server              Celular
  │                         │                            │
  ├── lock_device ──────────►                            │
  │                         ├── lock_device ────────────►│
  │                         │                            ├── Mostra LockScreen
  │                         │◄── lock_device_confirmed ──┤
  │◄── lock_device_confirmed┤                            │
  │                         │                            │
  ├── update_app ───────────►                            │
  │   (apk_url, version)    ├── update_app ─────────────►│
  │                         │                            ├── Baixa APK
  │                         │                            ├── Instala
  │                         │◄── update_app_complete ────┤
  │◄── update_app_complete ─┤                            │
  │                         │                            │
  ├── unlock_device ─────────►                          │
  │                         ├── unlock_device ──────────►│
  │                         │                            ├── Fecha LockScreen
```

---

## Arquivos Importantes

### Android

| Arquivo | Função |
|---------|--------|
| `WebSocketService.kt` | Coração do app — mantém conexão, processa todos os comandos remotos |
| `DevicePolicyHelper.kt` | Todas as políticas MDM — kiosk, senha, Quick Settings, acessibilidade |
| `ServerDiscovery.kt` | Descobre o servidor automaticamente (6 estratégias, com cache) |
| `WmsAccessibilityService.kt` | Monitora UI do WMS, captura erros HTTP/HTTPS via regex |
| `LockScreenActivity.kt` | Tela de cadeado com Lock Task Mode |
| `ApkInstaller.kt` | Download progressivo de APK com relatório de progresso via WebSocket |
| `build.gradle` | URL do servidor de produção (`ws://45.172.99.137:3001`) |
| `AndroidManifest.xml` | Todas as permissões e declaração de serviços |

### Servidor / Frontend

| Arquivo | Função |
|---------|--------|
| `server/websocket.js` | Servidor WebSocket + HTTP — hub central de toda comunicação |
| `server/discovery-server.js` | Responde broadcasts UDP para descoberta automática |
| `app/page.tsx` | Interface principal — lista dispositivos, modais, handlers de eventos |
| `app/components/DeviceCard.tsx` | Card individual do dispositivo com ações |
| `app/components/SupportMessagesModal.tsx` | Chat de suporte + controles de dispositivo |
| `app/components/AllowedAppsPage.tsx` | Configuração de apps liberados |
| `app/lib/allowed-apps-preset.ts` | Apps pré-definidos (WMS como obrigatório) |
| `.env` | Configuração do servidor (não commitado no git) |

---

## Histórico de Mudanças

### Março 2026

#### `ac159205` — fix: corrige bugs reais do projeto
- `globals.css`: remove `@keyframes fadeIn` duplicado
- `SupportMessagesModal`: `text-black` → `text-gray-900` no histórico
- `AllowedAppsPage`: extrai `WMS_PACKAGE` como constante (4 strings hardcoded)
- `WmsAccessibilityService`: remove `child.recycle()` deprecated desde Android API 33
- `ServerDiscovery`: remove IP de debug (192.168.2.74), IP público no topo da lista
- `websocket.js`: `getPublicIp()` usa `Promise.any` em paralelo (antes: sequencial, até 15s)

#### `ae24be47` — feat: multi-rede, captura erros WMS, remoção senha, apps obrigatórios, barra progresso

**Multi-rede (celulares em locais diferentes):**
- `ServerDiscovery.kt`: estratégia 0 tenta `public_server_url` das SharedPrefs
- `WebSocketService.kt`: recebe `server_config` e salva URL pública
- `discovery-server.js`: resposta UDP inclui `PUBLIC:url` para dispositivos aprenderem
- `build.gradle`: release usa `ws://45.172.99.137:3001` como servidor padrão
- `.env`: `WEBSOCKET_PUBLIC_URL=http://45.172.99.137:3001` configurado

**Captura de erros WMS:**
- `WmsAccessibilityService.kt`: novo serviço que monitora UI do WMS
- 14 padrões regex para erros HTTP 4XX/5XX, SSL, timeout, rede, socket
- `wms_accessibility_service_config.xml`: configuração do AccessibilityService
- `AndroidManifest.xml`: declaração do serviço com permissão `BIND_ACCESSIBILITY_SERVICE`
- `strings.xml`: descrição do serviço de acessibilidade
- `DevicePolicyHelper.kt`: `promptAccessibilityServiceIfNeeded()` abre configurações na 1ª vez
- `WebSocketService.kt`: recebe broadcast `WMS_ERROR` e envia como `support_message`

**Remoção automática de PIN/senha:**
- `DevicePolicyHelper.kt`: `clearPasswordWithPersistentToken()` usa token persistente
- `DeviceAdminReceiver.kt`: `onPasswordSucceeded` chama remoção de senha após autenticação
- Token de 32 bytes salvo em SharedPrefs (`reset_password_token`) — sobrevive a reboots

**Apps obrigatórios:**
- `AllowedAppsPage.tsx`: WMS marcado como obrigatório (badge âmbar, sem checkbox)
- `allowed-apps-preset.ts`: `mandatory: true` no WMS

**Barra de progresso de atualização:**
- `page.tsx`: `handleUpdateApp` usa `/api/devices/update-app` (não mais Gradle blocking)
- Progresso enviado via WebSocket em tempo real pelo dispositivo

**Outros:**
- `MdmNotificationListenerService.kt`: import `Intent` adicionado (fix build)
- `DeviceCard.tsx`: botão Formatar removido

#### `834afa4d` — feat: logo sidebar, ícones Android, tempo estimado atualização
- Logo na sidebar
- Ícones reais dos apps Android via Play Store
- ETA de atualização calculado dinamicamente

#### `72dc3e3f` — feat: tela de cadeado, usuários líder/operador, apps liberados
- `LockScreenActivity`: tela de cadeado com Lock Task Mode
- Sistema de usuários (líder/operador)
- Página de apps liberados

#### `d839697e` — feat: políticas overview, tema escuro, sirene ao bloquear
- Visão geral de políticas MDM
- Tema escuro em AllowedAppsPage
- Sirene ao acionar bloqueio

---

## Observações Técnicas

### Device Owner

O app precisa ser configurado como Device Owner **uma vez** via ADB:

```bash
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
```

Isso dá ao app poderes para:
- Remover PIN/senha (`resetPasswordWithToken`)
- Desabilitar keyguard (`setKeyguardDisabledFeatures`)
- Controlar Quick Settings (`setStatusBarDisabled`)
- Reiniciar o dispositivo (`reboot`)
- Controlar lock task mode (`setLockTaskPackages`)
- Aplicar restrições de usuário (`addUserRestriction`)

### Assinatura do APK

O release está usando o keystore de debug (`debug.keystore`) para simplicidade interna:

```gradle
release {
    storeFile file("debug.keystore")
    storePassword "android"
    keyAlias "androiddebugkey"
    keyPassword "android"
}
```

> Para uso externo ou publicação, usar um keystore próprio.

### Porta necessárias abertas

| Porta | Protocolo | Uso |
|-------|-----------|-----|
| 3001 | TCP | WebSocket + HTTP (APK download, API) |
| 3003 | UDP | Discovery broadcast (apenas rede local) |
| 3000 | TCP | Painel web Next.js (apenas acesso local) |

---

*Desenvolvido para Centro Sports — Sistema interno de MDM*
