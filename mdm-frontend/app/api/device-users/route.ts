import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../server/database/config'

// GET /api/device-users - lista usuários com seus dispositivos
export async function GET() {
  try {
    const sql = `
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
      GROUP BY du.id
      ORDER BY du.name ASC
    `
    const res = await query(sql)
    return NextResponse.json({ success: true, data: res.rows })
  } catch (error: any) {
    console.error('Erro ao listar device-users:', error?.message || error)
    return NextResponse.json({ success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) }, { status: 500 })
  }
}

