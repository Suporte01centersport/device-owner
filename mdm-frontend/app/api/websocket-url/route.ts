import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Retorna a URL do WebSocket para o cliente conectar (mesmo em redes diferentes) */
export async function GET() {
  try {
    const port = process.env.WEBSOCKET_PORT || '3001'
    const base = `http://127.0.0.1:${port}`
    const res = await fetch(`${base}/api/websocket-url`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
    const data = await res.json().catch(() => ({}))
    if (data.success && data.url) {
      return NextResponse.json({ success: true, url: data.url })
    }
    return NextResponse.json({ success: false, error: data.error || 'URL não disponível' }, { status: 500 })
  } catch (err) {
    console.error('Erro ao obter WebSocket URL:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Falha ao conectar ao servidor' },
      { status: 500 }
    )
  }
}
