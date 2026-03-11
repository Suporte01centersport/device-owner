import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// @ts-ignore
import { query, transaction } from '../../../server/database/config'

// GET /api/device-users - lista usuários com seus dispositivos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'

    // Verificar quais colunas existem para evitar erro de coluna inexistente
    const colCheck = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'device_users'
    `)
    const existingCols: Set<string> = new Set((colCheck.rows as any[]).map((r: any) => r.column_name))

    const baseCols = ['du.id', 'du.user_id', 'du.name', 'du.cpf', 'du.is_active', 'du.created_at', 'du.updated_at']
    const optionalCols = ['birth_date', 'birth_year', 'device_model', 'device_serial_number', 'role', 'unlock_password', 'leader_type', 'email', 'phone', 'department', 'position']
    for (const col of optionalCols) {
      if (existingCols.has(col)) baseCols.push(`du.${col}`)
    }

    let sql = `
      SELECT
        ${baseCols.join(', ')},
        COUNT(d.id) AS devices_count,
        COALESCE(array_agg(d.device_id) FILTER (WHERE d.id IS NOT NULL), '{}') AS device_ids
      FROM device_users du
      LEFT JOIN devices d ON d.assigned_device_user_id = du.id
      ${activeOnly ? 'WHERE du.is_active = true' : ''}
      GROUP BY du.id ORDER BY du.name ASC
    `

    const res = await query(sql)

    // Preencher colunas ausentes com valores padrão
    if (res?.rows) {
      res.rows = res.rows.map((r: any) => ({
        birth_date: null, birth_year: null, device_model: null, device_serial_number: null,
        role: 'operador', unlock_password: null, leader_type: null,
        email: null, phone: null, department: null, position: null,
        ...r
      }))
    }

    return NextResponse.json({
      success: true,
      data: res.rows,
      users: res.rows
    })
  } catch (error: any) {
    console.error('Erro ao listar device-users:', error?.message || error)
    const msg = String(error?.message || error).toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('connection') || msg.includes('econnrefused') || msg.includes('password') || msg.includes('timeout')) {
      return NextResponse.json({ success: true, data: [], users: [] })
    }
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor',
      detail: error?.message || String(error)
    }, { status: 500 })
  }
}

// PUT /api/device-users - criar/atualizar múltiplos usuários (bulk upsert)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { users } = body || {}

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Lista de usuários é obrigatória' },
        { status: 400 }
      )
    }

    // Buscar organização padrão
    const orgResult = await query('SELECT id FROM organizations WHERE slug = $1', ['default'])
    if (!orgResult.rows || orgResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Organização padrão não encontrada' },
        { status: 500 }
      )
    }

    const firstRow = orgResult.rows[0] as any
    if (!firstRow || !firstRow.id) {
      return NextResponse.json(
        { success: false, error: 'Organização padrão inválida' },
        { status: 500 }
      )
    }
    const organizationId = firstRow.id

    // Verificar quais colunas existem
    const colCheck = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'device_users'
    `)
    const existingCols: Set<string> = new Set((colCheck.rows as any[]).map((r: any) => r.column_name))
    const hasRole = existingCols.has('role')
    const hasUnlockPassword = existingCols.has('unlock_password')
    const hasBirthDate = existingCols.has('birth_date')
    const hasBirthYear = existingCols.has('birth_year')
    const hasDeviceModel = existingCols.has('device_model')
    const hasDeviceSerial = existingCols.has('device_serial_number')

    const results = await transaction(async (client: any) => {
      const savedUsers = []

      for (const user of users) {
        const { id: userId, name, cpf, birth_date, birth_year, device_model, device_serial_number, role, unlock_password, leader_type } = user || {}

        if (!userId || !name || !cpf) {
          console.warn('Usuário inválido ignorado:', user)
          continue
        }

        const cleanCpf = (typeof cpf === 'string' ? cpf : String(cpf || '')).replace(/\D/g, '')
        const userRole = (role === 'líder' || role === 'operador') ? role : 'operador'
        const pwd = (hasUnlockPassword && unlock_password && userRole === 'líder') ? String(unlock_password).trim().slice(0, 10) : null
        const model = (hasDeviceModel && device_model) ? String(device_model).trim() : null
        const serial = (hasDeviceSerial && device_serial_number) ? String(device_serial_number).trim() : null

        // birth_date como string 'YYYY-MM-DD' ou null
        let birthDateVal: string | null = null
        if (hasBirthDate && birth_date) {
          birthDateVal = String(birth_date).trim()
        }

        // Fallback: se não tem birth_date mas tem birth_year
        let birthYearVal: number | null = null
        if (hasBirthYear && birth_year != null) {
          birthYearVal = parseInt(String(birth_year), 10)
          if (isNaN(birthYearVal)) birthYearVal = null
        }

        const cols = ['organization_id', 'user_id', 'name', 'cpf', 'is_active']
        const vals: any[] = [organizationId, userId, name, cleanCpf, true]
        const updateSet = ['name = EXCLUDED.name', 'cpf = EXCLUDED.cpf', 'updated_at = NOW()']

        if (hasBirthDate) {
          cols.push('birth_date')
          vals.push(birthDateVal)
          updateSet.push('birth_date = EXCLUDED.birth_date')
        }
        if (hasBirthYear) {
          cols.push('birth_year')
          vals.push(birthYearVal)
          updateSet.push('birth_year = EXCLUDED.birth_year')
        }
        if (hasDeviceModel) { cols.push('device_model'); vals.push(model); updateSet.push('device_model = EXCLUDED.device_model') }
        if (hasDeviceSerial) { cols.push('device_serial_number'); vals.push(serial); updateSet.push('device_serial_number = EXCLUDED.device_serial_number') }
        if (hasRole) { cols.push('role'); vals.push(userRole); updateSet.push('role = EXCLUDED.role') }
        if (hasUnlockPassword) { cols.push('unlock_password'); vals.push(pwd); updateSet.push('unlock_password = EXCLUDED.unlock_password') }
        const hasLeaderType = existingCols.has('leader_type')
        if (hasLeaderType) {
          const lt = (userRole === 'líder' && leader_type) ? String(leader_type).trim() : null
          cols.push('leader_type'); vals.push(lt); updateSet.push('leader_type = EXCLUDED.leader_type')
        }

        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
        const sql = `
          INSERT INTO device_users (${cols.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (user_id) DO UPDATE SET ${updateSet.join(', ')}
          RETURNING *
        `
        const upsertResult = await client.query(sql, vals)

        if (upsertResult.rows && upsertResult.rows.length > 0) {
          savedUsers.push(upsertResult.rows[0])
        }
      }

      return savedUsers
    })

    return NextResponse.json({
      success: true,
      count: results.length,
      data: results
    })

  } catch (error: any) {
    console.error('Erro ao salvar device-users:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor',
      detail: error?.message || String(error)
    }, { status: 500 })
  }
}
