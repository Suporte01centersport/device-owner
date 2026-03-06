import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

/**
 * POST /api/devices/add-device
 * Instala MDM + WMS + permissões no celular conectado via USB
 */
export async function POST(request: NextRequest) {
  const steps: string[] = []
  const errors: string[] = []

  try {
    const projectRoot = path.resolve(process.cwd(), '..')
    const mdmApkPath = path.join(projectRoot, 'mdm-owner', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    const wmsApkPath = path.join(
      process.env.USERPROFILE || process.env.HOME || '',
      'Downloads',
      'application-5e85c3a7-b5f7-4ae3-aaa8-d20a4d88af3f-1 (2).apk'
    )

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

    // 2. Build MDM se não existir
    if (!fs.existsSync(mdmApkPath)) {
      const mdmDir = path.join(projectRoot, 'mdm-owner')
      const gradlew = path.join(mdmDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
      const buildCmd = process.platform === 'win32'
        ? `cd /d "${mdmDir}" && "${gradlew}" assembleDebug -q`
        : `cd "${mdmDir}" && ./gradlew assembleDebug -q`
      if (!runCmd(buildCmd, 'Build MDM')) {
        return NextResponse.json({ success: false, error: errors.join('; '), steps }, { status: 500 })
      }
    } else {
      steps.push('APK MDM já existe')
    }

    // 3. Instalar MDM
    const installMdmCmd = `adb install -r "${mdmApkPath}"`
    if (!runCmd(installMdmCmd, 'Instalar MDM')) {
      return NextResponse.json({ success: false, error: errors.join('; '), steps }, { status: 500 })
    }

    // 4. Instalar WMS
    if (fs.existsSync(wmsApkPath)) {
      runCmd(`adb install -r "${wmsApkPath}"`, 'Instalar WMS')
    } else {
      steps.push('AVISO: APK WMS não encontrado em Downloads')
    }

    // 5. Permissões
    runCmd('adb shell pm grant com.mdm.launcher android.permission.WRITE_SECURE_SETTINGS', 'WRITE_SECURE_SETTINGS')
    runCmd('adb shell dpm set-device-owner com.mdm.launcher/.DeviceAdminReceiver', 'Definir Device Owner')
    runCmd('adb shell settings put secure lockscreen.disabled 1', 'Desabilitar bloqueio de tela')
    runCmd('adb shell pm grant com.centersporti.wmsmobile android.permission.READ_EXTERNAL_STORAGE', 'Permissão WMS')
    runCmd('adb shell pm grant com.centersporti.wmsmobile android.permission.WRITE_EXTERNAL_STORAGE', 'Permissão WMS')
    runCmd('adb shell appops set com.centersporti.wmsmobile SYSTEM_ALERT_WINDOW allow', 'SYSTEM_ALERT_WINDOW')

    // 6. Aplicar modo kiosk via API
    try {
      const kioskRes = await fetch('http://localhost:3002/api/devices/all/app-permissions', {
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

    // 7. Abrir apps
    runCmd('adb shell am start -n com.mdm.launcher/.MainActivity', 'Abrir MDM')
    await new Promise(r => setTimeout(r, 2000))
    runCmd('adb shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.centersporti.wmsmobile/.MainActivity', 'Abrir WMS')

    return NextResponse.json({
      success: true,
      message: 'Dispositivo configurado com sucesso! MDM, WMS e kiosk aplicados.',
      steps
    })
  } catch (error) {
    console.error('Erro add-device:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      steps,
      details: errors
    }, { status: 500 })
  }
}
