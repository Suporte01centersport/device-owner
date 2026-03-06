-- ============================================================
-- RODE NO pgAdmin (Query Tool conectado em postgres)
-- ============================================================
-- 1. Conecte no PostgreSQL 18 (com sua senha atual)
-- 2. Clique com botão direito em "postgres" -> Query Tool
-- 3. Execute os comandos abaixo
-- ============================================================

-- Criar banco mdmweb
CREATE DATABASE mdmweb;

-- Definir senha que o app Node vai usar (já está no .env.development)
ALTER USER postgres WITH PASSWORD 'postgres123';
