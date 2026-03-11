import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../server/database/config'

// GET /api/audit-logs - lista logs de auditoria com paginação
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const action = searchParams.get('action')
    const targetType = searchParams.get('target_type')
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (action) {
      conditions.push(`action = $${paramIndex++}`)
      params.push(action)
    }
    if (targetType) {
      conditions.push(`target_type = $${paramIndex++}`)
      params.push(targetType)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countResult = await query(
      `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
      params
    )
    const total = parseInt((countResult.rows as any[])[0]?.total || '0', 10)
    const totalPages = Math.ceil(total / limit)

    const dataResult = await query(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      success: true,
      data: dataResult.rows,
      total,
      page,
      totalPages
    })
  } catch (error: any) {
    console.error('Erro ao listar audit-logs:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('econnrefused')) {
      return NextResponse.json({ success: true, data: [], total: 0, page: 1, totalPages: 0 })
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// POST /api/audit-logs - cria entrada de log de auditoria
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, target_type, target_id, target_name, details } = body

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Campo "action" é obrigatório' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || null

    const result = await query(
      `INSERT INTO audit_logs (action, target_type, target_id, target_name, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [action, target_type || null, target_id || null, target_name || null, details ? JSON.stringify(details) : null, ip]
    )

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error: any) {
    console.error('Erro ao criar audit-log:', error?.message || error)
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
