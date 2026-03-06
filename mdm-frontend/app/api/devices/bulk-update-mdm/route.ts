import { NextRequest, NextResponse } from 'next/server'

const getWsBase = () => {
  const h = process.env.WEBSOCKET_HOST || 'localhost'
  const p = process.env.WEBSOCKET_PORT || '3001'
  return `http://${h}:${p}`
}

/**
 * POST /api/devices/bulk-update-mdm
 * Faz build do MDM e envia atualização para dispositivos via WiFi (sem USB).
 * Body: { deviceIds: string[] | 'all' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { deviceIds = 'all' } = body

    const res = await fetch(`${getWsBase()}/api/build-and-update-mdm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceIds })
    })

    const data = await res.json()

    if (data.success) {
      return NextResponse.json({
        success: true,
        message: data.message || 'Build concluído e atualização enviada via WiFi para os dispositivos selecionados.',
        apkUrl: data.apkUrl,
        sent: data.sent
      })
    }

    return NextResponse.json(
      { success: false, error: data.error || 'Erro ao enviar atualização' },
      { status: 500 }
    )
  } catch (error) {
    console.error('Erro bulk-update-mdm:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao comunicar com o servidor. Verifique se está rodando na porta 3001.'
      },
      { status: 500 }
    )
  }
}
