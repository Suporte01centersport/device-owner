import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

/** Obtém IP local do PC para o celular conectar ao WebSocket (prioriza WiFi na mesma rede) */
function getLocalServerIp(): string {
  // 1. WEBSOCKET_CLIENT_HOST ou WEBSOCKET_HOST (IP real) no .env
  const envHost = process.env.WEBSOCKET_CLIENT_HOST || process.env.WEBSOCKET_HOST
  if (envHost && !['localhost', '127.0.0.1', '0.0.0.0'].includes(envHost)) {
    return envHost
  }
  const interfaces = os.networkInterfaces()
  // 2. Priorizar 192.168.x.x (WiFi comum) sobre 172.x (WSL/Docker) e 10.x
  const preferPrivate = (addr: string) => {
    if (addr.startsWith('192.168.')) return 3
    if (addr.startsWith('10.')) return 2
    if (addr.startsWith('172.')) return 1 // WSL/Docker costuma ser 172.x
    return 0
  }
  let best: { addr: string; score: number } | null = null
  const wifiNames = ['wi-fi', 'wifi', 'ethernet', 'eth0', 'en0']
  for (const name of Object.keys(interfaces)) {
    const lower = name.toLowerCase()
    const isWifi = wifiNames.some(w => lower.includes(w))
    const skip = lower.includes('vether') || lower.includes('docker') || lower.includes('wsl')
    if (skip) continue
    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal || iface.address.startsWith('169.')) continue
      const score = (isWifi ? 10 : 0) + preferPrivate(iface.address)
      if (!best || score > best.score) best = { addr: iface.address, score }
    }
  }
  return best?.addr || '192.168.1.100'
}

const WMS_APK_MAP: Record<string, string> = {
  pedidos: 'application-5e85c3a7-b5f7-4ae3-aaa8-d20a4d88af3f-1 (2).apk',
  full: 'Full.apk'
}

/**
 * POST /api/devices/add-device
 * Instala MDM + WMS + permissões no celular conectado via USB
 * Body: { wmsVariant?: 'pedidos' | 'full' } - default: pedidos
 */
export async function POST(request: NextRequest) {
  const steps: string[] = []
  const errors: string[] = []

  try {
    let wmsVariant: 'pedidos' | 'full' = 'pedidos'
    try {
      const body = await request.json().catch(() => ({}))
      if (body.wmsVariant === 'full' || body.wmsVariant === 'pedidos') {
        wmsVariant = body.wmsVariant
      }
    } catch { /* usa default */ }

    const projectRoot = path.resolve(process.cwd(), '..')
    const mdmApkPath = path.join(projectRoot, 'mdm-owner', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    const downloadsDir = process.env.USERPROFILE || process.env.HOME || ''
    const wmsFileName = WMS_APK_MAP[wmsVariant] || WMS_APK_MAP.pedidos
    const wmsApkPath = path.join(downloadsDir, 'Downloads', wmsFileName)

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

    // 1b. Desinstalar MDM anterior (reinstalação limpa para aplicar correções)
    try {
      execSync('adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver', { encoding: 'utf-8', timeout: 5000 })
    } catch { /* ignora se não for admin */ }
    try {
      execSync('adb uninstall com.mdm.launcher', { encoding: 'utf-8', timeout: 10000 })
      steps.push('OK: MDM desinstalado')
    } catch {
      steps.push('MDM não estava instalado (ok)')
    }

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
    runCmd('adb shell appops set com.mdm.launcher PACKAGE_USAGE_STATS allow', 'PACKAGE_USAGE_STATS (AppMonitor)')
    runCmd('adb shell settings put secure lockscreen.disabled 1', 'Desabilitar bloqueio de tela')
    runCmd('adb shell pm grant com.centersporti.wmsmobile android.permission.READ_EXTERNAL_STORAGE', 'Permissão WMS')
    runCmd('adb shell pm grant com.centersporti.wmsmobile android.permission.WRITE_EXTERNAL_STORAGE', 'Permissão WMS')
    runCmd('adb shell appops set com.centersporti.wmsmobile SYSTEM_ALERT_WINDOW allow', 'SYSTEM_ALERT_WINDOW')

    // 6. Aplicar modo kiosk via API
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

    // 7. Definir MDM como launcher padrão (Home volta para MDM) - o app também faz via addPersistentPreferredActivity
    try {
      execSync('adb shell cmd package set-home-activity "com.mdm.launcher/.MainActivity"', { encoding: 'utf-8', timeout: 5000 })
      steps.push('OK: Launcher padrão definido')
    } catch {
      steps.push('AVISO: set-home-activity falhou (app definirá ao abrir)')
    }

    // 8. Abrir MDM com config inicial de kiosk + URL do servidor (celular conecta ao PC na mesma rede)
    const serverIp = getLocalServerIp()
    const wsPort = process.env.WEBSOCKET_PORT || '3001'
    const serverUrl = `ws://${serverIp}:${wsPort}`
    runCmd(
      `adb shell am start -n com.mdm.launcher/.MainActivity --es initial_allowed_apps "com.centersporti.wmsmobile" --es server_url "${serverUrl}"`,
      'Abrir MDM com allowed apps (MDM + WMS) e URL do servidor'
    )

    return NextResponse.json({
      success: true,
      message: 'Dispositivo configurado com sucesso! MDM fixo, WMS abre ao clicar.',
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
