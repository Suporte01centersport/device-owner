import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore
import { query, transaction } from '../../../../server/database/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// DELETE /api/device-users/[id] - excluir usuário
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'ID do usuário é obrigatório' },
        { status: 400 }
      )
    }

    // Transação: desvincular dispositivos e excluir usuário
    // Aceita tanto UUID (id) quanto user_id customizado
    const result = await transaction(async (client: any) => {
      // Descobrir o UUID real do usuário (pode ser passado como user_id ou UUID)
      const findUser = await client.query(
        `SELECT id FROM device_users WHERE id = $1 OR user_id = $1 LIMIT 1`,
        [userId]
      )
      const realUuid = findUser.rows[0]?.id || userId

      // 1. Desvincular todos os dispositivos vinculados a este usuário
      const unlinked = await client.query(
        `UPDATE devices SET assigned_device_user_id = NULL, updated_at = NOW()
         WHERE assigned_device_user_id = $1
         RETURNING device_id`,
        [realUuid]
      )

      // 2. Excluir o usuário
      const deleted = await client.query(
        `DELETE FROM device_users WHERE id = $1 RETURNING id, user_id, name`,
        [realUuid]
      )

      return {
        deletedUser: deleted.rows[0] || null,
        unlinkedDevices: unlinked.rows.map((r: any) => r.device_id)
      }
    })

    if (!result.deletedUser) {
      return NextResponse.json(
        { success: false, error: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    console.log(`🗑️ Usuário excluído: ${result.deletedUser.name} (${result.deletedUser.user_id})`)
    if (result.unlinkedDevices.length > 0) {
      console.log(`   Dispositivos desvinculados: ${result.unlinkedDevices.join(', ')}`)
    }

    return NextResponse.json({
      success: true,
      message: `Usuário ${result.deletedUser.name} excluído com sucesso`,
      deletedUser: result.deletedUser,
      unlinkedDevices: result.unlinkedDevices
    })

  } catch (error: any) {
    console.error('❌ Erro ao excluir usuário:', error?.message || error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// GET /api/device-users/[id] - buscar usuário específico
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id

    const result = await query(
      `SELECT du.*,
        COUNT(d.id) AS devices_count,
        COALESCE(array_agg(d.device_id) FILTER (WHERE d.id IS NOT NULL), '{}') AS device_ids
       FROM device_users du
       LEFT JOIN devices d ON d.assigned_device_user_id = du.id
       WHERE du.id = $1
       GROUP BY du.id`,
      [userId]
    )

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar usuário:', error?.message || error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
