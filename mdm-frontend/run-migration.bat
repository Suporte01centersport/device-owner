@echo off
echo 🚀 Iniciando migração da tabela app_access_history...

REM Navegar para o diretório do projeto
cd /d "%~dp0"

REM Verificar se o Node.js está instalado
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js não encontrado. Instale o Node.js primeiro.
    pause
    exit /b 1
)

REM Instalar dependências se necessário
if not exist "node_modules" (
    echo 📦 Instalando dependências...
    npm install
)

REM Executar migração
echo 🔧 Executando migração...
node server/database/migrations/run-migration.js

if errorlevel 1 (
    echo ❌ Falha na migração!
    pause
    exit /b 1
) else (
    echo ✅ Migração concluída com sucesso!
    echo.
    echo 📋 Para testar:
    echo 1. Acesse um app no dispositivo Android
    echo 2. Verifique se os dados aparecem no frontend
    echo 3. Clique em "Acessados" para ver o histórico
    echo.
    pause
)
