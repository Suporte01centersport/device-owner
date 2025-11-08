import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { computerId } = await request.json()

    if (!computerId) {
      return NextResponse.json(
        { error: 'computerId é obrigatório' },
        { status: 400 }
      )
    }

    // Gerar session ID único
    // O frontend JavaScript vai se conectar ao WebSocket e registrar a sessão
    // O servidor WebSocket então verificará se o computador está online e iniciará a sessão
    const sessionId = `desktop_${computerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return NextResponse.json({
      success: true,
      sessionId: sessionId,
      message: 'Sessão de acesso remoto criada. Conecte-se via WebSocket para visualizar a tela.'
    })
  } catch (error: any) {
    console.error('Erro ao iniciar sessão de desktop:', error)
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
