# Configuração do Banco de Dados

## Erro: "autenticação falhou para mdm_user"

### Opção 1: Usar postgres (mais rápido)

Edite `.env.development` e altere:

```env
DB_USER=postgres
DB_PASSWORD=SUA_SENHA_DO_POSTGRES
DB_NAME=mdm_owner_dev
```

Depois execute:

```bash
npm run migrate
npm run dev:all
```

### Opção 2: Criar usuário mdm_user

1. No **pgAdmin** ou **psql**, execute:

   ```bash
   psql -U postgres -f server/database/setup-db-user.sql
   ```

1. Ou use o script (com senha do postgres):

   ```bash
   set PG_POSTGRES_PASSWORD=sua_senha
   npm run db:setup-user
   npm run migrate
   ```

### Opção 3: Fluxo completo

```bash
npm run db:setup
npm run dev:all
```

(Requer senha do postgres para criar mdm_user)
