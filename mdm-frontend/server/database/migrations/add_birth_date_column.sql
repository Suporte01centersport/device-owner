-- Migration: Trocar birth_year (INTEGER) por birth_date (DATE) na tabela device_users
-- Também garante que created_at e updated_at existam

ALTER TABLE device_users ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Migrar dados existentes de birth_year para birth_date (1 de janeiro do ano)
UPDATE device_users
  SET birth_date = make_date(birth_year, 1, 1)
  WHERE birth_year IS NOT NULL AND birth_date IS NULL;

-- Manter birth_year por compatibilidade (não remover)
COMMENT ON COLUMN device_users.birth_date IS 'Data de nascimento completa do usuário';
