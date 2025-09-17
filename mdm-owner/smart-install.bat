@echo off
echo ================================================
echo    INSTALACAO INTELIGENTE MDM LAUNCHER
echo ================================================
echo.

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

REM Verificar se há dispositivo conectado
for /f "tokens=2" %%i in ('adb devices ^| find "device"') do (
    if "%%i"=="device" (
        set DEVICE_CONNECTED=1
        goto :device_found
    )
)

if not defined DEVICE_CONNECTED (
    echo ERRO: Nenhum dispositivo/emulador conectado!
    pause
    exit /b 1
)

:device_found
echo Dispositivo encontrado! Analisando status atual...
echo.

REM Verificar se MDM Launcher está instalado
echo Verificando se MDM Launcher está instalado...
adb shell "pm list packages | grep mdm.launcher" >nul
if %errorlevel% equ 0 (
    echo ✓ MDM Launcher já está instalado
    set MDM_INSTALLED=1
) else (
    echo ✗ MDM Launcher não está instalado
    set MDM_INSTALLED=0
)

REM Verificar se Device Owner está configurado
echo Verificando se Device Owner está configurado...
adb shell "dpm list-owners" | find "com.mdm.launcher" >nul
if %errorlevel% equ 0 (
    echo ✓ Device Owner já está configurado
    set DEVICE_OWNER_SET=1
) else (
    echo ✗ Device Owner não está configurado
    set DEVICE_OWNER_SET=0
)

REM Verificar launcher padrão
echo Verificando launcher padrão...
adb shell "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME" | find "com.mdm.launcher" >nul
if %errorlevel% equ 0 (
    echo ✓ MDM Launcher está como opção de launcher
    set LAUNCHER_AVAILABLE=1
) else (
    echo ✗ MDM Launcher não está como opção de launcher
    set LAUNCHER_AVAILABLE=0
)

echo.
echo ================================================
echo    PLANO DE ACAO
echo ================================================
echo.

if %MDM_INSTALLED% equ 0 (
    echo 1. Instalar MDM Launcher
    set ACTION_NEEDED=1
)

if %DEVICE_OWNER_SET% equ 0 (
    echo 2. Configurar como Device Owner
    set ACTION_NEEDED=1
)

if %LAUNCHER_AVAILABLE% equ 0 (
    echo 3. Configurar como launcher padrão
    set ACTION_NEEDED=1
)

if %MDM_INSTALLED% equ 1 if %DEVICE_OWNER_SET% equ 1 if %LAUNCHER_AVAILABLE% equ 1 (
    echo ✓ Tudo já está configurado corretamente!
    echo.
    echo Verificando status final...
    call check-device-owner.bat
    pause
    exit /b 0
)

if not defined ACTION_NEEDED (
    echo ✓ Configuração está OK!
    pause
    exit /b 0
)

echo.
set /p confirm="Continuar com as ações necessárias? (S/N): "
if /i not "%confirm%"=="S" (
    echo Operação cancelada.
    pause
    exit /b 0
)

echo.
echo ================================================
echo    EXECUTANDO ACOES
echo ================================================
echo.

REM Compilar APK se necessário
if not exist "app\build\outputs\apk\debug\app-debug.apk" (
    echo Compilando APK...
    call gradlew.bat assembleDebug
    if %errorlevel% neq 0 (
        echo ERRO: Falha na compilação!
        pause
        exit /b 1
    )
)

REM Instalar ou reinstalar APK
if %MDM_INSTALLED% equ 0 (
    echo Instalando MDM Launcher...
) else (
    echo Reinstalando MDM Launcher...
)
adb install -r app\build\outputs\apk\debug\app-debug.apk
if %errorlevel% neq 0 (
    echo ERRO: Falha na instalação!
    pause
    exit /b 1
)
echo ✓ APK instalado com sucesso!

REM Configurar Device Owner se necessário
if %DEVICE_OWNER_SET% equ 0 (
    echo Configurando como Device Owner...
    adb shell "dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver"
    if %errorlevel% equ 0 (
        echo ✓ Device Owner configurado!
    ) else (
        echo ERRO: Falha ao configurar Device Owner!
        echo Verifique se o dispositivo está em modo de fábrica.
        pause
        exit /b 1
    )
) else (
    echo ✓ Device Owner já estava configurado
)

REM Configurar launcher padrão se necessário
if %LAUNCHER_AVAILABLE% equ 0 (
    echo Configurando como launcher padrão...
    adb shell "cmd package set-home-activity com.mdm.launcher/.MainActivity"
    if %errorlevel% equ 0 (
        echo ✓ Launcher padrão configurado!
    ) else (
        echo ERRO: Falha ao configurar launcher padrão!
    )
) else (
    echo ✓ Launcher já estava configurado
)

echo.
echo ================================================
echo    INSTALACAO CONCLUIDA!
echo ================================================
echo.
echo Verificando status final...
call check-device-owner.bat
echo.
echo Configuração concluída com sucesso!
pause
