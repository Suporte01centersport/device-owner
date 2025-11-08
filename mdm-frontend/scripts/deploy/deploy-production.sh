#!/bin/bash
# ============================================
# SCRIPT DE DEPLOY PARA SERVIDOR UBUNTU
# ============================================

set -e  # Parar em caso de erro

echo "🚀 Iniciando deploy de produção..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se está no servidor Ubuntu
if [ ! -f /etc/lsb-release ]; then
    echo -e "${RED}❌ Este script deve ser executado no servidor Ubuntu!${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Atualizando código do repositório...${NC}"
git pull origin main

echo -e "${YELLOW}🔧 Configurando ambiente de produção...${NC}"
cd mdm-frontend

# Garantir arquivos de ambiente baseados nos templates
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}📝 Criando arquivo .env.production a partir do template...${NC}"
    cp env.production.example .env.production
    echo -e "${RED}⚠️  ATENÇÃO: Edite o arquivo .env.production e altere as senhas!${NC}"
    echo -e "${RED}   DB_PASSWORD, ADMIN_PASSWORD e JWT_SECRET${NC}"
    read -p "Pressione ENTER após editar as senhas..."
fi

if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Criando arquivo .env base a partir do template...${NC}"
    cp env.example .env
fi

echo -e "${YELLOW}📚 Instalando dependências...${NC}"
npm ci --omit=dev

echo -e "${YELLOW}🏗️  Buildando aplicação Next.js...${NC}"
npm run build

echo -e "${YELLOW}🗄️  Configurando banco de dados...${NC}"
npm run db:setup

echo -e "${YELLOW}🔄 Parando serviços antigos...${NC}"
pm2 delete mdm-websocket 2>/dev/null || true
pm2 delete mdm-frontend 2>/dev/null || true
pm2 delete mdm-discovery 2>/dev/null || true

echo -e "${YELLOW}🚀 Iniciando serviços com PM2...${NC}"
pm2 start ecosystem.config.js

# Salvar configuração PM2
pm2 save

# Configurar PM2 para iniciar no boot
pm2 startup

echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo -e "${GREEN}📊 Serviços rodando:${NC}"
pm2 list

echo -e "${YELLOW}📝 Logs disponíveis em:${NC}"
echo -e "   WebSocket: pm2 logs mdm-websocket"
echo -e "   Frontend:  pm2 logs mdm-frontend"

echo -e "${GREEN}🌐 Acesse: http://SEU_IP:3000${NC}"

