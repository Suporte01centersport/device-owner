@echo off
echo ================================================
echo    INSTALACAO MDM LAUNCHER NO EMULADOR
echo    CONFIGURACAO COMO DEVICE OWNER
echo ================================================
echo.

REM Verificar se ADB está disponível
adb version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: ADB não encontrado! Instale Android SDK Platform Tools.
    pause
    exit /b 1
)

REM Verificar se há emulador conectado
echo Verificando emulador conectado...
adb devices
echo.

for /f "tokens=2" %%i in ('adb devices ^| find "device"') do (
    if "%%i"=="device" (
        set EMULATOR_CONNECTED=1
        goto :emulator_found
    )
)

if not defined EMULATOR_CONNECTED (
    echo ERRO: Nenhum emulador conectado!
    echo.
    echo Para resolver:
    echo 1. Inicie o Android Emulator
    echo 2. Aguarde o boot completo
    echo 3. Execute este script novamente
    echo.
    pause
    exit /b 1
)

:emulator_found
echo Emulador encontrado! Continuando...
echo.

REM Verificar se é emulador (não dispositivo físico)
echo Verificando se é emulador...
adb shell "getprop ro.kernel.qemu" | find "1" >nul
if %errorlevel% equ 0 (
    echo Emulador detectado - OK!
) else (
    echo AVISO: Pode ser dispositivo físico, não emulador.
    echo Continuando mesmo assim...
)
echo.

REM Verificar Device Owners existentes
echo Verificando Device Owners existentes...
adb shell "dpm list-owners"
echo.

REM Desinstalar versão anterior se existir
echo Desinstalando versão anterior (se existir)...
adb uninstall com.mdm.launcher 2>nul
echo.

REM Compilar APK se necessário
if not exist "app\build\outputs\apk\debug\app-debug.apk" (
    echo APK não encontrado, compilando...
    call gradlew.bat assembleDebug
    if %errorlevel% neq 0 (
        echo ERRO: Falha na compilação!
        pause
        exit /b 1
    )
    echo APK compilado com sucesso!
    echo.
)

REM Instalar o APK
echo Instalando MDM Launcher no emulador...
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
    adb shell "dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver" >temp_output.txt 2>&1
    find "already set" temp_output.txt >nul
    if %errorlevel% equ 0 (
        echo Device Owner já estava configurado - OK!
        del temp_output.txt
    ) else (
        find "Success" temp_output.txt >nul
        if %errorlevel% equ 0 (
            echo Device Owner configurado com sucesso!
            del temp_output.txt
        ) else (
            echo ERRO: Falha ao configurar Device Owner!
            type temp_output.txt
            del temp_output.txt
            echo.
            echo Possíveis causas para emulador:
            echo - Emulador não foi iniciado com wipe data
            echo - Contas Google foram configuradas
            echo - Outro Device Owner já existe
            echo.
            echo SOLUÇÕES:
            echo 1. Reinicie o emulador com "Wipe Data"
            echo 2. NÃO configure contas Google
            echo 3. Execute este script imediatamente após o boot
            echo.
            echo Para reiniciar emulador com wipe data:
            echo - Android Studio: AVD Manager ^> Actions ^> Wipe Data
            echo - Linha de comando: emulator -avd NOME_AVD -wipe-data
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

REM Testar funcionalidades básicas
echo Testando funcionalidades Device Owner...
echo Verificando se Device Owner está ativo...
adb shell "dpm list-owners" | find "DeviceOwner" >nul
if %errorlevel% equ 0 (
    echo SUCESSO: Device Owner configurado e ativo!
) else (
    echo FALHA: Device Owner não está configurado corretamente.
)
echo.

echo ================================================
echo    INSTALACAO NO EMULADOR CONCLUIDA!
echo ================================================
echo.
echo O MDM Launcher foi configurado como:
echo - Device Owner (controle total do dispositivo)
echo - Launcher padrão
echo.
echo TESTE AGORA:
echo 1. Reinicie o emulador: adb reboot
echo 2. O MDM Launcher deve aparecer automaticamente
echo 3. Teste o bloqueio/desbloqueio via web
echo 4. Verifique os logs: adb logcat ^| find "com.mdm.launcher"
echo.
echo COMANDOS ÚTEIS:
echo - Reiniciar emulador: adb reboot
echo - Ver logs: adb logcat ^| find "MainActivity"
echo - Verificar status: check-device-owner.bat
echo.
pause
