import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const computerId = searchParams.get('computerId')

    if (!computerId) {
      return NextResponse.json(
        { error: 'computerId é obrigatório' },
        { status: 400 }
      )
    }

    // Buscar informações do computador no banco
    const ComputerModel = require('../../../../server/database/models/Computer')
    const computer = await ComputerModel.findById(computerId)

    if (!computer) {
      return NextResponse.json(
        { error: 'Computador não encontrado' },
        { status: 404 }
      )
    }

    // Solicitar informações de acesso remoto do agente via WebSocket
    const { connectedComputers } = require('../../../../server/websocket')
    const computerWs = connectedComputers.get(computerId)

    if (!computerWs || computerWs.readyState !== 1) {
      return NextResponse.json({
        success: false,
        error: 'Computador não está online',
        info: {
          anydeskInstalled: false,
          anydeskId: null,
          rdpEnabled: false
        }
      })
    }

    // Enviar comando para obter informações de acesso remoto
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(NextResponse.json({
          success: true,
          info: {
            anydeskInstalled: false,
            anydeskId: null,
            rdpEnabled: false,
            connectionString: null
          }
        }))
      }, 5000)

      // Enviar comando ao agente
      computerWs.send(JSON.stringify({
        type: 'get_remote_access_info',
        computerId: computerId,
        timestamp: Date.now()
      }))

      // Listener temporário para resposta (seria melhor usar um sistema de eventos)
      const originalOnMessage = computerWs.onmessage
      computerWs.onmessage = (event: any) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'remote_access_info_response' && message.computerId === computerId) {
            clearTimeout(timeout)
            computerWs.onmessage = originalOnMessage
            
            resolve(NextResponse.json({
              success: true,
              info: {
                anydeskInstalled: message.info?.anydeskInstalled || false,
                anydeskId: message.info?.anydeskId || null,
                rdpEnabled: message.info?.rdpEnabled || false,
                connectionString: message.info?.connectionString || null
              }
            }))
          }
        } catch (error) {
          // Continuar esperando
        }
      }
    })
  } catch (error) {
    console.error('Erro ao obter informações de acesso remoto:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

