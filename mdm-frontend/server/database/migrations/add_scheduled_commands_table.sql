CREATE TABLE IF NOT EXISTS scheduled_commands (
  id SERIAL PRIMARY KEY,
  command_type VARCHAR(100) NOT NULL, -- 'reboot', 'lock', 'update_app', 'clear_cache', 'send_message'
  target_type VARCHAR(50) DEFAULT 'device', -- 'device', 'group', 'all'
  target_id VARCHAR(255), -- device_id or group_id or null for all
  target_name VARCHAR(255),
  parameters JSONB DEFAULT '{}',
  schedule_type VARCHAR(20) NOT NULL, -- 'once', 'daily', 'weekly'
  scheduled_time TIME, -- for daily/weekly
  scheduled_date TIMESTAMP, -- for once
  day_of_week INTEGER, -- 0-6 for weekly
  is_active BOOLEAN DEFAULT true,
  last_executed_at TIMESTAMP,
  next_execution_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_commands_active ON scheduled_commands(is_active);
CREATE INDEX IF NOT EXISTS idx_scheduled_commands_next ON scheduled_commands(next_execution_at);
