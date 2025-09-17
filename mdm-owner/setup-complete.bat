@echo off
echo ================================================
echo    SETUP COMPLETO MDM LAUNCHER
echo ================================================
echo.
echo Este script vai configurar o MDM Launcher como
echo Device Owner com controle total do dispositivo.
echo.
echo PROCESSO:
echo 1. Compilar o APK
echo 2. Preparar o dispositivo
echo 3. Instalar como Device Owner
echo 4. Configurar como launcher padrão
echo 5. Verificar configuração
echo.
set /p confirm="Continuar? (S/N): "
if /i not "%confirm%"=="S" (
    echo Operacao cancelada.
    pause
    exit /b 0
)

echo.
echo ================================================
echo    PASSO 1: COMPILANDO APK
echo ================================================
echo.
echo Compilando o MDM Launcher...
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo ERRO: Falha na compilação!
    pause
    exit /b 1
)
echo APK compilado com sucesso!
echo.

echo ================================================
echo    PASSO 2: PREPARANDO DISPOSITIVO
echo ================================================
echo.
echo Preparando dispositivo para Device Owner...
call prepare-device-owner.bat
if %errorlevel% neq 0 (
    echo ERRO: Falha na preparação!
    pause
    exit /b 1
)
echo.

echo ================================================
echo    PASSO 3: INSTALANDO COMO DEVICE OWNER
echo ================================================
echo.
echo Instalando MDM Launcher como Device Owner...
call install-device-owner.bat
if %errorlevel% neq 0 (
    echo ERRO: Falha na instalação!
    pause
    exit /b 1
)
echo.

echo ================================================
echo    PASSO 4: VERIFICANDO CONFIGURAÇÃO
echo ================================================
echo.
echo Verificando configuração final...
call check-device-owner.bat
echo.

echo ================================================
echo    SETUP CONCLUIDO COM SUCESSO!
echo ================================================
echo.
echo O MDM Launcher foi configurado como Device Owner!
echo.
echo FUNCIONALIDADES ATIVAS:
echo - Controle total do dispositivo
echo - Bloqueio/desbloqueio avançado
echo - Gerenciamento de apps
echo - Configuração de restrições
echo - Launcher padrão
echo.
echo Para testar:
echo 1. Reinicie o dispositivo
echo 2. O MDM Launcher deve aparecer automaticamente
echo 3. Teste o bloqueio/desbloqueio via web
echo.
pause
