CREATE TABLE IF NOT EXISTS config_backups (
  id SERIAL PRIMARY KEY,
  backup_type VARCHAR(50) NOT NULL, -- 'full', 'devices', 'users', 'policies', 'restrictions'
  data JSONB NOT NULL,
  description VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);
