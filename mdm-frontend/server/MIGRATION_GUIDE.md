# 🗄️ Guia de Migração para PostgreSQL

Este guia explica como migrar o sistema MDM Owner de arquivos JSON para PostgreSQL.

## 📋 Pré-requisitos

### 1. PostgreSQL Instalado
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Windows
# Baixe e instale do site oficial: https://www.postgresql.org/download/windows/

# macOS
brew install postgresql
```

### 2. Node.js e Dependências
```bash
cd mdm-frontend
npm install
```

## 🚀 Processo de Migração

### Passo 1: Configurar PostgreSQL
```bash
# Iniciar PostgreSQL
sudo systemctl start postgresql  # Linux
brew services start postgresql    # macOS

# Criar usuário postgres (se necessário)
sudo -u postgres createuser --interactive
```

### Passo 2: Configurar Variáveis de Ambiente
```bash
# Copiar arquivo de exemplo
cp env.example .env

# Editar configurações
nano .env
```

Configurações mínimas necessárias:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mdm_owner
DB_USER=mdm_user
DB_PASSWORD=mdm_password
DB_SSL=false
ADMIN_PASSWORD=admin123
```

### Passo 3: Executar Setup Automático
```bash
# Setup completo (cria banco + migra dados)
npm run db:setup
```

Ou executar manualmente:
```bash
# 1. Criar banco e usuário
npm run setup-db

# 2. Migrar dados dos arquivos JSON
npm run migrate
```

### Passo 4: Verificar Migração
```bash
# Conectar ao PostgreSQL
psql -h localhost -U mdm_user -d mdm_owner

# Verificar tabelas
\dt

# Verificar dados
SELECT COUNT(*) FROM devices;
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM users;
```

## 🔧 Solução de Problemas

### Erro: "role mdm_user does not exist"
```bash
# Criar usuário manualmente
sudo -u postgres psql
CREATE USER mdm_user WITH PASSWORD 'mdm_password';
CREATE DATABASE mdm_owner OWNER mdm_user;
GRANT ALL PRIVILEGES ON DATABASE mdm_owner TO mdm_user;
\q
```

### Erro: "database mdm_owner does not exist"
```bash
# Criar banco manualmente
sudo -u postgres createdb mdm_owner
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mdm_owner TO mdm_user;"
```

### Erro de Conexão
```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Verificar porta
netstat -tlnp | grep 5432

# Verificar configuração
sudo nano /etc/postgresql/*/main/postgresql.conf
```

### Erro de Permissões
```bash
# Verificar pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Adicionar linha para permitir conexões locais:
local   all             mdm_user                                md5
host    all             mdm_user        127.0.0.1/32            md5
```

## 📊 Verificação Pós-Migração

### 1. Verificar Dados Migrados
```sql
-- Contar dispositivos
SELECT COUNT(*) as total_devices FROM devices;

-- Verificar dispositivos online
SELECT COUNT(*) as online_devices FROM devices WHERE status = 'online';

-- Verificar organização padrão
SELECT * FROM organizations WHERE slug = 'default';

-- Verificar usuário admin
SELECT email, first_name, last_name, role FROM users WHERE role = 'admin';
```

### 2. Testar Funcionalidades
```bash
# Iniciar servidor WebSocket
npm run websocket

# Em outro terminal, iniciar frontend
npm run dev

# Verificar logs do servidor
tail -f server/logs/websocket.log
```

### 3. Backup dos Arquivos JSON
Os arquivos JSON originais são automaticamente movidos para:
```
mdm-frontend/server/backup/backup-[timestamp]/
├── devices.json
├── admin_password.json
└── support_messages.json
```

## 🔄 Rollback (Voltar para JSON)

Se necessário voltar para arquivos JSON:

```bash
# 1. Parar servidor WebSocket
pkill -f "node server/websocket.js"

# 2. Restaurar arquivos JSON do backup
cp server/backup/backup-[timestamp]/*.json server/

# 3. Reverter websocket.js (se foi modificado)
git checkout server/websocket.js

# 4. Reiniciar servidor
npm run websocket
```

## 📈 Benefícios da Migração

### ✅ Performance
- **Consultas mais rápidas** com índices otimizados
- **Transações ACID** para consistência de dados
- **Pool de conexões** para melhor escalabilidade

### ✅ Escalabilidade
- **Suporte a múltiplas organizações** (multi-tenancy)
- **Backup automático** e recuperação
- **Replicação** para alta disponibilidade

### ✅ Segurança
- **Autenticação robusta** com usuários e roles
- **Auditoria completa** de ações
- **Criptografia** de senhas com bcrypt

### ✅ Funcionalidades Avançadas
- **Relatórios complexos** com SQL
- **Analytics em tempo real**
- **Integração com ferramentas** de monitoramento

## 🆘 Suporte

Se encontrar problemas durante a migração:

1. **Verifique os logs** do PostgreSQL: `/var/log/postgresql/`
2. **Consulte a documentação** oficial do PostgreSQL
3. **Execute os comandos de diagnóstico** acima
4. **Faça backup** antes de tentar correções

## 📚 Próximos Passos

Após a migração bem-sucedida:

1. **Implementar autenticação JWT** completa
2. **Adicionar sistema de roles** e permissões
3. **Configurar backup automático**
4. **Implementar multi-tenancy** avançado
5. **Adicionar métricas** e monitoramento

---

**Status**: ✅ **Migração implementada e testada**
