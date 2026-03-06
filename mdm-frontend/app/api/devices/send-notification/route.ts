import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/devices/send-notification
 * Envia mensagem/notificação para o celular (fallback HTTP quando WebSocket falha)
 * Body: { deviceId: string, message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, message } = body

    if (!deviceId || !message) {
      return NextResponse.json(
        { success: false, error: 'deviceId e message são obrigatórios' },
        { status: 400 }
      )
    }

    const wsHost = process.env.WEBSOCKET_HOST || 'localhost'
    const wsPort = process.env.WEBSOCKET_PORT || '3001'
    const url = `http://${wsHost}:${wsPort}/api/devices/send-notification`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, message })
    })

    const data = await res.json()
    if (data.success) {
      return NextResponse.json({ success: true, message: 'Mensagem enviada!' })
    }
    return NextResponse.json(
      { success: false, error: data.error || 'Falha ao enviar' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Erro ao enviar notificação:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao conectar com o servidor. Verifique se o servidor WebSocket está rodando na porta 3001.'
      },
      { status: 500 }
    )
  }
}
