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

    let sql = `
      SELECT 
        du.id,
        du.user_id,
        du.name,
        du.cpf,
        du.birth_year,
        du.device_model,
        du.device_serial_number,
        du.role,
        du.unlock_password,
        du.email,
        du.phone,
        du.department,
        du.position,
        du.is_active,
        du.created_at,
        du.updated_at,
        COUNT(d.id) AS devices_count,
        COALESCE(array_agg(d.device_id) FILTER (WHERE d.id IS NOT NULL), '{}') AS device_ids
      FROM device_users du
      LEFT JOIN devices d ON d.assigned_device_user_id = du.id
    `
    
    if (activeOnly) {
      sql += ` WHERE du.is_active = true`
    }
    
    sql += ` GROUP BY du.id ORDER BY du.name ASC`
    
    let res
    try {
      res = await query(sql)
    } catch (colErr: any) {
      const errMsg = String(colErr?.message || '')
      // Fallback se colunas não existirem (migrations não rodaram)
      if (errMsg.includes('birth_year') || errMsg.includes('device_model') || errMsg.includes('device_serial_number') || errMsg.includes('role') || errMsg.includes('unlock_password')) {
        let sqlFallback = `
          SELECT 
            du.id, du.user_id, du.name, du.cpf, du.email, du.phone, du.department, du.position,
            du.is_active, du.created_at, du.updated_at,
            COUNT(d.id) AS devices_count,
            COALESCE(array_agg(d.device_id) FILTER (WHERE d.id IS NOT NULL), '{}') AS device_ids
          FROM device_users du
          LEFT JOIN devices d ON d.assigned_device_user_id = du.id
          ${activeOnly ? 'WHERE du.is_active = true' : ''}
          GROUP BY du.id ORDER BY du.name ASC
        `
        try {
          res = await query(sqlFallback.trim())
        } catch (fallbackErr: any) {
          throw colErr
        }
        if (res?.rows) {
          res.rows = res.rows.map((r: any) => ({
            ...r,
            birth_year: r.birth_year ?? null,
            device_model: r.device_model ?? null,
            device_serial_number: r.device_serial_number ?? null,
            role: r.role ?? 'operador',
            unlock_password: r.unlock_password ?? null
          }))
        }
      } else {
        throw colErr
      }
    }
    
    // Compatibilidade: retornar tanto 'data' quanto 'users' para compatibilidade
    return NextResponse.json({ 
      success: true, 
      data: res.rows,
      users: res.rows // Para compatibilidade com código antigo
    })
  } catch (error: any) {
    console.error('Erro ao listar device-users:', error?.message || error)
    // Se tabela não existe ou conexão falhou, retornar lista vazia para permitir uso do formulário
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
    
    // Garantir que temos um objeto válido com id (type assertion para resolver inferência do TypeScript)
    const firstRow = orgResult.rows[0] as any
    if (!firstRow || !firstRow.id) {
      return NextResponse.json(
        { success: false, error: 'Organização padrão inválida' },
        { status: 500 }
      )
    }
    const organizationId = firstRow.id

    // Verificar quais colunas existem ANTES da transação para evitar abort de transação
    const colCheck = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'device_users'
    `)
    const existingCols: Set<string> = new Set((colCheck.rows as any[]).map((r: any) => r.column_name))
    const hasRole = existingCols.has('role')
    const hasUnlockPassword = existingCols.has('unlock_password')
    const hasBirthYear = existingCols.has('birth_year')
    const hasDeviceModel = existingCols.has('device_model')
    const hasDeviceSerial = existingCols.has('device_serial_number')

    // Usar transação para garantir consistência
    const results = await transaction(async (client) => {
      const savedUsers = []

      for (const user of users) {
        const { id: userId, name, cpf, birth_year, device_model, device_serial_number, role, unlock_password } = user || {}

        if (!userId || !name || !cpf) {
          console.warn('Usuário inválido ignorado:', user)
          continue
        }

        const cleanCpf = (typeof cpf === 'string' ? cpf : String(cpf || '')).replace(/\D/g, '')
        const birthYear = (hasBirthYear && birth_year != null) ? parseInt(String(birth_year), 10) : null
        const model = (hasDeviceModel && device_model) ? String(device_model).trim() : null
        const serial = (hasDeviceSerial && device_serial_number) ? String(device_serial_number).trim() : null
        const userRole = (role === 'líder' || role === 'operador') ? role : 'operador'
        const pwd = (hasUnlockPassword && unlock_password && userRole === 'líder') ? String(unlock_password).trim().slice(0, 10) : null

        // Construir INSERT dinamicamente com base nas colunas que existem
        const cols = ['organization_id', 'user_id', 'name', 'cpf', 'is_active']
        const vals: any[] = [organizationId, userId, name, cleanCpf, true]
        const updateSet = ['name = EXCLUDED.name', 'cpf = EXCLUDED.cpf', 'updated_at = NOW()']

        if (hasBirthYear) { cols.push('birth_year'); vals.push(birthYear); updateSet.push('birth_year = COALESCE(EXCLUDED.birth_year, device_users.birth_year)') }
        if (hasDeviceModel) { cols.push('device_model'); vals.push(model); updateSet.push('device_model = COALESCE(EXCLUDED.device_model, device_users.device_model)') }
        if (hasDeviceSerial) { cols.push('device_serial_number'); vals.push(serial); updateSet.push('device_serial_number = COALESCE(EXCLUDED.device_serial_number, device_users.device_serial_number)') }
        if (hasRole) { cols.push('role'); vals.push(userRole); updateSet.push('role = COALESCE(EXCLUDED.role, device_users.role)') }
        if (hasUnlockPassword) { cols.push('unlock_password'); vals.push(pwd); updateSet.push('unlock_password = COALESCE(EXCLUDED.unlock_password, device_users.unlock_password)') }

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

