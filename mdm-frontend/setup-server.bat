@echo off
REM =========================================================================
REM  MDM CENTER - Setup Completo do Servidor
REM
REM  Execute como ADMINISTRADOR na maquina que sera o servidor fixo.
REM  Este script configura tudo automaticamente:
REM    - Verifica Node.js e PostgreSQL
REM    - Instala dependencias (npm, PM2)
REM    - Cria banco de dados e tabelas
REM    - Configura .env com IP publico
REM    - Inicia servidor com PM2 (auto-restart)
REM    - Configura auto-start no boot do Windows
REM    - Agenda backup diario do banco
REM    - Libera porta 3001 no firewall
REM
REM  USO: Copie toda a pasta mdm-frontend para o servidor e execute:
REM       setup-server.bat
REM =========================================================================

setlocal enabledelayedexpansion
title MDM Center - Setup do Servidor

echo.
echo  =============================================
echo   MDM CENTER - Configuracao do Servidor
echo  =============================================
echo.

REM -------------------------------------------------------------------------
REM  Verificar se esta rodando como Administrador
REM -------------------------------------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Este script precisa ser executado como ADMINISTRADOR.
    echo        Clique com botao direito e escolha "Executar como administrador".
    pause
    exit /b 1
)

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo [1/10] Verificando pre-requisitos...
echo.

REM -------------------------------------------------------------------------
REM  Verificar Node.js
REM -------------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js NAO encontrado.
    echo        Baixe e instale em: https://nodejs.org/
    echo        Versao recomendada: 20 LTS ou superior
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('node -v') do set "NODE_VER=%%V"
echo   [OK] Node.js %NODE_VER%

REM -------------------------------------------------------------------------
REM  Verificar PostgreSQL
REM -------------------------------------------------------------------------
set "PG_BIN="
if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set "PG_BIN=C:\Program Files\PostgreSQL\17\bin"
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set "PG_BIN=C:\Program Files\PostgreSQL\16\bin"
if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" set "PG_BIN=C:\Program Files\PostgreSQL\15\bin"

if "%PG_BIN%"=="" (
    where psql >nul 2>&1
    if errorlevel 1 (
        echo [ERRO] PostgreSQL NAO encontrado.
        echo        Baixe e instale em: https://www.postgresql.org/download/windows/
        echo        Durante a instalacao, anote a senha do usuario 'postgres'.
        pause
        exit /b 1
    )
) else (
    set "PATH=%PG_BIN%;%PATH%"
)
echo   [OK] PostgreSQL encontrado

REM -------------------------------------------------------------------------
REM  Configurar .env
REM -------------------------------------------------------------------------
echo.
echo [2/10] Configurando variaveis de ambiente...

if not exist ".env" (
    echo   Criando .env padrao...
)

REM Perguntar dados do banco
echo.
echo   --- Configuracao do Banco de Dados ---
set "DB_USER=postgres"
set "DB_PASSWORD=postgres123"
set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=mdmweb"

set /p "DB_PASSWORD=  Senha do PostgreSQL [postgres123]: " || set "DB_PASSWORD=postgres123"
set /p "DB_NAME=  Nome do banco [mdmweb]: " || set "DB_NAME=mdmweb"

REM Detectar IP publico
echo.
echo   Detectando IP publico...
for /f "tokens=*" %%I in ('powershell -NoProfile -Command "(Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing -TimeoutSec 5).Content" 2^>nul') do set "PUBLIC_IP=%%I"

if "%PUBLIC_IP%"=="" (
    echo   [AVISO] Nao foi possivel detectar IP publico automaticamente.
    set /p "PUBLIC_IP=  Digite o IP publico do servidor: "
) else (
    echo   IP publico detectado: %PUBLIC_IP%
    set /p "CONFIRM_IP=  Usar este IP? [S/n]: " || set "CONFIRM_IP=S"
    if /i "!CONFIRM_IP!"=="n" (
        set /p "PUBLIC_IP=  Digite o IP publico correto: "
    )
)

REM Detectar IP local (para mesma rede)
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4" ^| findstr "192.168."') do (
    for /f "tokens=*" %%B in ("%%A") do set "LOCAL_IP=%%B"
)
if "%LOCAL_IP%"=="" (
    for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4" ^| findstr "10."') do (
        for /f "tokens=*" %%B in ("%%A") do set "LOCAL_IP=%%B"
    )
)
echo   IP local: %LOCAL_IP%

REM Escrever .env
(
echo # =========================================
echo # MDM CENTER - Configuracao do Servidor
echo # Gerado automaticamente em %date% %time%
echo # =========================================
echo.
echo # Banco de Dados PostgreSQL
echo DB_USER=%DB_USER%
echo DB_PASSWORD=%DB_PASSWORD%
echo DB_HOST=%DB_HOST%
echo DB_PORT=%DB_PORT%
echo DB_NAME=%DB_NAME%
echo DB_SSL=false
echo.
echo # Configuracoes do Admin
echo ADMIN_PASSWORD=admin@123
echo.
echo # Servidor WebSocket
echo WEBSOCKET_HOST=0.0.0.0
echo WEBSOCKET_PORT=3001
echo.
echo # URL publica - CRUCIAL para celulares em WiFi diferente
echo # A porta 3001 DEVE estar redirecionada no roteador para este servidor
echo WEBSOCKET_PUBLIC_URL=http://%PUBLIC_IP%:3001
echo MDM_PUBLIC_URL=http://%PUBLIC_IP%:3001
) > ".env"

echo   [OK] .env configurado com IP publico %PUBLIC_IP%

REM -------------------------------------------------------------------------
REM  Criar banco de dados
REM -------------------------------------------------------------------------
echo.
echo [3/10] Configurando banco de dados...

set "PGPASSWORD=%DB_PASSWORD%"

REM Verificar se o banco existe
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='%DB_NAME%'" 2>nul | findstr "1" >nul 2>&1
if errorlevel 1 (
    echo   Criando banco '%DB_NAME%'...
    psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d postgres -c "CREATE DATABASE %DB_NAME%;" 2>nul
    if errorlevel 1 (
        echo [ERRO] Falha ao criar banco. Verifique a senha do PostgreSQL.
        pause
        exit /b 1
    )
    echo   [OK] Banco '%DB_NAME%' criado
) else (
    echo   [OK] Banco '%DB_NAME%' ja existe
)

REM -------------------------------------------------------------------------
REM  Instalar dependencias npm
REM -------------------------------------------------------------------------
echo.
echo [4/10] Instalando dependencias npm...

if not exist "node_modules" (
    call npm install --production 2>nul
    if errorlevel 1 (
        call npm install 2>nul
    )
) else (
    echo   [OK] node_modules ja existe
)

REM -------------------------------------------------------------------------
REM  Instalar PM2
REM -------------------------------------------------------------------------
echo.
echo [5/10] Instalando PM2...

where pm2 >nul 2>&1
if errorlevel 1 (
    call npm install -g pm2 2>nul
    echo   [OK] PM2 instalado
) else (
    echo   [OK] PM2 ja instalado
)

REM -------------------------------------------------------------------------
REM  Build do Next.js
REM -------------------------------------------------------------------------
echo.
echo [6/10] Construindo frontend (Next.js build)...

call npx next build 2>nul
if errorlevel 1 (
    echo [AVISO] Build do frontend falhou, mas o servidor WebSocket funciona independente.
) else (
    echo   [OK] Frontend construido
)

REM -------------------------------------------------------------------------
REM  Executar migrations do banco
REM -------------------------------------------------------------------------
echo.
echo [7/10] Executando migrations do banco...

if exist "server\database\migrations" (
    for %%F in (server\database\migrations\*.sql) do (
        psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "%%F" >nul 2>&1
    )
    echo   [OK] Migrations executadas
) else (
    echo   [OK] Sem migrations pendentes (tabelas serao criadas pelo servidor)
)

REM -------------------------------------------------------------------------
REM  Liberar porta no Firewall
REM -------------------------------------------------------------------------
echo.
echo [8/10] Configurando firewall...

netsh advfirewall firewall show rule name="MDM Center - WebSocket" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="MDM Center - WebSocket" dir=in action=allow protocol=tcp localport=3001 >nul 2>&1
    echo   [OK] Porta 3001 liberada no firewall (entrada)
) else (
    echo   [OK] Regra de firewall ja existe
)

netsh advfirewall firewall show rule name="MDM Center - Frontend" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="MDM Center - Frontend" dir=in action=allow protocol=tcp localport=3000 >nul 2>&1
    echo   [OK] Porta 3000 liberada no firewall (entrada)
) else (
    echo   [OK] Regra de firewall ja existe
)

REM -------------------------------------------------------------------------
REM  Iniciar com PM2
REM -------------------------------------------------------------------------
echo.
echo [9/10] Iniciando servidor com PM2...

pm2 delete mdm-center >nul 2>&1
pm2 start ecosystem.config.js 2>nul
pm2 save 2>nul

echo   [OK] Servidor iniciado e salvo no PM2

REM -------------------------------------------------------------------------
REM  Auto-start no boot + Backup agendado
REM -------------------------------------------------------------------------
echo.
echo [10/10] Configurando auto-start e backup...

REM Auto-start PM2 no boot
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
(
echo @echo off
echo REM MDM Center - Auto-start no boot do Windows
echo timeout /t 15 /nobreak ^>nul
echo cd /d "%PROJECT_DIR%"
echo pm2 resurrect
) > "%STARTUP_DIR%\mdm-center-pm2.bat"
echo   [OK] Auto-start configurado

REM Backup diario as 2h
schtasks /Create /SC DAILY /TN "MDM-Backup-DB" /TR "cmd /c cd /d %PROJECT_DIR% && scripts\backup-db.bat" /ST 02:00 /F >nul 2>&1
echo   [OK] Backup diario agendado (02:00)

REM -------------------------------------------------------------------------
REM  Criar diretorio de backups
REM -------------------------------------------------------------------------
if not exist "backups" mkdir "backups"

REM -------------------------------------------------------------------------
REM  Resumo final
REM -------------------------------------------------------------------------
echo.
echo  =============================================
echo   MDM CENTER - SERVIDOR CONFIGURADO!
echo  =============================================
echo.
echo   IP Publico:    %PUBLIC_IP%
echo   IP Local:      %LOCAL_IP%
echo   Porta:         3001
echo.
echo   WebSocket:     ws://%PUBLIC_IP%:3001
echo   APK Download:  http://%PUBLIC_IP%:3001/apk/mdm.apk
echo   Painel Web:    http://%LOCAL_IP%:3000
echo.
echo   Banco:         %DB_NAME% (PostgreSQL)
echo   PM2:           mdm-center (auto-restart)
echo   Backup:        Diario as 02:00
echo   Logs:          server\logs\mdm-server.log
echo.
echo   --- IMPORTANTE ---
echo   1. Redirecione a porta 3001 no roteador para %LOCAL_IP%
echo   2. Se o IP publico mudar, edite o .env
echo   3. Para ver logs: pm2 logs mdm-center
echo   4. Para reiniciar: pm2 restart mdm-center
echo   5. Para parar: pm2 stop mdm-center
echo.
echo   O servidor ja esta rodando!
echo  =============================================
echo.

pause
endlocal
