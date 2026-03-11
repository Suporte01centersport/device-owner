import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../server/database/config'

// GET /api/scheduled-commands - lista comandos agendados
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const showAll = searchParams.get('all') === 'true'

    const whereClause = showAll ? '' : `WHERE status = 'pending' OR status = 'active'`

    const result = await query(
      `SELECT * FROM scheduled_commands ${whereClause} ORDER BY created_at DESC`
    )

    return NextResponse.json({
      success: true,
      data: result.rows
    })
  } catch (error: any) {
    console.error('Erro ao listar scheduled-commands:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('econnrefused')) {
      return NextResponse.json({ success: true, data: [] })
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// POST /api/scheduled-commands - cria comando agendado
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      command_type,
      target_type,
      target_id,
      target_name,
      parameters,
      schedule_type,
      scheduled_time,
      scheduled_date,
      day_of_week
    } = body

    if (!command_type || !schedule_type) {
      return NextResponse.json(
        { success: false, error: 'Campos "command_type" e "schedule_type" são obrigatórios' },
        { status: 400 }
      )
    }

    const result = await query(
      `INSERT INTO scheduled_commands (
        command_type, target_type, target_id, target_name, parameters,
        schedule_type, scheduled_time, scheduled_date, day_of_week,
        status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
      RETURNING *`,
      [
        command_type,
        target_type || null,
        target_id || null,
        target_name || null,
        parameters ? JSON.stringify(parameters) : null,
        schedule_type,
        scheduled_time || null,
        scheduled_date || null,
        day_of_week != null ? day_of_week : null
      ]
    )

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error: any) {
    console.error('Erro ao criar scheduled-command:', error?.message || error)
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

// DELETE /api/scheduled-commands - exclui comando agendado por id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Query param "id" é obrigatório' },
        { status: 400 }
      )
    }

    await query(
      `DELETE FROM scheduled_commands WHERE id = $1`,
      [parseInt(id, 10)]
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Erro ao excluir scheduled-command:', error?.message || error)
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
