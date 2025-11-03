import { NextRequest, NextResponse } from 'next/server'

// Tipos de ações remotas suportadas para computadores (UEM)
type RemoteAction = 
  | 'lock_device'
  | 'reboot_device'
  | 'shutdown_device'
  | 'wipe_device'
  | 'disable_camera'
  | 'disable_usb'
  | 'run_script'
  | 'install_software'
  | 'uninstall_software'

interface ExecuteActionRequest {
  deviceId: string
  action: RemoteAction
  params?: any
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecuteActionRequest = await request.json()
    const { deviceId, action, params } = body

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID é obrigatório' },
        { status: 400 }
      )
    }

    if (!action) {
      return NextResponse.json(
        { error: 'Action é obrigatória' },
        { status: 400 }
      )
    }

    // Aqui você pode adicionar validação adicional baseada no tipo de ação
    // Por exemplo, wipe_device requer confirmCode

    console.log(`💻 UEM Action solicitada: ${action} para computador ${deviceId}`)

    // Retornar sucesso - o comando será enviado via WebSocket
    return NextResponse.json({
      success: true,
      deviceId,
      action,
      message: `Comando ${action} será enviado para o dispositivo`,
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('Erro ao executar ação remota:', error)
    return NextResponse.json(
      { error: 'Erro ao processar comando remoto' },
      { status: 500 }
    )
  }
}

