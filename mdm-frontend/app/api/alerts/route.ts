import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../server/database/config'

// GET /api/alerts - lista alertas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread_only') === 'true'
    const type = searchParams.get('type')
    const severity = searchParams.get('severity')
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (unreadOnly) {
      conditions.push(`is_read = false`)
    }
    if (type) {
      conditions.push(`type = $${paramIndex++}`)
      params.push(type)
    }
    if (severity) {
      conditions.push(`severity = $${paramIndex++}`)
      params.push(severity)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const dataResult = await query(
      `SELECT * FROM alerts ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++}`,
      [...params, limit]
    )

    const unreadResult = await query(
      `SELECT COUNT(*) as count FROM alerts WHERE is_read = false`
    )
    const unreadCount = parseInt((unreadResult.rows as any[])[0]?.count || '0', 10)

    return NextResponse.json({
      success: true,
      data: dataResult.rows,
      unreadCount
    })
  } catch (error: any) {
    console.error('Erro ao listar alerts:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('econnrefused')) {
      return NextResponse.json({ success: true, data: [], unreadCount: 0 })
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// POST /api/alerts - cria um alerta
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, severity, device_id, device_name, message, details } = body

    if (!type || !message) {
      return NextResponse.json(
        { success: false, error: 'Campos "type" e "message" são obrigatórios' },
        { status: 400 }
      )
    }

    const result = await query(
      `INSERT INTO alerts (type, severity, device_id, device_name, message, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [type, severity || 'info', device_id || null, device_name || null, message, details ? JSON.stringify(details) : null]
    )

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error: any) {
    console.error('Erro ao criar alert:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ success: true, data: null })
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// PUT /api/alerts - marca alertas como lidos ou resolvidos
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids, action } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Campo "ids" deve ser um array não vazio' },
        { status: 400 }
      )
    }

    if (action !== 'read' && action !== 'resolve') {
      return NextResponse.json(
        { success: false, error: 'Campo "action" deve ser "read" ou "resolve"' },
        { status: 400 }
      )
    }

    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(', ')

    if (action === 'read') {
      await query(
        `UPDATE alerts SET is_read = true WHERE id IN (${placeholders}) AND is_read = false`,
        ids
      )
    } else {
      await query(
        `UPDATE alerts SET is_resolved = true, resolved_at = NOW(), is_read = true WHERE id IN (${placeholders}) AND is_resolved = false`,
        ids
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Erro ao atualizar alerts:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ success: true })
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// DELETE /api/alerts - exclui alertas antigos
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const olderThanDays = Math.max(1, parseInt(searchParams.get('older_than_days') || '30', 10))

    const result = await query(
      `DELETE FROM alerts WHERE created_at < NOW() - INTERVAL '1 day' * $1 RETURNING id`,
      [olderThanDays]
    )

    return NextResponse.json({
      success: true,
      deleted: result.rows.length
    })
  } catch (error: any) {
    console.error('Erro ao excluir alerts:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ success: true, deleted: 0 })
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
