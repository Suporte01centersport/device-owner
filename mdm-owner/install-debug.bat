@echo off
echo ====================================
echo  INSTALANDO MDM LAUNCHER (DEBUG)
echo ====================================
echo.
echo Servidor: Windows (192.168.2.46:3002)
echo Build Type: DEBUG
echo Descoberta: Automatica
echo.

echo [1/3] Compilando APK Debug...
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo ERRO: Falha ao compilar APK Debug
    pause
    exit /b 1
)
echo OK: APK Debug compilado
echo.

echo [2/3] Instalando APK Debug...
adb install -r app\build\outputs\apk\debug\app-debug.apk
if %errorlevel% neq 0 (
    echo ERRO: Falha ao instalar APK Debug
    pause
    exit /b 1
)
echo OK: APK Debug instalado
echo.

echo [3/3] Iniciando app e verificando conexao...
adb shell am start -n com.mdm.launcher/.MainActivity >nul 2>&1
timeout /t 3 /nobreak >nul
echo.

echo Verificando logs...
adb logcat -s ServerDiscovery:D WebSocketClient:D -d -t 20 | findstr /C:"Servidor encontrado" /C:"WebSocket ABERTO" /C:"192.168.2.46"
echo.

echo ====================================
echo  INSTALACAO CONCLUIDA!
echo ====================================
echo.
echo APK Debug instalado com sucesso!
echo O app vai descobrir automaticamente o servidor Windows
echo.
echo Comandos uteis:
echo   - Ver logs:       adb logcat -s ServerDiscovery WebSocketClient
echo   - Reinstalar:     .\install-debug.bat
echo   - Compilar apenas: .\gradlew.bat assembleDebug
echo.
pause

