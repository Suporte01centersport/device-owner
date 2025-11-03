# 🐧 Configuração do Servidor Linux - Referência Rápida

## 📋 Configurações do Servidor

Baseado nas configurações do seu servidor Linux:

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

# Outras configurações (adicione conforme necessário)
ADMIN_PASSWORD=Admin@2025!CHANGE_THIS
JWT_SECRET=production-super-secret-jwt-key-CHANGE-THIS-TO-RANDOM-STRING
JWT_EXPIRES_IN=24h
LOG_LEVEL=warn
```

---

## ✅ Checklist Rápido

### **1. Criar/Verificar Banco de Dados**

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

### **2. Testar Conexão**

```bash
# Testar conexão
psql -U mdm_user -d mdm_database -h localhost

# Se pedir senha, digite: 475869
# Se conectar, está OK. Digite \q para sair.
```

### **3. Criar Arquivo .env**

```bash
cd /opt/mdm-owner/mdm-frontend  # ou seu caminho

# Copiar template
cp env.production.example .env

# Editar com suas configurações
nano .env
```

**Cole o conteúdo acima no arquivo `.env`**

---

## 🚀 Comandos Essenciais

### **Iniciar Serviços**

```bash
cd /opt/mdm-owner/mdm-frontend

# Criar diretório de logs
mkdir -p logs

# Iniciar WebSocket
pm2 start npm --name "mdm-websocket" -- run websocket:prod \
  --log logs/websocket.log \
  --error logs/websocket-error.log

# Iniciar Frontend
pm2 start npm --name "mdm-frontend" -- start \
  --log logs/frontend.log \
  --error logs/frontend-error.log

# Salvar configuração
pm2 save
```

### **Atualizar Banco de Dados**

```bash
cd /opt/mdm-owner/mdm-frontend

# Executar todas as migrações
npm run db:migrate:add-new-fields
npm run db:migrate:group-apps
npm run db:migrate:group-restrictions
npm run db:migrate:alert-history
```

### **Gerenciar Serviços**

```bash
# Ver status
pm2 list

# Ver logs
pm2 logs

# Reiniciar
pm2 restart all

# Parar
pm2 stop all
```

---

## 🔍 Verificar se Está Funcionando

### **1. Verificar Serviços**

```bash
pm2 list
# Deve mostrar mdm-websocket e mdm-frontend como "online"
```

### **2. Verificar Portas**

```bash
sudo netstat -tulpn | grep -E '3000|3002|3003'
# Deve mostrar as portas em uso
```

### **3. Testar Acesso**

```bash
# Frontend
curl http://localhost:3000

# WebSocket (deve retornar erro de WebSocket, mas confirma que está rodando)
curl http://localhost:3002
```

### **4. Verificar Banco**

```bash
# Ver tabelas
psql -U mdm_user -d mdm_database -h localhost -c "\dt"

# Verificar se migrações foram aplicadas
psql -U mdm_user -d mdm_database -h localhost -c "\d devices" | grep -E "meid|os_type"
```

---

## 🔥 Firewall

```bash
# Abrir portas necessárias
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 3002/tcp  # WebSocket
sudo ufw allow 3003/udp  # Discovery (opcional)

# Verificar
sudo ufw status
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

## 🆘 Problemas Comuns

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
```

---

**Configuração do servidor Linux documentada!** ✅

