import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/devices/[deviceId]/lock
 * Trava o dispositivo (fallback HTTP quando WebSocket não conectado)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params
    const wsHost = process.env.WEBSOCKET_HOST || 'localhost'
    const wsPort = process.env.WEBSOCKET_PORT || '3001'
    const url = `http://${wsHost}:${wsPort}/api/devices/${deviceId}/lock`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId })
    })

    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success !== false) {
      return NextResponse.json({ success: true, message: 'Dispositivo travado' })
    }
    return NextResponse.json(
      { success: false, error: data.error || 'Falha ao travar dispositivo' },
      { status: res.status >= 400 ? res.status : 400 }
    )
  } catch (error) {
    console.error('Erro ao travar dispositivo:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao conectar com o servidor. Verifique se o servidor está rodando na porta 3001.'
      },
      { status: 500 }
    )
  }
}
