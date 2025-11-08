/**
 * Configuração PM2 para o MDM Owner
 * Gerencia os processos do Next.js, WebSocket e Discovery Server.
 */

module.exports = {
  apps: [
    {
      name: 'mdm-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '512M'
    },
    {
      name: 'mdm-websocket',
      script: 'server/websocket.js',
      cwd: __dirname,
      node_args: '-r dotenv/config',
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: '.env.production'
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '256M'
    },
    {
      name: 'mdm-discovery',
      script: 'server/discovery-server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: '.env.production'
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '128M'
    }
  ]
};

