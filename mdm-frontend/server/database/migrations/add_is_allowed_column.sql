-- Adicionar campo is_allowed na tabela app_access_history
ALTER TABLE app_access_history 
ADD COLUMN is_allowed BOOLEAN DEFAULT true;

-- Atualizar registros existentes para true (assumindo que eram permitidos)
UPDATE app_access_history 
SET is_allowed = true 
WHERE is_allowed IS NULL;

-- Criar índice para melhor performance
CREATE INDEX idx_app_access_history_is_allowed ON app_access_history(is_allowed);
