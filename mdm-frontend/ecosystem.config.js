/**
 * Configuração PM2 para o MDM Center
 * Gerencia o processo do WebSocket server.
 *
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 stop mdm-center
 *   pm2 restart mdm-center
 *   pm2 logs mdm-center
 */

module.exports = {
  apps: [
    {
      name: 'mdm-center',
      script: 'server/websocket.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      log_file: './server/logs/mdm-center.log',
      error_file: './server/logs/mdm-center-error.log',
      out_file: './server/logs/mdm-center-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
