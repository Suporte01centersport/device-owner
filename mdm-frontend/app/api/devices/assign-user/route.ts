import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mdmweb',
  password: process.env.DB_PASSWORD || '2486',
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

// POST - Vincular dispositivo a usuário
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, deviceUserId } = body

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'deviceId é obrigatório' },
        { status: 400 }
      )
    }

    // Verificar se o dispositivo existe no banco
    const checkResult = await pool.query(
      'SELECT id, device_id, name, assigned_device_user_id FROM devices WHERE device_id = $1',
      [deviceId]
    )

    // ✅ VERIFICAR SE USUÁRIO JÁ ESTÁ VINCULADO A OUTRO DISPOSITIVO (IMPEDIR VINCULAÇÃO)
    if (deviceUserId) {
      const conflictCheck = await pool.query(
        `SELECT d.device_id, d.name 
         FROM devices d
         WHERE d.assigned_device_user_id = $1 AND d.device_id != $2`,
        [deviceUserId, deviceId]
      )
      
      if (conflictCheck.rows.length > 0) {
        // Usuário está vinculado a outro(s) dispositivo(s) - IMPEDIR VINCULAÇÃO
        const conflictInfo: {
          userId: any
          otherDevices: { deviceId: any; name: any }[]
          userName?: string
          userCustomId?: string
        } = {
          userId: deviceUserId,
          otherDevices: conflictCheck.rows.map((r: any) => ({
            deviceId: r.device_id,
            name: r.name
          }))
        }
        
        // Buscar nome do usuário
        const userInfo = await pool.query(
          'SELECT name, user_id FROM device_users WHERE id = $1',
          [deviceUserId]
        )
        if (userInfo.rows.length > 0) {
          conflictInfo.userName = userInfo.rows[0].name
          conflictInfo.userCustomId = userInfo.rows[0].user_id
        }
        
        console.log(`⚠️ Usuário ${conflictInfo.userName} já está vinculado a outro(s) dispositivo(s). Vinculação IMPEDIDA.`)
        
        // ✅ RETORNAR ERRO COM INFORMAÇÕES DO CONFLITO (não transferir automaticamente)
        return NextResponse.json(
          {
            success: false,
            error: 'Usuário já vinculado',
            conflict: conflictInfo,
            message: `O usuário ${conflictInfo.userName} já está vinculado a outro dispositivo. Desvincule primeiro para vincular a este dispositivo.`
          },
          { status: 409 } // 409 Conflict
        )
      }
    }

    let device: any

    if (checkResult.rows.length === 0) {
      // Dispositivo não existe, criar um registro básico
      console.log(`⚠️ Dispositivo ${deviceId} não encontrado no banco, criando registro básico...`)
      const orgResult = await pool.query(
        'SELECT id FROM organizations WHERE slug = $1',
        ['default']
      )
      
      if (orgResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Organização padrão não encontrada' },
          { status: 500 }
        )
      }

      const insertResult = await pool.query(
        `INSERT INTO devices (organization_id, device_id, name, status, assigned_device_user_id, last_seen)
         VALUES ($1, $2, $3, 'online', $4, NOW())
         RETURNING id, device_id, name, assigned_device_user_id`,
        [orgResult.rows[0].id, deviceId, deviceId, deviceUserId || null]
      )
      
      device = insertResult.rows[0]
    } else {
      // Dispositivo existe, atualizar vínculo
      const result = await pool.query(
        `UPDATE devices 
         SET assigned_device_user_id = $1, updated_at = NOW()
         WHERE device_id = $2
         RETURNING id, device_id, name, assigned_device_user_id`,
        [deviceUserId || null, deviceId]
      )
      device = result.rows[0]
    }

    // Buscar dados do usuário vinculado (se houver)
    let userData = null
    if (device.assigned_device_user_id) {
      const userResult = await pool.query(
        'SELECT id, user_id, name, cpf FROM device_users WHERE id = $1',
        [device.assigned_device_user_id]
      )
      if (userResult.rows.length > 0) {
        userData = userResult.rows[0]
      }
    }

    const action = deviceUserId ? 'vinculado' : 'desvinculado'
    console.log(`✅ Dispositivo ${deviceId} ${action}${userData ? ` ao usuário ${userData.name}` : ''}`)

    return NextResponse.json({
      success: true,
      device: {
        ...device,
        assignedUser: userData
      },
      message: `Dispositivo ${action} com sucesso`
    })

  } catch (error: any) {
    console.error('❌ Erro ao vincular dispositivo:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// GET - Buscar dispositivos de um usuário
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') // ID UUID do device_user
    const deviceId = searchParams.get('deviceId') // device_id do dispositivo

    if (userId) {
      // Buscar todos os dispositivos vinculados a um usuário
      const result = await pool.query(
        `SELECT 
          d.*,
          du.user_id as assigned_user_id,
          du.name as assigned_user_name,
          du.cpf as assigned_user_cpf
         FROM devices d
         LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
         WHERE d.assigned_device_user_id = $1
         ORDER BY d.name`,
        [userId]
      )

      return NextResponse.json({
        success: true,
        devices: result.rows,
        count: result.rows.length
      })
    }

    if (deviceId) {
      // Buscar usuário vinculado a um dispositivo específico
      const result = await pool.query(
        `SELECT 
          d.id as device_id,
          d.device_id,
          d.name as device_name,
          du.id as user_uuid,
          du.user_id,
          du.name,
          du.cpf,
          du.email,
          du.phone,
          du.department,
          du.position
         FROM devices d
         LEFT JOIN device_users du ON d.assigned_device_user_id = du.id
         WHERE d.device_id = $1`,
        [deviceId]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Dispositivo não encontrado' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        device: result.rows[0]
      })
    }

    return NextResponse.json(
      { success: false, error: 'userId ou deviceId é obrigatório' },
      { status: 400 }
    )

  } catch (error: any) {
    console.error('❌ Erro ao buscar vínculo:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


