# 🗄️ Como Atualizar o Banco de Dados PostgreSQL

## 📋 Pré-requisitos

- PostgreSQL já instalado e rodando
- Arquivo `.env` configurado com as credenciais do banco
- Estar no diretório `mdm-frontend`

---

## 🔄 Opções de Atualização

### **OPÇÃO 1: Atualizar banco existente (recomendado)**

Se você já tem um banco de dados com dados importantes:

```bash
cd /opt/mdm-owner/mdm-frontend  # ou seu caminho
```

Depois execute as migrações **na ordem abaixo**:

```bash
# 1. Adicionar novos campos na tabela devices
npm run db:migrate:add-new-fields

# 2. Adicionar tabela de apps disponíveis para grupos
npm run db:migrate:group-apps

# 3. Adicionar restrições de grupo (redes permitidas, localização)
npm run db:migrate:group-restrictions

# 4. Adicionar histórico de alertas dos grupos
npm run db:migrate:alert-history
```

**Ou execute todas de uma vez:**

```bash
npm run db:migrate:add-new-fields && \
npm run db:migrate:group-apps && \
npm run db:migrate:group-restrictions && \
npm run db:migrate:alert-history
```

---

### **OPÇÃO 2: Usar script de configuração interativa**

Se o banco já existe mas precisa configurar:

```bash
cd /opt/mdm-owner/mdm-frontend
npm run configure-existing
```

Este script vai:
- Verificar se as tabelas existem
- Perguntar se quer recriar as tabelas (se já existirem)
- Executar o schema principal
- Criar o arquivo `.env` se não existir

**⚠️ ATENÇÃO:** Se escolher recriar tabelas, **todos os dados serão perdidos**!

---

### **OPÇÃO 3: Setup completo (banco novo ou recriar)**

Se for um banco novo ou quiser recriar tudo do zero:

```bash
cd /opt/mdm-owner/mdm-frontend

# Isso vai criar o schema base E rodar migrações
npm run db:setup
```

**⚠️ ATENÇÃO:** `db:setup` pode recriar tabelas e **apagar dados existentes**!

---

## 📝 Migrações Individuais Detalhadas

### **1. Adicionar Novos Campos (`db:migrate:add-new-fields`)**

Adiciona campos como:
- `meid`
- `os_type`
- `compliance_status`
- `allowed_networks`
- `allowed_location`
- Índices de performance

```bash
npm run db:migrate:add-new-fields
```

**O que faz:**
- Adiciona colunas na tabela `devices`
- Cria índices para melhorar performance
- **Não apaga dados existentes**

---

### **2. Apps Disponíveis para Grupos (`db:migrate:group-apps`)**

Cria tabela `group_available_apps` para armazenar apps coletados dos dispositivos de um grupo.

```bash
npm run db:migrate:group-apps
```

**O que faz:**
- Cria tabela `group_available_apps`
- **Não apaga dados existentes**

---

### **3. Restrições de Grupo (`db:migrate:group-restrictions`)**

Adiciona campos de restrições na tabela `device_groups`:
- `allowed_networks` (JSONB) - Redes WiFi permitidas
- `allowed_location` (JSONB) - Área geográfica permitida

```bash
npm run db:migrate:group-restrictions
```

**O que faz:**
- Adiciona colunas `allowed_networks` e `allowed_location` na tabela `device_groups`
- **Não apaga dados existentes**

---

### **4. Histórico de Alertas (`db:migrate:alert-history`)**

Cria tabela `group_alert_history` para armazenar histórico de alertas dos grupos.

```bash
npm run db:migrate:alert-history
```

**O que faz:**
- Cria tabela `group_alert_history`
- Cria índice para otimizar consultas por data
- **Não apaga dados existentes**

---

## ✅ Verificar se Migrações Foram Aplicadas

### **Verificar tabelas no banco:**

```bash
# Conectar ao PostgreSQL
psql -U mdm_user -d mdm_database -h localhost

# Listar todas as tabelas
\dt

# Verificar estrutura de uma tabela específica
\d devices
\d device_groups
\d group_alert_history

# Sair
\q
```

### **Verificar colunas específicas:**

```bash
psql -U mdm_user -d mdm_database -h localhost -c "\d devices" | grep -E "meid|os_type|allowed_networks|allowed_location"

psql -U mdm_user -d mdm_database -h localhost -c "\d device_groups" | grep -E "allowed_networks|allowed_location"
```

---

## 🔍 Verificar Status do Banco

### **Script de verificação:**

```bash
# Verificar se tabela de alertas existe
node check-alert-history-table.js

# Verificar conexão com banco
node check-db.js
```

---

## ⚠️ Troubleshooting

### **Erro: "relation already exists"**

Significa que a migração já foi aplicada. Você pode ignorar ou verificar:

```bash
psql -U mdm_user -d mdm_database -h localhost -c "SELECT column_name FROM information_schema.columns WHERE table_name='devices' AND column_name='meid';"
```

Se retornar `meid`, a migração já foi aplicada.

---

### **Erro: "permission denied"**

Você precisa dar permissões ao usuário do banco:

```bash
sudo -u postgres psql

# Dentro do psql:
\c mdm_owner
GRANT ALL ON SCHEMA public TO mdm_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mdm_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mdm_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mdm_user;

\q
```

---

### **Erro: "cannot connect to database"**

Verifique as configurações no `.env`:

```bash
# Verificar .env
cat .env | grep DB_

# Deve mostrar:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=mdm_owner
# DB_USER=mdm_user
# DB_PASSWORD=sua_senha
```

Teste conexão manualmente:

```bash
psql -U mdm_user -d mdm_database -h localhost
```

Se pedir senha, o `.env` está sendo lido corretamente.

---

### **Erro: "column already exists"**

A migração já foi aplicada. Você pode:

1. **Ignorar o erro** - está tudo OK
2. **Verificar se realmente existe:**
   ```bash
   psql -U mdm_user -d mdm_database -h localhost -c "\d devices" | grep nome_da_coluna
   ```

---

## 📋 Checklist de Atualização

- [ ] Arquivo `.env` configurado corretamente
- [ ] PostgreSQL rodando (`sudo systemctl status postgresql`)
- [ ] Banco de dados existe (`psql -U mdm_user -d mdm_database -h localhost`)
- [ ] Migração `add-new-fields` executada
- [ ] Migração `group-apps` executada
- [ ] Migração `group-restrictions` executada
- [ ] Migração `alert-history` executada
- [ ] Verificou que tabelas/colunas foram criadas
- [ ] Serviços reiniciados após migrações (`pm2 restart all`)

---

## 🔄 Após Atualizar o Banco

Depois de executar as migrações, **reinicie os serviços** para aplicar as mudanças:

```bash
pm2 restart all
pm2 logs --lines 50
```

---

## 💡 Dica

**Sempre faça backup antes de migrações importantes:**

```bash
# Backup do banco antes de migrar
pg_dump -U mdm_user -d mdm_owner > backup_antes_migracao_$(date +%Y%m%d_%H%M%S).sql

# Para restaurar (se necessário):
psql -U mdm_user -d mdm_owner < backup_antes_migracao_YYYYMMDD_HHMMSS.sql
```

---

## 📚 Resumo Rápido

```bash
# 1. Ir para o diretório
cd /opt/mdm-owner/mdm-frontend

# 2. Executar todas as migrações (na ordem)
npm run db:migrate:add-new-fields
npm run db:migrate:group-apps
npm run db:migrate:group-restrictions
npm run db:migrate:alert-history

# 3. Verificar se funcionou
psql -U mdm_user -d mdm_database -h localhost -c "\dt"

# 4. Reiniciar serviços
pm2 restart all
```

**Pronto! Seu banco está atualizado.** ✅

