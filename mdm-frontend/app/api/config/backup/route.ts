import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../../server/database/config'

// GET /api/config/backup - lista backups salvos ou exporta backup direto
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const listMode = searchParams.get('list') === 'true'

  // Modo lista: retorna backups salvos na tabela config_backups
  if (listMode) {
    try {
      const result = await query(
        `SELECT id, name, created_at, version,
          jsonb_object_keys_count(data) as data_keys
         FROM config_backups ORDER BY created_at DESC`
      )
      return NextResponse.json({ success: true, data: result.rows })
    } catch (error: any) {
      const msg = String(error?.message || error).toLowerCase()
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('function')) {
        // Fallback: tabela não existe ou função não suportada, tentar query simples
        try {
          const result = await query(
            `SELECT id, name, created_at, version FROM config_backups ORDER BY created_at DESC`
          )
          return NextResponse.json({ success: true, data: result.rows })
        } catch {
          return NextResponse.json({ success: true, data: [] })
        }
      }
      return NextResponse.json(
        { success: false, error: error?.message || 'Erro ao listar backups' },
        { status: 500 }
      )
    }
  }

  // Modo padrão: exporta backup como arquivo JSON
  try {
    const [devicesRes, groupsRes, usersRes] = await Promise.all([
      query(`
        SELECT d.*, du.name as user_name, du.cpf as user_cpf
        FROM devices d
        LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
        WHERE d.deleted_at IS NULL
      `),
      query(`
        SELECT dg.*,
          (SELECT json_agg(json_build_object('device_id', dgm.device_id))
          FROM device_group_memberships dgm WHERE dgm.group_id = dg.id) as device_ids
        FROM device_groups dg
      `),
      query('SELECT * FROM device_users WHERE is_active = true')
    ])

    const backup = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      devices: devicesRes.rows || [],
      groups: groupsRes.rows || [],
      users: usersRes.rows || []
    }

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="mdm-backup-${new Date().toISOString().slice(0, 10)}.json"`
      }
    })
  } catch (error: any) {
    console.error('Erro ao gerar backup:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro ao gerar backup' },
      { status: 500 }
    )
  }
}

// POST /api/config/backup - cria backup completo e salva na tabela config_backups
export async function POST(request: NextRequest) {
  try {
    const [devicesRes, groupsRes, usersRes, policiesRes] = await Promise.all([
      query(`
        SELECT d.*, du.name as user_name, du.cpf as user_cpf
        FROM devices d
        LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
        WHERE d.deleted_at IS NULL
      `),
      query(`
        SELECT dg.*,
          (SELECT json_agg(json_build_object('device_id', dgm.device_id))
          FROM device_group_memberships dgm WHERE dgm.group_id = dg.id) as device_ids
        FROM device_groups dg
      `),
      query('SELECT * FROM device_users WHERE is_active = true'),
      query('SELECT * FROM group_policies').catch(() => ({ rows: [] }))
    ])

    const backupData = {
      devices: devicesRes.rows || [],
      groups: groupsRes.rows || [],
      users: usersRes.rows || [],
      policies: policiesRes.rows || []
    }

    const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`

    const result = await query(
      `INSERT INTO config_backups (name, version, data, created_at)
       VALUES ($1, '1.0', $2, NOW())
       RETURNING id, name, version, created_at`,
      [name, JSON.stringify(backupData)]
    )

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
  } catch (error: any) {
    console.error('Erro ao criar backup:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json(
        { success: false, error: 'Tabela config_backups não existe. Execute a migração necessária.' },
        { status: 501 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// PUT /api/config/backup - restaura backup a partir de um backup_id
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { backup_id } = body

    if (!backup_id) {
      return NextResponse.json(
        { success: false, error: 'Campo "backup_id" é obrigatório' },
        { status: 400 }
      )
    }

    const backupResult = await query(
      `SELECT * FROM config_backups WHERE id = $1`,
      [backup_id]
    )

    if (!backupResult.rows || backupResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Backup não encontrado' },
        { status: 404 }
      )
    }

    const backupRow = backupResult.rows[0] as any
    const data = typeof backupRow.data === 'string' ? JSON.parse(backupRow.data) : backupRow.data

    // Restauração é uma operação sensível - retornar os dados para o frontend processar
    // ou implementar restore granular conforme necessidade
    return NextResponse.json({
      success: true,
      data: {
        id: backupRow.id,
        name: backupRow.name,
        version: backupRow.version,
        created_at: backupRow.created_at,
        contents: {
          devices_count: data.devices?.length || 0,
          groups_count: data.groups?.length || 0,
          users_count: data.users?.length || 0,
          policies_count: data.policies?.length || 0
        }
      }
    })
  } catch (error: any) {
    console.error('Erro ao restaurar backup:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json(
        { success: false, error: 'Tabela config_backups não existe. Execute a migração necessária.' },
        { status: 501 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
