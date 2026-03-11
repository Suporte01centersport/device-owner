import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../../server/database/config'

// POST /api/devices/lost-mode - ativa/desativa modo perdido
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, enabled, message } = body

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Campo "deviceId" é obrigatório' },
        { status: 400 }
      )
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Campo "enabled" deve ser um booleano' },
        { status: 400 }
      )
    }

    const result = await query(
      `UPDATE devices
       SET lost_mode = $1, lost_mode_message = $2, updated_at = NOW()
       WHERE device_id = $3 AND deleted_at IS NULL
       RETURNING id, device_id, name, lost_mode, lost_mode_message`,
      [enabled, enabled ? (message || null) : null, deviceId]
    )

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dispositivo não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Erro ao alterar modo perdido:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('column')) {
      return NextResponse.json(
        { success: false, error: 'Recurso de modo perdido não disponível. Execute a migração necessária.' },
        { status: 501 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
