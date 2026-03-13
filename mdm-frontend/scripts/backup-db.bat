@echo off
REM =========================================================================
REM backup-db.bat — Backup do banco PostgreSQL do MDM Center (Windows)
REM
REM Le credenciais do arquivo .env (DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME)
REM
REM Uso:
REM   scripts\backup-db.bat              (execucao manual)
REM   Agendar no Task Scheduler do Windows para execucao automatica
REM
REM Mantem apenas os 7 backups mais recentes.
REM =========================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
set "BACKUP_DIR=%PROJECT_DIR%\backups"
set "ENV_FILE=%PROJECT_DIR%\.env"
set "MAX_BACKUPS=7"

REM Gera timestamp no formato YYYYMMDD_HHMMSS
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TIMESTAMP=%%I"

REM -------------------------------------------------------------------------
REM Leitura do .env
REM -------------------------------------------------------------------------
if not exist "%ENV_FILE%" (
    echo [%date% %time%] ERRO: Arquivo .env nao encontrado em %ENV_FILE%
    exit /b 1
)

REM Valores padrao
set "DB_USER=postgres"
set "DB_PASSWORD="
set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_NAME=mdmweb"

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set "KEY=%%A"
    set "VAL=%%B"
    if "!KEY:~0,1!" neq "#" (
        set "VAL=!VAL:"=!"
        set "VAL=!VAL:'=!"
        if /i "!KEY!"=="DB_USER"     set "DB_USER=!VAL!"
        if /i "!KEY!"=="DB_PASSWORD" set "DB_PASSWORD=!VAL!"
        if /i "!KEY!"=="DB_HOST"     set "DB_HOST=!VAL!"
        if /i "!KEY!"=="DB_PORT"     set "DB_PORT=!VAL!"
        if /i "!KEY!"=="DB_NAME"     set "DB_NAME=!VAL!"
    )
)

REM -------------------------------------------------------------------------
REM Validacao
REM -------------------------------------------------------------------------
if "%DB_NAME%"=="" (
    echo [%date% %time%] ERRO: Nome do banco de dados nao definido. Verifique o .env.
    exit /b 1
)

where pg_dump >nul 2>&1
if errorlevel 1 (
    REM Tentar encontrar pg_dump automaticamente
    if exist "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" (
        set "PATH=C:\Program Files\PostgreSQL\18\bin;%PATH%"
    ) else if exist "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" (
        set "PATH=C:\Program Files\PostgreSQL\17\bin;%PATH%"
    ) else if exist "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" (
        set "PATH=C:\Program Files\PostgreSQL\16\bin;%PATH%"
    ) else if exist "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" (
        set "PATH=C:\Program Files\PostgreSQL\15\bin;%PATH%"
    ) else (
        echo [%date% %time%] ERRO: pg_dump nao encontrado no PATH.
        echo Adicione o diretorio bin do PostgreSQL ao PATH do sistema.
        exit /b 1
    )
)

REM -------------------------------------------------------------------------
REM Criacao do backup
REM -------------------------------------------------------------------------
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set "BACKUP_FILE=%BACKUP_DIR%\%DB_NAME%_%TIMESTAMP%.sql"

echo [%date% %time%] Iniciando backup do banco '%DB_NAME%' em %DB_HOST%:%DB_PORT% ...

set "PGPASSWORD=%DB_PASSWORD%"

pg_dump -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d "%DB_NAME%" --no-owner --no-acl --format=plain -f "%BACKUP_FILE%"

if errorlevel 1 (
    echo [%date% %time%] ERRO: Falha ao executar pg_dump.
    if exist "%BACKUP_FILE%" del "%BACKUP_FILE%"
    exit /b 1
)

for %%F in ("%BACKUP_FILE%") do set "FILESIZE=%%~zF"
echo [%date% %time%] Backup concluido com sucesso: %BACKUP_FILE% (%FILESIZE% bytes)

REM -------------------------------------------------------------------------
REM Limpeza de backups antigos (mantem os ultimos MAX_BACKUPS)
REM -------------------------------------------------------------------------
set "COUNT=0"
for /f %%F in ('dir /b /o-d "%BACKUP_DIR%\%DB_NAME%_*.sql" 2^>nul') do set /a COUNT+=1

if !COUNT! gtr %MAX_BACKUPS% (
    set "IDX=0"
    for /f %%F in ('dir /b /o-d "%BACKUP_DIR%\%DB_NAME%_*.sql" 2^>nul') do (
        set /a IDX+=1
        if !IDX! gtr %MAX_BACKUPS% (
            echo [%date% %time%] Removendo backup antigo: %%F
            del "%BACKUP_DIR%\%%F"
        )
    )
)

set "FINAL_COUNT=0"
for /f %%F in ('dir /b "%BACKUP_DIR%\%DB_NAME%_*.sql" 2^>nul') do set /a FINAL_COUNT+=1
echo [%date% %time%] Backup finalizado. Total de backups armazenados: !FINAL_COUNT!

endlocal
