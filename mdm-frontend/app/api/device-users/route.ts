import { NextRequest, NextResponse } from 'next/server'
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
    
    const res = await query(sql)
    
    // Compatibilidade: retornar tanto 'data' quanto 'users' para compatibilidade
    return NextResponse.json({ 
      success: true, 
      data: res.rows,
      users: res.rows // Para compatibilidade com código antigo
    })
  } catch (error: any) {
    console.error('Erro ao listar device-users:', error?.message || error)
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
    
    // Garantir que temos um objeto válido com id
    const orgRow = orgResult.rows[0]
    if (!orgRow || !orgRow.id) {
      return NextResponse.json(
        { success: false, error: 'Organização padrão inválida' },
        { status: 500 }
      )
    }
    const organizationId = orgRow.id

    // Usar transação para garantir consistência
    const results = await transaction(async (client) => {
      const savedUsers = []
      
      for (const user of users) {
        const { id: userId, name, cpf } = user || {}
        
        if (!userId || !name || !cpf) {
          console.warn('Usuário inválido ignorado:', user)
          continue
        }

        // Limpar CPF (remover caracteres não numéricos)
        const cleanCpf = cpf.replace(/\D/g, '')

        // Upsert: criar ou atualizar
        const upsertResult = await client.query(`
          INSERT INTO device_users (
            organization_id, user_id, name, cpf, is_active
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            cpf = EXCLUDED.cpf,
            updated_at = NOW()
          RETURNING *
        `, [organizationId, userId, name, cleanCpf, true])

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

