import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// Configuração do pool de conexão
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mdmweb',
  password: process.env.DB_PASSWORD || '2486',
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

// GET - Listar todos os usuários
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const active = searchParams.get('active') // Filtrar por ativo/inativo
    const search = searchParams.get('search') // Buscar por nome ou CPF

    let query = `
      SELECT 
        id,
        user_id,
        name,
        cpf,
        email,
        phone,
        department,
        position,
        notes,
        is_active,
        created_at,
        updated_at,
        (SELECT COUNT(*) FROM devices WHERE assigned_device_user_id = device_users.id) as devices_count
      FROM device_users
      WHERE 1=1
    `
    
    const params: any[] = []
    let paramIndex = 1

    // Filtrar por status ativo
    if (active !== null) {
      query += ` AND is_active = $${paramIndex}`
      params.push(active === 'true')
      paramIndex++
    }

    // Buscar por nome ou CPF
    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR cpf ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    query += ' ORDER BY name ASC'

    const result = await pool.query(query, params)

    return NextResponse.json({
      success: true,
      users: result.rows,
      count: result.rows.length
    })

  } catch (error: any) {
    console.error('❌ Erro ao listar device_users:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Criar novo usuário
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, name, cpf, email, phone, department, position, notes, organization_id } = body

    // Validações básicas
    if (!user_id || !name || !cpf) {
      return NextResponse.json(
        { success: false, error: 'user_id, name e cpf são obrigatórios' },
        { status: 400 }
      )
    }

    // Buscar organização padrão se não fornecida
    let orgId = organization_id
    if (!orgId) {
      const orgResult = await pool.query('SELECT id FROM organizations LIMIT 1')
      if (orgResult.rows.length > 0) {
        orgId = orgResult.rows[0].id
      } else {
        // Criar organização padrão
        const newOrg = await pool.query(
          `INSERT INTO organizations (name, slug, description) 
           VALUES ($1, $2, $3) RETURNING id`,
          ['Organização Padrão', 'default', 'Organização criada automaticamente']
        )
        orgId = newOrg.rows[0].id
      }
    }

    // Inserir usuário
    const result = await pool.query(
      `INSERT INTO device_users (
        organization_id, user_id, name, cpf, email, phone, department, position, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [orgId, user_id, name, cpf, email, phone, department, position, notes]
    )

    console.log('✅ Device user criado:', result.rows[0].user_id)

    return NextResponse.json({
      success: true,
      user: result.rows[0]
    })

  } catch (error: any) {
    console.error('❌ Erro ao criar device_user:', error)
    
    // Tratar erro de duplicação
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'Usuário ou CPF já cadastrado' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Atualizar todos os usuários (bulk update)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { users } = body

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Array de usuários é obrigatório' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      // Buscar organização padrão
      const orgResult = await client.query('SELECT id FROM organizations LIMIT 1')
      let orgId = orgResult.rows.length > 0 ? orgResult.rows[0].id : null

      if (!orgId) {
        const newOrg = await client.query(
          `INSERT INTO organizations (name, slug, description) 
           VALUES ($1, $2, $3) RETURNING id`,
          ['Organização Padrão', 'default', 'Organização criada automaticamente']
        )
        orgId = newOrg.rows[0].id
      }

      const results = []

      for (const user of users) {
        const { id, user_id, name, cpf } = user
        
        // ✅ FIX: Aceitar tanto 'id' quanto 'user_id'
        const finalUserId = user_id || id
        
        if (!finalUserId || !name || !cpf) {
          console.log('⚠️ Usuário inválido ignorado:', { id, user_id, name, cpf })
          continue // Pular usuários inválidos
        }

        // Verificar se já existe (por user_id ou cpf)
        const existing = await client.query(
          'SELECT id FROM device_users WHERE user_id = $1 OR cpf = $2',
          [finalUserId, cpf]
        )

        if (existing.rows.length > 0) {
          // Atualizar existente
          const result = await client.query(
            `UPDATE device_users 
             SET name = $1, cpf = $2, user_id = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [name, cpf, finalUserId, existing.rows[0].id]
          )
          results.push({ action: 'updated', user: result.rows[0] })
        } else {
          // Criar novo
          const result = await client.query(
            `INSERT INTO device_users (organization_id, user_id, name, cpf)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [orgId, finalUserId, name, cpf]
          )
          results.push({ action: 'created', user: result.rows[0] })
        }
      }

      await client.query('COMMIT')

      console.log(`✅ Bulk update concluído: ${results.length} usuários processados`)

      return NextResponse.json({
        success: true,
        results,
        count: results.length
      })

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

  } catch (error: any) {
    console.error('❌ Erro no bulk update:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Remover usuário (não usado normalmente, apenas desativar)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID é obrigatório' },
        { status: 400 }
      )
    }

    // Desativar ao invés de deletar (soft delete)
    const result = await pool.query(
      'UPDATE device_users SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    console.log('✅ Device user desativado:', id)

    return NextResponse.json({
      success: true,
      user: result.rows[0]
    })

  } catch (error: any) {
    console.error('❌ Erro ao desativar device_user:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

