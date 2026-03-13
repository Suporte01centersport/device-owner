import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../../../server/database/config'

// POST /api/alerts/:id/read - marca um alerta como lido
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const alertId = params.id
    await query(
      `UPDATE alerts SET is_read = true, read_at = NOW() WHERE id = $1`,
      [alertId]
    )
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Erro ao marcar alerta como lido:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ success: true })
    }
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    )
  }
}
