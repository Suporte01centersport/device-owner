#!/bin/bash

# Script para executar migração do banco de dados
# Execute este script no servidor Linux

echo "🚀 Iniciando migração da tabela app_access_history..."

# Navegar para o diretório do projeto
cd ~/device-owner/mdm-frontend

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instalando..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Executar migração
echo "🔧 Executando migração..."
node server/database/migrations/run-migration.js

if [ $? -eq 0 ]; then
    echo "✅ Migração concluída com sucesso!"
    echo "🔄 Reiniciando o servidor WebSocket..."
    
    # Reiniciar o servidor se estiver rodando
    if pgrep -f "websocket.js" > /dev/null; then
        echo "🔄 Parando servidor atual..."
        pkill -f "websocket.js"
        sleep 2
    fi
    
    echo "🚀 Iniciando servidor..."
    nohup node server/websocket.js > websocket.log 2>&1 &
    echo "✅ Servidor reiniciado!"
    echo "📋 Logs disponíveis em: websocket.log"
else
    echo "❌ Falha na migração!"
    exit 1
fi
