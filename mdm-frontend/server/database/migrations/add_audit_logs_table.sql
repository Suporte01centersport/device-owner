CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL, -- 'device_added', 'device_deleted', 'user_assigned', 'restriction_changed', 'app_updated', 'device_locked', 'device_wiped', 'password_changed', 'config_backup', 'wifi_configured', etc.
  target_type VARCHAR(50), -- 'device', 'user', 'group', 'system'
  target_id VARCHAR(255),
  target_name VARCHAR(255),
  details JSONB DEFAULT '{}',
  user_agent VARCHAR(500),
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
