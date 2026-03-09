import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'

/**
 * POST /api/devices/format-device
 * Formata o celular conectado via USB (factory reset).
 * Útil quando o dispositivo está em boot loop ou não funciona mais.
 *
 * Passos:
 * 1. Remove Device Owner (se houver) para permitir factory reset
 * 2. Reinicia no modo recovery - o usuário deve selecionar "Wipe data/factory reset"
 */
export async function POST(request: NextRequest) {
  const steps: string[] = []

  try {
    // 1. Verificar dispositivo conectado
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
        error: 'Nenhum dispositivo conectado. Conecte o celular via USB. Se estiver em boot loop, tente conectar durante o boot (logo aparecendo) ou use Volume Down + Power para entrar no recovery manualmente.',
        steps
      }, { status: 400 })
    }

    steps.push('Dispositivo detectado')

    // 2. Remover Device Owner (necessário para permitir factory reset no recovery)
    try {
      execSync('adb shell dpm remove-active-admin com.mdm.launcher/.DeviceAdminReceiver', {
        encoding: 'utf-8',
        timeout: 5000
      })
      steps.push('OK: Device Owner removido')
    } catch {
      steps.push('Device Owner não estava ativo (ok)')
    }

    // 3. Reiniciar no modo recovery
    try {
      execSync('adb reboot recovery', { encoding: 'utf-8', timeout: 5000 })
      steps.push('OK: Comando de reinício para recovery enviado')
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: e?.message || 'Falha ao enviar comando de recovery',
        steps
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Celular reiniciando no modo recovery. Use as teclas de volume para navegar e Power para confirmar. Selecione "Wipe data/factory reset" e confirme.',
      steps
    })
  } catch (error) {
    console.error('Erro format-device:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      steps
    }, { status: 500 })
  }
}
