@echo off
REM ============================================
REM SCRIPT DE DESENVOLVIMENTO PARA WINDOWS
REM ============================================

echo.
echo ========================================
echo   MDM OWNER - AMBIENTE DE DESENVOLVIMENTO
echo ========================================
echo.

REM Verificar se está no diretório correto
if not exist "mdm-frontend" (
    echo [ERRO] Diretorio mdm-frontend nao encontrado!
    echo Execute este script da raiz do projeto.
    pause
    exit /b 1
)

echo [1/4] Configurando ambiente de desenvolvimento...
cd mdm-frontend

REM Preparar arquivos de ambiente para desenvolvimento
if not exist ".env.development" (
    echo [INFO] Criando arquivo .env.development a partir do template...
    copy env.development.example .env.development >nul
    echo [INFO] Edite .env.development para ajustar conexao com o banco de dados local.
)

if not exist ".env" (
    echo [INFO] Criando arquivo .env padrao a partir do template...
    copy env.example .env >nul
)

echo [2/4] Instalando dependencias...
call npm install

echo [3/4] Verificando banco de dados...
REM Você pode descomentar a linha abaixo se precisar recriar o BD
REM call npm run db:setup

echo [4/4] Iniciando servidores de desenvolvimento...
echo.
echo ========================================
echo   SERVIDORES INICIANDO:
echo   - WebSocket: http://localhost:3002
echo   - Frontend:  http://localhost:3000
echo ========================================
echo.
echo Pressione Ctrl+C para parar os servidores
echo.

REM Iniciar ambos os servidores
call npm run dev:all

pause

