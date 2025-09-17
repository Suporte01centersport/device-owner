@echo off
echo ================================================
echo    PREPARACAO DISPOSITIVO PARA DEVICE OWNER
echo ================================================
echo.
echo ATENCAO: Este script vai preparar o dispositivo para
echo ser configurado como Device Owner.
echo.
echo REQUISITOS:
echo - Dispositivo deve estar em modo de fabrica
echo - NENHUMA conta Google configurada
echo - USB Debugging habilitado
echo.
echo IMPORTANTE: Device Owner so funciona em dispositivos
echo que nao tem contas configuradas!
echo.
set /p confirm="Continuar? (S/N): "
if /i not "%confirm%"=="S" (
    echo Operacao cancelada.
    pause
    exit /b 0
)

REM Verificar se ADB está disponível
adb version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: ADB não encontrado!
    pause
    exit /b 1
)

REM Verificar dispositivos conectados
echo Verificando dispositivos conectados...
adb devices
echo.

REM Verificar se há contas configuradas
echo Verificando contas configuradas...
adb shell "pm list users"
echo.

REM Limpar qualquer Device Owner existente
echo Limpando Device Owners existentes...
adb shell "dpm clear-device-owner-user-restriction com.mdm.launcher"
echo.

REM Desinstalar MDM Launcher se existir
echo Desinstalando MDM Launcher anterior...
adb uninstall com.mdm.launcher 2>nul
echo.

REM Limpar dados de usuário se necessário
echo Limpando dados de usuário...
adb shell "pm clear com.mdm.launcher" 2>nul
echo.

REM Verificar se o dispositivo está pronto
echo Verificando se o dispositivo está pronto para Device Owner...
adb shell "dpm list-owners"
echo.

echo ================================================
echo    DISPOSITIVO PREPARADO!
echo ================================================
echo.
echo O dispositivo foi preparado para Device Owner.
echo.
echo PROXIMOS PASSOS:
echo 1. Execute install-device-owner.bat
echo 2. Configure o MDM Launcher
echo 3. Teste as funcionalidades
echo.
echo IMPORTANTE: Se o Device Owner falhar, você pode
echo precisar fazer um factory reset completo do
echo dispositivo e tentar novamente.
echo.
pause
