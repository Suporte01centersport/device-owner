@echo off
cd /d "%~dp0"

echo ========================================
echo   MDM Center - Modo Desenvolvimento
echo ========================================
echo.

REM Verificar Node
where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado! Instale em https://nodejs.org
    pause
    exit /b 1
)

echo [0/3] Se der erro de banco, veja SETUP-BANCO.md
echo.
echo [1/3] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias
    pause
    exit /b 1
)

echo.
echo [2/3] Iniciando servidores...
echo.
echo ========================================
echo   ACESSE: http://localhost:3000
echo   WebSocket: ws://localhost:3001
echo ========================================
echo.
echo Aguarde o frontend compilar...
echo.

set DOTENV_CONFIG_PATH=.env.development
call npm run dev:all

pause
