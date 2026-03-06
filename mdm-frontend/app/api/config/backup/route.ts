import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
// @ts-ignore
import { query } from '../../../../server/database/config'

export async function GET() {
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
