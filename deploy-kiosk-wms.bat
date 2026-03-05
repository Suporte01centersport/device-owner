@echo off
chcp 65001 >nul
REM ============================================================
REM  DEPLOY KIOSK - App WMS Center Sport + Lanterna/Bluetooth/WiFi
REM ============================================================
REM  Instala o app e configura o celular para abrir APENAS:
REM  - O app WMS (com.centersporti.wmsmobile)
REM  - Lanterna (quick settings)
REM  - Bluetooth (configurações)
REM  - WiFi (configurações)
REM ============================================================

set APK_PATH=%~dp0
set APK_FILE=application-5e85c3a7-b5f7-4ae3-aaa8-d20a4d88af3f-1 (2).apk

echo.
echo ========================================
echo   DEPLOY KIOSK - WMS Center Sport
echo ========================================
echo.

REM Verificar se o APK existe na pasta Downloads
if exist "%USERPROFILE%\Downloads\%APK_FILE%" (
    set APK_FULL=%USERPROFILE%\Downloads\%APK_FILE%
) else if exist "%APK_PATH%%APK_FILE%" (
    set APK_FULL=%APK_PATH%%APK_FILE%
) else (
    echo [ERRO] APK nao encontrado!
    echo Procure em: %USERPROFILE%\Downloads\
    echo Ou coloque o APK na pasta do projeto.
    pause
    exit /b 1
)

echo [1/4] Verificando dispositivo conectado...
adb devices
adb devices | findstr "device$" >nul
if %errorlevel% neq 0 (
    echo [ERRO] Nenhum dispositivo conectado! Conecte o celular via USB.
    pause
    exit /b 1
)
echo OK: Dispositivo detectado
echo.

echo [2/4] Instalando APK no celular...
adb install -r "%APK_FULL%"
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar APK
    pause
    exit /b 1
)
echo OK: APK instalado
echo.

echo [3/4] Aguardando dispositivo conectar ao servidor MDM...
echo     Certifique-se que o servidor esta rodando (npm run dev:all)
echo     e que o celular esta na mesma rede Wi-Fi.
echo.
timeout /t 5 /nobreak >nul

echo [4/4] Aplicando modo kiosk (apenas app + lanterna + bluetooth + wifi)...
echo.

REM Aplicar permissões via API - "all" = todos os dispositivos conectados
node "%~dp0deploy-kiosk-wms.js"
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Nao foi possivel aplicar via API. Aplique manualmente:
    echo 1. Abra o painel MDM em http://localhost:3000
    echo 2. Clique no dispositivo
    echo 3. Em "Apps Permitidos", selecione apenas: com.centersporti.wmsmobile
    echo 4. Salve
) else (
    echo.
    echo OK: Modo kiosk aplicado!
)

echo.
echo ========================================
echo   DEPLOY CONCLUIDO!
echo ========================================
echo.
echo O celular agora so permite:
echo   - App WMS (com.centersporti.wmsmobile)
echo   - Lanterna (painel de notificacoes)
echo   - Bluetooth e WiFi (Configuracoes)
echo.
echo Para reverter: no painel MDM, adicione mais apps permitidos.
echo.
pause
