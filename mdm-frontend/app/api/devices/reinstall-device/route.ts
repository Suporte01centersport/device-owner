import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

/**
 * POST /api/devices/reinstall-device
 * Desinstala o MDM, faz build novo e reinstala no celular conectado via USB.
 * Útil para testar se todas as atualizações sobem corretamente.
 */
export async function POST(request: NextRequest) {
  const steps: string[] = []
  const errors: string[] = []

  try {
    const runCmd = (cmd: string, desc: string): boolean => {
      try {
        steps.push(`Executando: ${desc}`)
        execSync(cmd, {
          encoding: 'utf-8' as BufferEncoding,
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe']
        })
        steps.push(`OK: ${desc}`)
        return true
      } catch (e: any) {
        const msg = e?.message || String(e)
        steps.push(`AVISO: ${desc} - ${msg}`)
        return false
      }
    }

    const runCmdRequired = (cmd: string, desc: string): boolean => {
      try {
        steps.push(`Executando: ${desc}`)
        execSync(cmd, {
          encoding: 'utf-8' as BufferEncoding,
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe']
        })
        steps.push(`OK: ${desc}`)
        return true
      } catch (e: any) {
        const msg = e?.message || String(e)
        errors.push(`${desc}: ${msg}`)
        steps.push(`ERRO: ${desc} - ${msg}`)
        return false
      }
    }

    // 1. Verificar dispositivo
    let adbOutput = ''
    try {
      adbOutput = execSync('adb devices', { encoding: 'utf-8' })
    } catch {
      return NextResponse.json({
        success: false,
        error: 'ADB não encontrado. Instale o Android SDK Platform Tools.',
        steps
      }, { status: 500 })
    }

    const hasDevice = adbOutput.split('\n').some(line => line.trim().endsWith('device') && !line.includes('List of'))
    if (!hasDevice) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum dispositivo conectado. Conecte o celular via USB e habilite depuração.',
        steps
      }, { status: 400 })
    }

    steps.push('Dispositivo detectado')

    // 2. Desinstalar MDM (pode falhar se for Device Owner - ignoramos)
    const uninstallOk = runCmd('adb uninstall com.mdm.launcher', 'Desinstalar MDM')
    if (!uninstallOk) {
      steps.push('AVISO: Desinstalação falhou (pode ser Device Owner - será feita atualização em vez de instalação limpa)')
    }

    // 3. Build MDM (sempre fazer build para pegar últimas alterações)
    const projectRoot = path.resolve(process.cwd(), '..')
    const mdmDir = path.join(projectRoot, 'mdm-owner')
    const gradlew = path.join(mdmDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
    const buildCmd = process.platform === 'win32'
      ? `cd /d "${mdmDir}" && "${gradlew}" assembleDebug -q`
      : `cd "${mdmDir}" && ./gradlew assembleDebug -q`

    if (!runCmdRequired(buildCmd, 'Build MDM (última versão)')) {
      return NextResponse.json({ success: false, error: errors.join('; '), steps }, { status: 500 })
    }

    const mdmApkPath = path.join(mdmDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    const wmsApkPath = path.join(
      process.env.USERPROFILE || process.env.HOME || '',
      'Downloads',
      'application-5e85c3a7-b5f7-4ae3-aaa8-d20a4d88af3f-1 (2).apk'
    )

    // 4. Instalar MDM
    const installMdmCmd = `adb install -r "${mdmApkPath}"`
    if (!runCmdRequired(installMdmCmd, 'Instalar MDM')) {
      return NextResponse.json({ success: false, error: errors.join('; '), steps }, { status: 500 })
    }

    // 5. Instalar WMS
    if (fs.existsSync(wmsApkPath)) {
      runCmd(`adb install -r "${wmsApkPath}"`, 'Instalar WMS')
    } else {
      steps.push('AVISO: APK WMS não encontrado em Downloads')
    }

    // 6. Permissões
    runCmd('adb shell pm grant com.mdm.launcher android.permission.WRITE_SECURE_SETTINGS', 'WRITE_SECURE_SETTINGS')
    // Tentar definir Device Owner (necessário para políticas de bloqueio/Settings - requer dispositivo sem contas)
    runCmd('adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver', 'Definir Device Owner')
    // Desabilitar bloqueio de tela via ADB (reforça o que o app faz)
    runCmd('adb shell settings put secure lockscreen.disabled 1', 'Desabilitar bloqueio de tela')
    runCmd('adb shell pm grant com.centersporti.wmsmobile android.permission.READ_EXTERNAL_STORAGE', 'Permissão WMS')
    runCmd('adb shell pm grant com.centersporti.wmsmobile android.permission.WRITE_EXTERNAL_STORAGE', 'Permissão WMS')
    runCmd('adb shell appops set com.centersporti.wmsmobile SYSTEM_ALERT_WINDOW allow', 'SYSTEM_ALERT_WINDOW')

    // 7. Aplicar modo kiosk via API
    try {
      const wsHost = process.env.WEBSOCKET_HOST || 'localhost'
      const wsPort = process.env.WEBSOCKET_PORT || '3001'
      const kioskRes = await fetch(`http://${wsHost}:${wsPort}/api/devices/all/app-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedApps: ['com.centersporti.wmsmobile'] })
      })
      if (kioskRes.ok) {
        steps.push('OK: Modo kiosk aplicado')
      } else {
        steps.push('AVISO: Servidor pode não estar pronto. O dispositivo receberá a config quando conectar.')
      }
    } catch (e) {
      steps.push('AVISO: Não foi possível aplicar kiosk - servidor pode estar iniciando')
    }

    // 8. Abrir apps
    runCmd('adb shell am start -n com.mdm.launcher/.MainActivity', 'Abrir MDM')
    await new Promise(r => setTimeout(r, 2000))
    runCmd('adb shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.centersporti.wmsmobile/.MainActivity', 'Abrir WMS')

    return NextResponse.json({
      success: true,
      message: 'MDM desinstalado, build novo feito e reinstalado com sucesso! Todas as atualizações foram aplicadas.',
      steps
    })
  } catch (error) {
    console.error('Erro reinstall-device:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      steps,
      details: errors
    }, { status: 500 })
  }
}
