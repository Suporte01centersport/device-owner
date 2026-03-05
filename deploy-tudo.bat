@echo off
chcp 65001 >nul
REM ============================================================
REM  DEPLOY COMPLETO - MDM + WMS + Modo Kiosk
REM ============================================================

set PROJECT_DIR=%~dp0
set MDM_APK=%PROJECT_DIR%mdm-owner\app\build\outputs\apk\debug\app-debug.apk
set WMS_APK=%USERPROFILE%\Downloads\application-5e85c3a7-b5f7-4ae3-aaa8-d20a4d88af3f-1 (2).apk

echo.
echo ========================================
echo   DEPLOY COMPLETO - MDM + WMS + Kiosk
echo ========================================
echo.

REM 1. Verificar dispositivo
echo [1/5] Verificando dispositivo...
adb devices | findstr "device$" >nul
if %errorlevel% neq 0 (
    echo [ERRO] Conecte o celular via USB e habilite depuracao!
    pause
    exit /b 1
)
echo OK: Dispositivo detectado
echo.

REM 2. Build MDM
echo [2/5] Compilando MDM Launcher...
cd /d "%PROJECT_DIR%mdm-owner"
call gradlew assembleDebug -q
if %errorlevel% neq 0 (
    echo [ERRO] Falha no build
    pause
    exit /b 1
)
echo OK: Build concluido
echo.

REM 3. Instalar MDM
echo [3/5] Instalando MDM Launcher...
adb install -r "%MDM_APK%"
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar MDM
    pause
    exit /b 1
)
echo OK: MDM instalado
echo.

REM 4. Instalar WMS
echo [4/5] Instalando app WMS...
if exist "%WMS_APK%" (
    adb install -r "%USERPROFILE%\Downloads\application-5e85c3a7-b5f7-4ae3-aaa8-d20a4d88af3f-1 ^(2^).apk"
    echo OK: WMS instalado
) else (
    echo [AVISO] APK WMS nao encontrado em Downloads
    echo Pule esta etapa ou coloque o APK em: %WMS_APK%
)
echo.

REM 5. Permissoes e Kiosk
echo [5/5] Aplicando permissoes e modo kiosk...
adb shell pm grant com.mdm.launcher android.permission.WRITE_SECURE_SETTINGS 2>nul
cd /d "%PROJECT_DIR%"
node deploy-kiosk-wms.js
if %errorlevel% neq 0 (
    echo [AVISO] Servidor pode nao estar rodando. Execute: npm run dev:all
)
echo.

REM Abrir MDM
echo Abrindo MDM Launcher...
adb shell am start -n com.mdm.launcher/.MainActivity
timeout /t 2 /nobreak >nul
echo Abrindo app WMS...
adb shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.centersporti.wmsmobile/.MainActivity 2>nul

echo.
echo ========================================
echo   DEPLOY CONCLUIDO!
echo ========================================
echo.
echo O celular esta configurado com:
echo   - MDM Launcher atualizado
echo   - App WMS (unico permitido)
echo   - Modo kiosk ativo
echo   - Sem bloqueio de tela
echo   - Power abre o WMS direto
echo   - Desligar vira reiniciar
echo.
pause
