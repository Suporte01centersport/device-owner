# 🗄️ Guia para Banco PostgreSQL Existente

Este guia explica como configurar o MDM Owner com um banco PostgreSQL que você já possui.

## 🚀 Configuração Rápida

### 1. Instalar Dependências
```bash
cd mdm-frontend
npm install
```

### 2. Executar Configuração Interativa
```bash
npm run configure-existing
```

O script irá solicitar:
- **Host**: `localhost` (padrão)
- **Porta**: `5432` (padrão)
- **Nome do banco**: Seu banco existente (ex: `mdmweb`)
- **Usuário**: Seu usuário PostgreSQL
- **Senha**: Sua senha PostgreSQL

### 3. Verificar Configuração
O script irá:
- ✅ Testar conexão com seu banco
- ✅ Verificar tabelas existentes
- ✅ Criar schema do MDM (se necessário)
- ✅ Migrar dados dos arquivos JSON
- ✅ Criar arquivo `.env` com suas configurações

## 📋 Exemplo de Uso

```bash
$ npm run configure-existing

🔧 Configurando MDM Owner com banco PostgreSQL existente...

📋 Informações do banco de dados:
Host (localhost): localhost
Porta (5432): 5432
Nome do banco: mdmweb
Usuário: postgres
Senha: ****

🔍 Testando conexão...
✅ Conexão estabelecida com sucesso!

🔍 Verificando tabelas existentes...
⚠️ Encontradas tabelas do MDM existentes:
   - devices
   - organizations

Deseja recriar as tabelas? (y/N): y

🗑️ Removendo tabelas existentes...
   ✅ Tabela audit_logs removida
   ✅ Tabela devices removida
   ...

📊 Executando schema do MDM...
✅ Schema executado com sucesso

📝 Inserindo dados iniciais...
   ✅ Organização padrão criada
   ✅ Usuário admin padrão criado
   📧 Email: admin@mdm.local
   🔑 Senha: admin123
   ✅ Configurações padrão inseridas

📄 Criando arquivo de configuração...
✅ Arquivo .env criado

🔄 Migrando dados dos arquivos JSON...
   ✅ 5 dispositivos migrados
   ✅ 3 mensagens de suporte migradas

🎉 Configuração concluída com sucesso!

📋 Próximos passos:
   1. Reinicie o servidor WebSocket: npm run websocket
   2. Teste a conectividade dos dispositivos
   3. Verifique se os dados estão sendo salvos no PostgreSQL
```

## 🔧 Configuração Manual

Se preferir configurar manualmente:

### 1. Criar arquivo `.env`
```bash
cp env.example .env
```

### 2. Editar `.env` com suas configurações
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mdmweb
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_SSL=false
```

### 3. Executar migração
```bash
npm run migrate
```

## 🔍 Verificação no pgAdmin

Após a configuração, você pode verificar no pgAdmin:

### 1. Conectar ao seu banco
- Abra o pgAdmin
- Conecte ao seu servidor PostgreSQL
- Expanda seu banco de dados

### 2. Verificar tabelas criadas
```sql
-- Listar todas as tabelas do MDM
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'organizations', 'users', 'devices', 'device_groups',
    'device_group_memberships', 'app_policies', 'device_restrictions',
    'installed_apps', 'device_locations', 'support_messages',
    'audit_logs', 'system_configs'
);
```

### 3. Verificar dados migrados
```sql
-- Contar dispositivos
SELECT COUNT(*) as total_devices FROM devices;

-- Ver organização padrão
SELECT * FROM organizations WHERE slug = 'default';

-- Ver usuário admin
SELECT email, first_name, last_name, role FROM users WHERE role = 'admin';
```

## 🚨 Solução de Problemas

### Erro: "relation does not exist"
```bash
# Re-executar schema
npm run configure-existing
# Escolher "y" para recriar tabelas
```

### Erro: "permission denied"
```bash
# Verificar permissões do usuário
psql -h localhost -U seu_usuario -d seu_banco
GRANT ALL PRIVILEGES ON DATABASE seu_banco TO seu_usuario;
```

### Erro: "connection refused"
```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql  # Linux
brew services list | grep postgresql  # macOS

# Verificar porta
netstat -tlnp | grep 5432
```

## 📊 Estrutura das Tabelas

Após a configuração, seu banco terá:

### Tabelas Principais
- `organizations` - Organizações (multi-tenancy)
- `users` - Usuários do sistema
- `devices` - Dispositivos Android
- `device_groups` - Grupos de dispositivos

### Tabelas de Relacionamento
- `device_group_memberships` - Dispositivos em grupos
- `device_restrictions` - Restrições por dispositivo
- `app_policies` - Políticas de aplicativos

### Tabelas de Dados
- `installed_apps` - Aplicativos instalados
- `device_locations` - Histórico de localização
- `support_messages` - Mensagens de suporte

### Tabelas de Sistema
- `audit_logs` - Log de auditoria
- `system_configs` - Configurações do sistema

## 🎯 Próximos Passos

Após a configuração bem-sucedida:

1. **Reiniciar servidor WebSocket**
   ```bash
   npm run websocket
   ```

2. **Testar conectividade**
   - Conectar dispositivos Android
   - Verificar se dados aparecem no pgAdmin

3. **Configurar autenticação**
   - Implementar login no frontend
   - Configurar JWT tokens

4. **Backup automático**
   - Configurar backup do PostgreSQL
   - Testar restauração

---

**Status**: ✅ **Configuração para banco existente implementada**
