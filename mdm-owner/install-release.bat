@echo off
echo ====================================
echo  INSTALANDO MDM LAUNCHER (RELEASE)
echo ====================================
echo.
echo Servidor: Linux (192.168.2.100:3002)
echo Build Type: RELEASE
echo.

echo [1/5] Removendo Device Owner anterior...
adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver 2>nul
if %errorlevel% equ 0 (
    echo OK: Device Owner removido
) else (
    echo INFO: Nenhum Device Owner anterior encontrado
)
echo.

echo [2/5] Desinstalando versao anterior...
adb uninstall com.mdm.launcher 2>nul
if %errorlevel% equ 0 (
    echo OK: App desinstalado
) else (
    echo INFO: App nao estava instalado
)
echo.

echo [3/5] Instalando APK Release...
adb install app\build\outputs\apk\release\app-release.apk
if %errorlevel% neq 0 (
    echo.
    echo ERRO: Falha ao instalar APK Release
    echo.
    echo Possiveis causas:
    echo   - APK nao foi compilado (execute: .\gradlew.bat assembleRelease)
    echo   - Dispositivo nao conectado
    echo   - USB Debugging desabilitado
    echo.
    pause
    exit /b 1
)
echo OK: APK Release instalado
echo.

echo [4/5] Configurando Device Owner...
adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver
if %errorlevel% neq 0 (
    echo.
    echo ERRO: Falha ao configurar Device Owner
    echo.
    echo Possiveis causas:
    echo   - Ha contas Google no dispositivo
    echo   - Ha multiplos usuarios no dispositivo
    echo   - Dispositivo nao foi resetado
    echo.
    echo Solucoes:
    echo   1. Remover contas Google em Configuracoes ^> Contas
    echo   2. Verificar usuarios: adb shell pm list users
    echo   3. Fazer reset de fabrica
    echo.
    pause
    exit /b 1
)
echo OK: Device Owner configurado
echo.

echo [5/5] Verificando conexao com servidor...
timeout /t 2 /nobreak >nul
adb shell am start -n com.mdm.launcher/.MainActivity >nul 2>&1
echo Aguardando conexao (5 segundos)...
timeout /t 5 /nobreak >nul
echo.

echo Verificando logs...
adb logcat -s ServerDiscovery:D WebSocketClient:D -d -t 30 | findstr /C:"Usando URL FIXA" /C:"WebSocket ABERTO" /C:"192.168.2.100"
echo.

echo ====================================
echo  INSTALACAO CONCLUIDA COM SUCESSO!
echo ====================================
echo.
echo Status:
echo   - APK Release: instalado
echo   - Device Owner: configurado
echo   - Servidor: Linux (192.168.2.100:3002)
echo.
echo Comandos uteis:
echo   - Ver logs:    adb logcat -s ServerDiscovery WebSocketClient
echo   - Ver status:  adb shell dpm list-owners
echo   - Reinstalar:  adb install -r app\build\outputs\apk\release\app-release.apk
echo.
pause

