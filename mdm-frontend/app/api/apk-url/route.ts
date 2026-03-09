import { NextResponse } from 'next/server'

/**
 * GET /api/apk-url
 * Retorna a URL do APK MDM para download (acessível pelos dispositivos)
 */
export async function GET() {
  try {
    const wsHost = process.env.WEBSOCKET_HOST || 'localhost'
    const wsPort = process.env.WEBSOCKET_PORT || '3001'
    const res = await fetch(`http://${wsHost}:${wsPort}/api/apk-url`)
    const data = await res.json()
    if (data.success) {
      return NextResponse.json({ success: true, url: data.url })
    }
    return NextResponse.json({ success: false, error: data.error }, { status: 500 })
  } catch (error) {
    console.error('Erro ao obter APK URL:', error)
    return NextResponse.json(
      { success: false, error: 'Servidor WebSocket indisponível. Verifique se está rodando na porta 3001.' },
      { status: 500 }
    )
  }
}
