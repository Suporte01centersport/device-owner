-- ============================================================
-- CONFIGURAR BANCO PARA MDM (erro "autenticação falhou mdm_user")
-- ============================================================
-- Execute no psql como postgres: psql -U postgres -f setup-db-user.sql
-- Ou use pgAdmin e execute os comandos abaixo.

-- 1. Criar usuário (senha = DB_PASSWORD do .env.development)
CREATE USER mdm_user WITH PASSWORD 'mdm_dev_password';

-- 2. Criar banco (se não existir)
CREATE DATABASE mdm_owner_dev OWNER mdm_user;

-- 3. Alternativa: usar usuário postgres no .env.development:
--    DB_USER=postgres
--    DB_PASSWORD=sua_senha_do_postgres
--    DB_NAME=mdm_owner_dev
