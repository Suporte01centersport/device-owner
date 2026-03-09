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

    // Usar transação para garantir consistência
    const results = await transaction(async (client) => {
      const savedUsers = []
      
      for (const user of users) {
        const { id: userId, name, cpf, birth_year, device_model, device_serial_number, role, unlock_password } = user || {}
        
        if (!userId || !name || !cpf) {
          console.warn('Usuário inválido ignorado:', user)
          continue
        }

        // Limpar CPF (remover caracteres não numéricos)
        const cleanCpf = (typeof cpf === 'string' ? cpf : String(cpf || '')).replace(/\D/g, '')
        const birthYear = birth_year != null ? parseInt(String(birth_year), 10) : null
        const model = device_model ? String(device_model).trim() : null
        const serial = device_serial_number ? String(device_serial_number).trim() : null
        const userRole = (role === 'líder' || role === 'operador') ? role : 'operador'
        const pwd = (unlock_password && userRole === 'líder') ? String(unlock_password).trim().slice(0, 10) : null

        // Upsert: criar ou atualizar (com role e unlock_password)
        let upsertResult
        try {
          upsertResult = await client.query(`
            INSERT INTO device_users (
              organization_id, user_id, name, cpf, birth_year, device_model, device_serial_number, role, unlock_password, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id) DO UPDATE SET
              name = EXCLUDED.name,
              cpf = EXCLUDED.cpf,
              birth_year = COALESCE(EXCLUDED.birth_year, device_users.birth_year),
              device_model = COALESCE(EXCLUDED.device_model, device_users.device_model),
              device_serial_number = COALESCE(EXCLUDED.device_serial_number, device_users.device_serial_number),
              role = COALESCE(EXCLUDED.role, device_users.role),
              unlock_password = COALESCE(EXCLUDED.unlock_password, device_users.unlock_password),
              updated_at = NOW()
            RETURNING *
          `, [organizationId, userId, name, cleanCpf, birthYear, model, serial, userRole, pwd, true])
        } catch (colErr: any) {
          const errMsg = String(colErr?.message || '')
          const colErrCode = String(colErr?.code || '')
          // Fallback se colunas não existirem (migrations não rodaram)
          if (colErrCode.includes('42703') || errMsg.includes('role') || errMsg.includes('unlock_password') || errMsg.includes('birth_year') || errMsg.includes('device_model') || errMsg.includes('device_serial_number')) {
            try {
              // Tentar sem role/unlock_password
              upsertResult = await client.query(`
                INSERT INTO device_users (
                  organization_id, user_id, name, cpf, birth_year, device_model, device_serial_number, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (user_id) DO UPDATE SET
                  name = EXCLUDED.name,
                  cpf = EXCLUDED.cpf,
                  birth_year = COALESCE(EXCLUDED.birth_year, device_users.birth_year),
                  device_model = COALESCE(EXCLUDED.device_model, device_users.device_model),
                  device_serial_number = COALESCE(EXCLUDED.device_serial_number, device_users.device_serial_number),
                  updated_at = NOW()
                RETURNING *
              `, [organizationId, userId, name, cleanCpf, birthYear, model, serial, true])
            } catch (innerErr: any) {
              const innerMsg = String(innerErr?.message || '')
              // Fallback mínimo: só colunas base (id, user_id, name, cpf, organization_id, is_active)
              if (innerMsg.includes('birth_year') || innerMsg.includes('device_model') || innerMsg.includes('device_serial_number')) {
                upsertResult = await client.query(`
                  INSERT INTO device_users (organization_id, user_id, name, cpf, is_active)
                  VALUES ($1, $2, $3, $4, $5)
                  ON CONFLICT (user_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    cpf = EXCLUDED.cpf,
                    updated_at = NOW()
                  RETURNING *
                `, [organizationId, userId, name, cleanCpf, true])
                if (upsertResult.rows?.[0]) {
                  (upsertResult.rows[0] as any).birth_year = birthYear
                  ;(upsertResult.rows[0] as any).device_model = model
                  ;(upsertResult.rows[0] as any).device_serial_number = serial
                  ;(upsertResult.rows[0] as any).role = userRole
                  ;(upsertResult.rows[0] as any).unlock_password = pwd
                }
              } else {
                throw innerErr
              }
            }
          } else {
            throw colErr
          }
        }

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

