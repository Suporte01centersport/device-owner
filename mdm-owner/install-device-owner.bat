@echo off
echo ================================================
echo    INSTALACAO MDM LAUNCHER COMO DEVICE OWNER
echo ================================================
echo.

REM Verificar se ADB está disponível
adb version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: ADB não encontrado! Instale Android SDK Platform Tools.
    pause
    exit /b 1
)

REM Verificar se há dispositivos conectados
echo Verificando dispositivos conectados...
adb devices
echo.

REM Verificar se há dispositivo ou emulador conectado
for /f "tokens=2" %%i in ('adb devices ^| find "device"') do (
    if "%%i"=="device" (
        set DEVICE_CONNECTED=1
        goto :device_found
    )
)

if not defined DEVICE_CONNECTED (
    echo ERRO: Nenhum dispositivo/emulador conectado!
    echo.
    echo Certifique-se de que:
    echo - Emulador está rodando OU dispositivo está conectado via USB
    echo - USB Debugging está habilitado (para dispositivo físico)
    echo - O dispositivo está autorizado para depuração
    echo.
    echo Para emulador: inicie o emulador Android
    echo Para dispositivo: conecte via USB e autorize depuração
    echo.
    pause
    exit /b 1
)

:device_found
echo Dispositivo encontrado! Continuando...
echo.

REM Verificar se o dispositivo está em modo de fábrica (sem contas configuradas)
echo Verificando se o dispositivo está em modo de fábrica...
adb shell "pm list users" | find "UserInfo{0:" >nul
if %errorlevel% neq 0 (
    echo AVISO: Dispositivo pode ter contas configuradas.
    echo Device Owner geralmente só funciona em dispositivos resetados.
    echo.
    echo Para emulador: reinicie o emulador sem configurar contas Google
    echo Para dispositivo: faça factory reset
    echo.
    set /p continue="Continuar mesmo assim? (S/N): "
    if /i not "!continue!"=="S" (
        echo Operacao cancelada.
        pause
        exit /b 0
    )
    echo.
)

REM Desinstalar versão anterior se existir
echo Desinstalando versão anterior (se existir)...
adb uninstall com.mdm.launcher 2>nul
echo.

REM Instalar o APK
echo Instalando MDM Launcher...
adb install -r app\build\outputs\apk\debug\app-debug.apk
if %errorlevel% neq 0 (
    echo ERRO: Falha na instalação do APK!
    pause
    exit /b 1
)
echo APK instalado com sucesso!
echo.

REM Verificar se Device Owner já está configurado
echo Verificando se Device Owner já está configurado...
adb shell "dpm list-owners" | find "com.mdm.launcher" >nul
if %errorlevel% equ 0 (
    echo Device Owner já está configurado! Continuando...
    echo.
) else (
    REM Configurar como Device Owner
    echo Configurando como Device Owner...
    echo Comando: dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
    adb shell "dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver" 2>&1 | find "already set" >nul
    if %errorlevel% equ 0 (
        echo Device Owner já estava configurado - OK!
    ) else (
        if %errorlevel% neq 0 (
            echo ERRO: Falha ao configurar Device Owner!
            echo.
            echo Possíveis causas:
            echo - Dispositivo não está em modo de fábrica
            echo - Já existe outro Device Owner
            echo - Dispositivo não suporta Device Owner
            echo.
            echo Para resolver:
            echo 1. Faça factory reset do dispositivo
            echo 2. NÃO configure nenhuma conta Google
            echo 3. Execute este script novamente
            echo.
            pause
            exit /b 1
        )
    )
)

echo Device Owner configurado com sucesso!
echo.

REM Verificar se foi configurado corretamente
echo Verificando configuração...
adb shell "dpm list-owners"
echo.

REM Definir como launcher padrão
echo Configurando como launcher padrão...
adb shell "cmd package set-home-activity com.mdm.launcher/.MainActivity"
echo.

REM Verificar launcher padrão
echo Verificando launcher padrão...
adb shell "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME"
echo.

echo ================================================
echo    INSTALACAO CONCLUIDA COM SUCESSO!
echo ================================================
echo.
echo O MDM Launcher foi configurado como:
echo - Device Owner (controle total do dispositivo)
echo - Launcher padrão
echo.
echo Agora você pode:
echo - Bloquear/desbloquear o dispositivo
echo - Controlar apps instalados
echo - Configurar restrições
echo - Gerenciar o dispositivo remotamente
echo.
echo Para testar, reinicie o dispositivo e o MDM Launcher
echo deve aparecer automaticamente como tela inicial.
echo.
pause
