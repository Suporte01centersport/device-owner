# 🔧 Scripts Utilitários

Esta pasta contém scripts utilitários para desenvolvimento, manutenção e deploy do projeto.

## 📁 Estrutura

```
scripts/
├── db/              # Scripts de verificação e manutenção do banco de dados
└── deploy/          # Scripts de deploy e migração
```

## 🗄️ Scripts de Banco de Dados (`db/`)

### Verificação

- **`check-db.js`** - Verifica dados no banco de dados
  ```bash
  npm run db:check
  ```

- **`check-all-tables.js`** - Verifica se todas as tabelas necessárias existem
  ```bash
  npm run db:check-all
  ```

- **`check-alert-history-table.js`** - Verifica especificamente a tabela `group_alert_history`
  ```bash
  npm run db:check-alert-history
  ```

- **`check-tables.sql`** - Script SQL para verificação de tabelas
  ```bash
  psql -d seu_banco -f scripts/db/check-tables.sql
  ```

## 🚀 Scripts de Deploy (`deploy/`)

### Migração

- **`run-migration.sh`** - Executa migração do banco de dados no servidor Linux
  ```bash
  bash scripts/deploy/run-migration.sh
  ```

### Deploy de Produção

- **`deploy-production.sh`** - Script completo de deploy para servidor Ubuntu
  ```bash
  bash scripts/deploy/deploy-production.sh
  ```

## 📝 Scripts do Servidor

Scripts de manutenção do servidor estão em `server/scripts/`:

- `cleanup-orphaned-devices.js` - Limpa dispositivos órfãos
- `configure-existing-db.js` - Configura banco existente
- `delete-devices.js` - Deleta dispositivos específicos
- `fix-null-device-ids.js` - Corrige device_ids nulos
- `remove-duplicate-devices.js` - Remove dispositivos duplicados
- `validate-production.js` - Validação pré-produção

Execute via npm:
```bash
npm run cleanup-devices
npm run configure-existing
npm run remove-duplicates
npm run fix-null-device-ids
```

