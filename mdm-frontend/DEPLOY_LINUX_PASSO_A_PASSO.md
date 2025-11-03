# 🐧 Deploy no Servidor Linux - Passo a Passo Manual

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

**Altere estas linhas obrigatoriamente:**

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mdm_owner              # Nome do seu banco
DB_USER=mdm_user               # Usuário do PostgreSQL
DB_PASSWORD=SUA_SENHA_FORTE    # ⚠️ ALTERE ISSO!

# Autenticação
ADMIN_PASSWORD=SUA_SENHA_ADMIN # ⚠️ ALTERE ISSO!
JWT_SECRET=GERAR_STRING_ALEATORIA_LONGA_AQUI  # ⚠️ ALTERE ISSO!

# Servidor
WEBSOCKET_PORT=3002
WEBSOCKET_HOST=0.0.0.0

# Logs
LOG_LEVEL=warn  # Em produção, use 'warn' ou 'error'
```

**Gerar JWT_SECRET seguro:**
```bash
# No terminal Linux:
openssl rand -base64 32
# Use o resultado gerado como JWT_SECRET
```

---

### **PASSO 3: Configurar Banco de Dados PostgreSQL**

```bash
# 3.1. Entrar no PostgreSQL
sudo -u postgres psql

# 3.2. Criar banco de dados (dentro do psql)
CREATE DATABASE mdm_owner;

# 3.3. Criar usuário (substitua 'senha_forte' pela senha que você escolheu)
CREATE USER mdm_user WITH PASSWORD 'senha_forte';

# 3.4. Dar permissões ao usuário
GRANT ALL PRIVILEGES ON DATABASE mdm_owner TO mdm_user;

# 3.5. Para PostgreSQL 15+, dar permissão no schema público
\c mdm_owner
GRANT ALL ON SCHEMA public TO mdm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mdm_user;

# 3.6. Sair do psql
\q
```

**OU usar o script de setup automático:**
```bash
cd /opt/mdm-owner/mdm-frontend
npm run db:setup
```

---

### **PASSO 4: Instalar dependências e fazer build**

```bash
# 4.1. Instalar dependências (apenas produção)
npm install --production

# 4.2. Build da aplicação Next.js
npm run build

# Verificar se o build foi bem-sucedido
ls -la .next  # Deve existir o diretório .next
```

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
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u seu_usuario --hp /home/seu_usuario

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
sudo netstat -tulpn | grep -E '3000|3002'

# 9.4. Testar acesso
curl http://localhost:3000
# Deve retornar HTML da página
```

---

## 📝 Comandos Úteis

### **Ver logs**
```bash
# Todos os logs
pm2 logs

# Log específico
pm2 logs mdm-websocket
pm2 logs mdm-frontend

# Últimas 100 linhas
pm2 logs --lines 100
```

### **Gerenciar serviços**
```bash
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
```

### **Status e monitoramento**
```bash
# Listar processos
pm2 list

# Informações detalhadas
pm2 show mdm-websocket

# Monitoramento em tempo real
pm2 monit

# Salvar configuração atual
pm2 save
```

---

## 🔄 Atualizar Código (quando fizer alterações)

```bash
# 1. Ir para o diretório do projeto
cd /opt/mdm-owner  # ou ~/device-owner

# 2. Atualizar código do Git
git pull origin main

# 3. Ir para o frontend
cd mdm-frontend

# 4. Instalar novas dependências (se houver)
npm install --production

# 5. Rebuild da aplicação
npm run build

# 6. Reiniciar serviços
pm2 restart all

# 7. Verificar se está tudo OK
pm2 list
pm2 logs --lines 50
```

---

## 🗄️ Migrações de Banco de Dados

Se houver novas migrações:

```bash
cd /opt/mdm-owner/mdm-frontend

# Rodar migrações individuais
npm run db:migrate:add-new-fields
npm run db:migrate:group-apps
npm run db:migrate:group-restrictions
npm run db:migrate:alert-history
```

---

## 🔍 Troubleshooting

### **Serviços não iniciam**
```bash
# Ver logs de erro
pm2 logs --err

# Verificar se portas estão livres
sudo netstat -tulpn | grep -E '3000|3002'

# Se porta estiver ocupada, matar processo
sudo kill -9 $(sudo lsof -t -i:3000)
sudo kill -9 $(sudo lsof -t -i:3002)
```

### **Erro de conexão com banco**
```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Testar conexão
psql -U mdm_user -d mdm_owner -h localhost

# Verificar configurações no .env
cat .env | grep DB_
```

### **Erro de permissões**
```bash
# Dar permissões ao diretório
sudo chown -R $USER:$USER /opt/mdm-owner
chmod -R 755 /opt/mdm-owner
```

### **PM2 não salva configuração**
```bash
# Reconfigurar startup
pm2 startup
# Execute o comando mostrado como root

# Salvar novamente
pm2 save
```

---

## ✅ Checklist Final

Antes de considerar o deploy completo, verifique:

- [ ] Node.js 18+ instalado
- [ ] PostgreSQL instalado e rodando
- [ ] PM2 instalado globalmente
- [ ] Arquivo `.env` configurado com senhas alteradas
- [ ] Banco de dados criado e configurado
- [ ] Build executado com sucesso
- [ ] Firewall configurado (portas 3000, 3002)
- [ ] Serviços rodando no PM2
- [ ] PM2 configurado para iniciar no boot
- [ ] Teste de acesso local funcionando
- [ ] Logs sem erros críticos

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

**Pronto! Seu sistema está deployado no servidor Linux.** 🎉

