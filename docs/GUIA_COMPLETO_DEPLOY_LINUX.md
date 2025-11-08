# 🐧 Guia Completo de Deploy no Servidor Linux

Guia completo e consolidado para fazer deploy do MDM Owner em servidor Linux.

---

## 📋 Índice

1. [Pré-requisitos](#-pré-requisitos)
2. [Configuração do Servidor](#-configuração-do-servidor)
3. [Passo a Passo do Deploy](#-passo-a-passo-do-deploy)
4. [Configuração do Banco de Dados](#-configuração-do-banco-de-dados)
5. [Atualizar Banco de Dados (Migrações)](#-atualizar-banco-de-dados-migrações)
6. [Resolução de Problemas de Build](#-resolução-de-problemas-de-build)
7. [Gerenciar Serviços](#-gerenciar-serviços)
8. [Troubleshooting](#-troubleshooting)

---

## 📋 Pré-requisitos

### 1. Instalar Node.js 18+ no servidor Linux
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalação
node -v  # Deve mostrar v18.x ou superior
npm -v
```

### 2. Instalar PostgreSQL
```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

# Verificar se está rodando
sudo systemctl status postgresql
```

### 3. Instalar PM2 (gerenciador de processos)
```bash
sudo npm install -g pm2
pm2 -v  # Verificar instalação
```

### 4. Instalar Git (se ainda não tiver)
```bash
sudo apt-get install -y git
```

---

## 🐧 Configuração do Servidor

### **Arquivo `.env` (no diretório `mdm-frontend`)**

```env
NODE_ENV=production

# Banco de Dados PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mdm_database
DB_USER=mdm_user
DB_PASSWORD=475869

# Portas dos Serviços
PORT=3002
WS_PORT=3002
WEBSOCKET_PORT=3002
WEBSOCKET_HOST=0.0.0.0
DISCOVERY_PORT=3003

# Autenticação
ADMIN_PASSWORD=Admin@2025!CHANGE_THIS
JWT_SECRET=production-super-secret-jwt-key-CHANGE-THIS-TO-RANDOM-STRING
JWT_EXPIRES_IN=24h

# Logs
LOG_LEVEL=warn

# Configurações de Performance
MAX_PINGS_PER_MINUTE=60
HEARTBEAT_INTERVAL=30000
PING_PROBABILITY=0.5
BASE_INACTIVITY_TIMEOUT=90000
MAX_INACTIVITY_TIMEOUT=180000
MIN_INACTIVITY_TIMEOUT=60000

# Configurações de Reconexão
MAX_RECONNECT_ATTEMPTS=20
INITIAL_RECONNECT_DELAY=1000
MAX_RECONNECT_DELAY=30000

# Next.js
NEXT_TELEMETRY_DISABLED=1
```

**Gerar JWT_SECRET seguro:**
```bash
openssl rand -base64 32
```

---

## 🚀 Passo a Passo do Deploy

### **PASSO 1: Preparar o código no servidor**

```bash
# 1.1. Clonar ou atualizar o repositório
# Se for a primeira vez:
git clone <URL_DO_SEU_REPOSITORIO> /opt/mdm-owner
# ou
git clone <URL_DO_SEU_REPOSITORIO> ~/device-owner

# Se já tiver o código:
cd /opt/mdm-owner  # ou ~/device-owner
git pull origin main  # ou sua branch principal

# 1.2. Entrar no diretório do frontend
cd mdm-frontend
```

---

### **PASSO 2: Configurar arquivo .env**

```bash
# 2.1. Copiar template de produção
cp env.production.example .env

# 2.2. Editar o arquivo .env com suas configurações
nano .env
# ou
vim .env
```

**⚠️ IMPORTANTE:** Altere as senhas:
- `DB_PASSWORD`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

---

### **PASSO 3: Configurar Banco de Dados PostgreSQL**

#### **Opção A: Criar manualmente**

```bash
# 3.1. Entrar no PostgreSQL
sudo -u postgres psql

# 3.2. Criar banco de dados (dentro do psql)
CREATE DATABASE mdm_database;

# 3.3. Criar usuário (substitua 'senha' pela senha do seu .env)
CREATE USER mdm_user WITH PASSWORD '475869';

# 3.4. Dar permissões ao usuário
GRANT ALL PRIVILEGES ON DATABASE mdm_database TO mdm_user;

# 3.5. Para PostgreSQL 15+, dar permissão no schema público
\c mdm_database
GRANT ALL ON SCHEMA public TO mdm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mdm_user;

# 3.6. Sair do psql
\q
```

#### **Opção B: Usar script automático**

```bash
cd ~/device-owner/mdm-frontend
npm run db:setup
```

#### **Verificar conexão:**

```bash
psql -U mdm_user -d mdm_database -h localhost
# Se pedir senha, digite a senha do .env
# Se conectar, está OK. Digite \q para sair.
```

---

### **PASSO 4: Instalar dependências e fazer build**

```bash
# 4.1. Instalar TODAS as dependências (incluindo devDependencies para o build)
npm install

# 4.2. Build da aplicação Next.js
npm run build

# Verificar se o build foi bem-sucedido
ls -la .next  # Deve existir o diretório .next
```

**⚠️ IMPORTANTE:** Use `npm install` (sem `--production`) para ter todas as dependências necessárias para o build.

---

### **PASSO 5: Configurar Firewall**

```bash
# 5.1. Abrir portas necessárias
sudo ufw allow 3000/tcp  # Frontend web
sudo ufw allow 3002/tcp  # WebSocket MDM
sudo ufw allow 3003/udp  # Discovery Server (opcional)

# 5.2. Se precisar abrir porta SSH (caso feche tudo)
sudo ufw allow 22/tcp

# 5.3. Habilitar firewall
sudo ufw enable

# 5.4. Verificar status
sudo ufw status
```

---

### **PASSO 6: Iniciar serviços com PM2**

```bash
# 6.1. Criar diretório para logs
mkdir -p logs

# 6.2. Iniciar servidor WebSocket
pm2 start npm --name "mdm-websocket" -- run websocket:prod \
  --log logs/websocket.log \
  --error logs/websocket-error.log

# 6.3. Iniciar servidor Next.js (Frontend)
pm2 start npm --name "mdm-frontend" -- start \
  --log logs/frontend.log \
  --error logs/frontend-error.log

# 6.4. Verificar se estão rodando
pm2 list

# 6.5. Salvar configuração do PM2
pm2 save
```

---

### **PASSO 7: Configurar PM2 para iniciar no boot**

```bash
# 7.1. Gerar comando de startup
pm2 startup

# O comando vai mostrar algo como:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u usuario --hp /home/usuario

# 7.2. Execute o comando exibido (copie e cole exatamente como mostrado)
# Exemplo:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u devcenter --hp /home/devcenter

# 7.3. Salvar novamente após configurar
pm2 save
```

---

### **PASSO 8: (Opcional) Iniciar Discovery Server**

```bash
# Se precisar do Discovery Server para descoberta automática:
pm2 start server/discovery-server.js --name "mdm-discovery" \
  --log logs/discovery.log \
  --error logs/discovery-error.log

pm2 save
```

---

### **PASSO 9: Verificar se está tudo funcionando**

```bash
# 9.1. Ver status dos serviços
pm2 list

# Deve mostrar:
# ┌─────┬──────────────────┬─────────┬─────────┬──────────┐
# │ id  │ name             │ status  │ restart │ uptime   │
# ├─────┼──────────────────┼─────────┼─────────┼──────────┤
# │ 0   │ mdm-websocket    │ online  │ 0       │ 10s      │
# │ 1   │ mdm-frontend     │ online  │ 0       │ 10s      │
# └─────┴──────────────────┴─────────┴─────────┴──────────┘

# 9.2. Ver logs em tempo real
pm2 logs

# 9.3. Verificar portas
sudo netstat -tulpn | grep -E '3000|3002|3003'

# 9.4. Testar acesso
curl http://localhost:3000
# Deve retornar HTML da página
```

---

## 🗄️ Configuração do Banco de Dados

### **Criar/Verificar Banco de Dados**

```bash
# Conectar ao PostgreSQL como postgres
sudo -u postgres psql

# Criar banco (se não existir)
CREATE DATABASE mdm_database;

# Criar usuário (se não existir)
CREATE USER mdm_user WITH PASSWORD '475869';

# Dar permissões
GRANT ALL PRIVILEGES ON DATABASE mdm_database TO mdm_user;

# Para PostgreSQL 15+
\c mdm_database
GRANT ALL ON SCHEMA public TO mdm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mdm_user;

# Sair
\q
```

### **Testar Conexão**

```bash
psql -U mdm_user -d mdm_database -h localhost
# Se pedir senha, digite: 475869
# Se conectar, está OK. Digite \q para sair.
```

---

## 🔄 Atualizar Banco de Dados (Migrações)

### **Opção 1: Atualizar banco existente (recomendado)**

Se você já tem um banco de dados com dados importantes:

```bash
cd ~/device-owner/mdm-frontend

# Executar migrações NA ORDEM:
npm run db:migrate:add-new-fields
npm run db:migrate:group-apps
npm run db:migrate:group-restrictions
npm run db:migrate:alert-history
```

**Ou execute todas de uma vez:**

```bash
npm run db:migrate:add-new-fields && \
npm run db:migrate:group-apps && \
npm run db:migrate:group-restrictions && \
npm run db:migrate:alert-history
```

### **O que cada migração faz:**

#### **1. Adicionar Novos Campos (`db:migrate:add-new-fields`)**
- Adiciona campos: `meid`, `os_type`, `compliance_status`, `allowed_networks`, `allowed_location`
- Cria índices para melhorar performance
- **Não apaga dados existentes**

#### **2. Apps Disponíveis para Grupos (`db:migrate:group-apps`)**
- Cria tabela `group_available_apps`
- **Não apaga dados existentes**

#### **3. Restrições de Grupo (`db:migrate:group-restrictions`)**
- Adiciona `allowed_networks` e `allowed_location` na tabela `device_groups`
- **Não apaga dados existentes**

#### **4. Histórico de Alertas (`db:migrate:alert-history`)**
- Cria tabela `group_alert_history`
- Cria índice para otimizar consultas por data
- **Não apaga dados existentes**

### **Verificar se Migrações Foram Aplicadas**

```bash
# Conectar ao PostgreSQL
psql -U mdm_user -d mdm_database -h localhost

# Listar todas as tabelas
\dt

# Verificar estrutura de uma tabela específica
\d devices
\d device_groups
\d group_alert_history

# Verificar colunas específicas
\d devices | grep -E "meid|os_type|allowed_networks|allowed_location"
\d device_groups | grep -E "allowed_networks|allowed_location"

# Sair
\q
```

### **Após Atualizar o Banco**

```bash
# Reiniciar serviços para aplicar as mudanças
pm2 restart all
pm2 logs --lines 50
```

---

## 🔧 Resolução de Problemas de Build

### **Erro: "Module not found: Can't resolve '@react-pdf/renderer'"**

#### **Solução 1: Reinstalar dependências (Recomendado)**

```bash
cd ~/device-owner/mdm-frontend

# Remover node_modules e package-lock.json
rm -rf node_modules package-lock.json

# Reinstalar todas as dependências
npm install

# Tentar build novamente
npm run build
```

#### **Solução 2: Limpar cache e reinstalar**

```bash
cd ~/device-owner/mdm-frontend

# Limpar cache do npm
npm cache clean --force

# Reinstalar dependências
npm install

# Tentar build novamente
npm run build
```

#### **Solução 3: Instalar apenas o pacote faltante**

```bash
cd ~/device-owner/mdm-frontend

# Instalar o pacote específico
npm install @react-pdf/renderer

# Tentar build novamente
npm run build
```

### **Verificar se Está Instalado**

```bash
# Verificar se o pacote existe
ls -la node_modules/@react-pdf/renderer

# Ou verificar via npm
npm list @react-pdf/renderer
```

### **⚠️ Nota Importante**

Para o build funcionar, você precisa de **todas as dependências** (incluindo devDependencies). Não use `npm install --production` antes do build.

**Sequência correta:**

```bash
# 1. Instalar TODAS as dependências (incluindo devDependencies para o build)
npm install

# 2. Fazer o build
npm run build

# 3. Depois do build, você pode usar apenas produção no servidor
```

### **Por que isso acontece?**

O `@react-pdf/renderer` precisa de dependências nativas que podem não ser instaladas corretamente se:
1. O `npm install` foi executado em ambiente Windows e depois o código foi copiado
2. O `node_modules` foi instalado com `--production` antes do build
3. Há incompatibilidade entre plataformas (win32 vs linux)

**Solução:** Sempre execute `npm install` no mesmo ambiente onde vai fazer o build.

---

## 🎮 Gerenciar Serviços

### **Ver Logs**

```bash
# Todos os logs
pm2 logs

# Log específico
pm2 logs mdm-websocket
pm2 logs mdm-frontend

# Últimas 100 linhas
pm2 logs --lines 100
```

### **Gerenciar Serviços**

```bash
# Ver status
pm2 list

# Parar todos
pm2 stop all

# Parar específico
pm2 stop mdm-websocket

# Reiniciar todos
pm2 restart all

# Reiniciar específico
pm2 restart mdm-frontend

# Reiniciar e limpar logs
pm2 flush

# Deletar processo do PM2
pm2 delete mdm-websocket

# Informações detalhadas
pm2 show mdm-websocket

# Monitoramento em tempo real
pm2 monit

# Salvar configuração atual
pm2 save
```

### **Atualizar Código (quando fizer alterações)**

```bash
# 1. Ir para o diretório do projeto
cd ~/device-owner

# 2. Atualizar código do Git
git pull origin main

# 3. Ir para o frontend
cd mdm-frontend

# 4. Instalar novas dependências (se houver)
npm install

# 5. Rebuild da aplicação
npm run build

# 6. Reiniciar serviços
pm2 restart all

# 7. Verificar se está tudo OK
pm2 list
pm2 logs --lines 50
```

---

## 🔍 Troubleshooting

### **Serviços não iniciam**

```bash
# Ver logs de erro
pm2 logs --err

# Verificar se portas estão livres
sudo netstat -tulpn | grep -E '3000|3002|3003'

# Se porta estiver ocupada, matar processo
sudo kill -9 $(sudo lsof -t -i:3000) 2>/dev/null || true
sudo kill -9 $(sudo lsof -t -i:3002) 2>/dev/null || true
sudo kill -9 $(sudo lsof -t -i:3003) 2>/dev/null || true

# Reiniciar
pm2 restart all
```

### **Erro de conexão com banco**

```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Testar conexão
psql -U mdm_user -d mdm_database -h localhost

# Verificar configurações no .env
cat .env | grep DB_

# Deve mostrar:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=mdm_database
# DB_USER=mdm_user
# DB_PASSWORD=475869
```

### **Erro: "database does not exist"**

```bash
# Criar banco
sudo -u postgres psql -c "CREATE DATABASE mdm_database;"
```

### **Erro: "password authentication failed"**

```bash
# Verificar senha no .env
cat .env | grep DB_PASSWORD

# Deve ser: DB_PASSWORD=475869
```

### **Erro: "permission denied"**

```bash
# Dar permissões ao usuário
sudo -u postgres psql

GRANT ALL PRIVILEGES ON DATABASE mdm_database TO mdm_user;
\c mdm_database
GRANT ALL ON SCHEMA public TO mdm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mdm_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mdm_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mdm_user;

\q

# Dar permissões ao diretório
sudo chown -R $USER:$USER ~/device-owner
chmod -R 755 ~/device-owner
```

### **Erro: "relation already exists" (em migrações)**

Significa que a migração já foi aplicada. Você pode ignorar ou verificar:

```bash
psql -U mdm_user -d mdm_database -h localhost -c "SELECT column_name FROM information_schema.columns WHERE table_name='devices' AND column_name='meid';"
```

Se retornar `meid`, a migração já foi aplicada.

### **Erro: "column already exists" (em migrações)**

A migração já foi aplicada. Você pode:
1. **Ignorar o erro** - está tudo OK
2. **Verificar se realmente existe:**
   ```bash
   psql -U mdm_user -d mdm_database -h localhost -c "\d devices" | grep nome_da_coluna
   ```

### **PM2 não salva configuração**

```bash
# Reconfigurar startup
pm2 startup
# Execute o comando mostrado como root

# Salvar novamente
pm2 save
```

### **Firewall bloqueando**

```bash
# Verificar regras
sudo ufw status

# Abrir portas necessárias
sudo ufw allow 3000/tcp
sudo ufw allow 3002/tcp
sudo ufw allow 3003/udp

# Habilitar firewall
sudo ufw enable
```

---

## ✅ Checklist Final

Antes de considerar o deploy completo, verifique:

- [ ] Node.js 18+ instalado
- [ ] PostgreSQL instalado e rodando
- [ ] PM2 instalado globalmente
- [ ] Arquivo `.env` configurado com senhas alteradas
- [ ] Banco de dados criado e configurado
- [ ] Dependências instaladas (`npm install`)
- [ ] Build executado com sucesso (`npm run build`)
- [ ] Firewall configurado (portas 3000, 3002, 3003)
- [ ] Serviços rodando no PM2
- [ ] PM2 configurado para iniciar no boot
- [ ] Teste de acesso local funcionando
- [ ] Logs sem erros críticos
- [ ] Migrações de banco aplicadas (se necessário)

---

## 🌐 Acessar o Sistema

Após o deploy completo:

- **Frontend Web:** `http://SEU_IP_SERVIDOR:3000`
- **WebSocket:** `ws://SEU_IP_SERVIDOR:3002`

**Descobrir IP do servidor:**
```bash
hostname -I
# ou
ip addr show
```

---

## 📝 Variáveis Importantes

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `DB_NAME` | `mdm_database` | Nome do banco de dados |
| `DB_USER` | `mdm_user` | Usuário do PostgreSQL |
| `DB_PASSWORD` | `475869` | Senha do banco |
| `WEBSOCKET_PORT` | `3002` | Porta do WebSocket |
| `DISCOVERY_PORT` | `3003` | Porta do Discovery Server |

---

## 💡 Dicas

### **Backup do Banco**

Sempre faça backup antes de migrações importantes:

```bash
# Backup do banco antes de migrar
pg_dump -U mdm_user -d mdm_database > backup_antes_migracao_$(date +%Y%m%d_%H%M%S).sql

# Para restaurar (se necessário):
psql -U mdm_user -d mdm_database < backup_antes_migracao_YYYYMMDD_HHMMSS.sql
```

### **Verificar Status dos Serviços**

```bash
# Verificar serviços
pm2 list

# Verificar portas
sudo netstat -tulpn | grep -E '3000|3002|3003'

# Verificar banco
psql -U mdm_user -d mdm_database -h localhost -c "\dt"
```

---

## 📚 Resumo Rápido

### **Deploy Inicial Completo**

```bash
# 1. Preparar código
cd ~/device-owner/mdm-frontend

# 2. Configurar .env
cp env.production.example .env
nano .env  # Editar senhas

# 3. Criar banco (se necessário)
sudo -u postgres psql -c "CREATE DATABASE mdm_database;"
sudo -u postgres psql -c "CREATE USER mdm_user WITH PASSWORD '475869';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mdm_database TO mdm_user;"

# 4. Instalar dependências e build
npm install
npm run build

# 5. Iniciar serviços
mkdir -p logs
pm2 start npm --name "mdm-websocket" -- run websocket:prod
pm2 start npm --name "mdm-frontend" -- start
pm2 save
pm2 startup  # Execute o comando mostrado
```

### **Atualizar Banco de Dados**

```bash
cd ~/device-owner/mdm-frontend

npm run db:migrate:add-new-fields
npm run db:migrate:group-apps
npm run db:migrate:group-restrictions
npm run db:migrate:alert-history

pm2 restart all
```

### **Atualizar Código**

```bash
cd ~/device-owner
git pull
cd mdm-frontend
npm install
npm run build
pm2 restart all
```

---

**Pronto! Seu sistema está deployado no servidor Linux.** 🎉

---

**Última atualização:** 2025  
**Versão:** 1.0.0

