import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, computerId } = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId é obrigatório' },
        { status: 400 }
      )
    }

    // Parar sessão no servidor WebSocket
    // A sessão será encerrada automaticamente quando o cliente desconectar via WebSocket
    // Não é necessário acessar o módulo websocket aqui, pois o frontend já envia o comando via WebSocket
    
    return NextResponse.json({
      success: true,
      message: 'Sessão encerrada'
    })
  } catch (error: any) {
    console.error('Erro ao parar sessão de desktop:', error)
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
