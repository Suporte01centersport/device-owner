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
  | 'start_remote_desktop'
  | 'stop_remote_desktop'
  | 'remote_mouse_move'
  | 'remote_mouse_click'
  | 'remote_mouse_down'
  | 'remote_mouse_up'
  | 'remote_mouse_wheel'
  | 'remote_key_press'
  | 'remote_key_down'
  | 'remote_key_up'
  | 'remote_text'

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

    // Enviar comando via WebSocket (usar connectedComputers, não connectedDevices)
    // Usar helper para evitar problemas com webpack
    let connectedComputers
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loadWebSocket = require('../../../../server/load-websocket')
      const websocketModule = loadWebSocket()
      connectedComputers = websocketModule.connectedComputers
    } catch (error: any) {
      console.error('Erro ao carregar módulo websocket:', error)
      return NextResponse.json({
        success: false,
        error: 'Servidor WebSocket não está disponível',
        deviceId,
        action
      }, { status: 503 })
    }
    
    if (!connectedComputers) {
      return NextResponse.json({
        success: false,
        error: 'Servidor WebSocket não está inicializado',
        deviceId,
        action
      }, { status: 503 })
    }
    
    const computerWs = connectedComputers.get(deviceId)
    
    if (!computerWs || computerWs.readyState !== 1) { // 1 = OPEN
      return NextResponse.json({
        success: false,
        error: 'Computador não está online',
        deviceId,
        action
      }, { status: 400 })
    }

    // Enviar comando para o computador
    computerWs.send(JSON.stringify({
      type: 'uem_remote_action',
      action: action,
      params: params || {},
      timestamp: Date.now()
    }))

    // Retornar sucesso
    return NextResponse.json({
      success: true,
      deviceId,
      action,
      message: `Comando ${action} enviado para o computador`,
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

