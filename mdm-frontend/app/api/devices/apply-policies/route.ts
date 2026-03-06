import { NextRequest, NextResponse } from 'next/server'

/**
 * API para aplicar políticas de dispositivo: desabilitar bloqueio, bloquear Settings, restringir Quick Settings
 * POST /api/devices/apply-policies
 *
 * Body: { deviceId: string } ou { deviceIds: string[] } ou { deviceIds: 'all' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const deviceId = body.deviceId as string | undefined
    const deviceIds = body.deviceIds as string[] | 'all' | undefined

    let pathId: string
    if (deviceIds === 'all') {
      pathId = 'all'
    } else if (Array.isArray(deviceIds) && deviceIds.length > 0) {
      pathId = deviceIds[0]
    } else if (deviceId) {
      pathId = deviceId
    } else {
      return NextResponse.json(
        { success: false, error: 'deviceId ou deviceIds é obrigatório' },
        { status: 400 }
      )
    }

    const wsHost = process.env.WEBSOCKET_HOST || 'localhost'
    const wsPort = process.env.WEBSOCKET_PORT || '3001'
    const url = `http://${wsHost}:${wsPort}/api/devices/${pathId}/apply-policies`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    const data = await res.json()
    if (res.ok && data.success !== false) {
      return NextResponse.json({
        success: true,
        message: 'Políticas aplicadas com sucesso',
        deviceId: pathId
      })
    }
    return NextResponse.json(
      { success: false, error: data.error || 'Erro ao aplicar políticas' },
      { status: res.status || 500 }
    )
  } catch (error) {
    console.error('Erro ao aplicar políticas:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao comunicar com servidor WebSocket. Verifique se o servidor está rodando na porta 3001.'
      },
      { status: 500 }
    )
  }
}
