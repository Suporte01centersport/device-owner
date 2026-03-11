import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../../server/database/config'

/**
 * POST /api/devices/send-notification
 * Envia mensagem/notificação para o celular (fallback HTTP quando WebSocket falha)
 * Body: { deviceId: string, title?: string, message: string }
 *   ou  { broadcast: true, title?: string, message: string } para todos os dispositivos
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, broadcast, title, message } = body

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Campo "message" é obrigatório' },
        { status: 400 }
      )
    }

    if (!broadcast && !deviceId) {
      return NextResponse.json(
        { success: false, error: 'Campo "deviceId" é obrigatório (ou use "broadcast: true" para todos)' },
        { status: 400 }
      )
    }

    const wsHost = process.env.WEBSOCKET_HOST || 'localhost'
    const wsPort = process.env.WEBSOCKET_PORT || '3001'
    const wsUrl = `http://${wsHost}:${wsPort}/api/devices/send-notification`

    // Broadcast: enviar para todos os dispositivos conectados
    if (broadcast) {
      let deviceIds: string[] = []
      try {
        const devicesResult = await query(
          `SELECT device_id FROM devices WHERE deleted_at IS NULL AND status = 'online'`
        )
        deviceIds = (devicesResult.rows || []).map((r: any) => r.device_id)
      } catch {
        // Se a tabela não existir, tenta enviar broadcast genérico
        deviceIds = []
      }

      if (deviceIds.length === 0) {
        // Tentar enviar broadcast genérico via WebSocket server
        try {
          const res = await fetch(wsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ broadcast: true, title: title || '', message })
          })
          const data = await res.json()
          if (data.success) {
            return NextResponse.json({ success: true, message: 'Broadcast enviado!' })
          }
        } catch {
          // Sem dispositivos online e sem websocket
        }
        return NextResponse.json({ success: true, message: 'Nenhum dispositivo online encontrado', sent: 0 })
      }

      const results = await Promise.allSettled(
        deviceIds.map(async (id: string) => {
          const res = await fetch(wsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: id, title: title || '', message })
          })
          return res.json()
        })
      )

      const sent = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.success).length

      return NextResponse.json({
        success: true,
        message: `Notificação enviada para ${sent}/${deviceIds.length} dispositivos`,
        sent,
        total: deviceIds.length
      })
    }

    // Envio individual
    const res = await fetch(wsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, title: title || '', message })
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
