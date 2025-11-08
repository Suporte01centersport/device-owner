import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import '../../../../../server/load-env.js'
import { query } from '../../../../../server/database/config.js'

// GET - Buscar grupos aos quais um dispositivo pertence e suas políticas
export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const { deviceId } = params

    if (!deviceId) {
      return NextResponse.json(
        { success: false, detail: 'ID do dispositivo é obrigatório' },
        { status: 400 }
      )
    }

    // Buscar grupos do dispositivo e políticas de apps de cada grupo
    const result = await query(`
      SELECT 
        dg.id as group_id,
        dg.name as group_name,
        dg.color as group_color,
        ap.package_name,
        ap.app_name,
        ap.policy_type
      FROM device_group_memberships dgm
      JOIN device_groups dg ON dgm.group_id = dg.id
      LEFT JOIN app_policies ap ON dg.id = ap.group_id
      JOIN devices d ON dgm.device_id = d.id
      WHERE d.device_id = $1
      ORDER BY dg.name ASC, ap.app_name ASC
    `, [deviceId])

    // Agrupar por grupo
    const groupsMap = new Map()
    result.rows.forEach((row: any) => {
      const groupId = row.group_id
      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          id: groupId,
          name: row.group_name,
          color: row.group_color,
          policies: [] as Array<{ packageName: string; appName: string; policyType: string }>
        })
      }

      if (row.package_name) {
        const group = groupsMap.get(groupId)
        group.policies.push({
          packageName: row.package_name,
          appName: row.app_name,
          policyType: row.policy_type
        })
      }
    })

    const groups = Array.from(groupsMap.values())
    
    // Consolidar todos os packageNames das políticas (apps que estão em políticas de grupo)
    const groupPolicyApps = new Set<string>()
    groups.forEach((group: any) => {
      group.policies.forEach((policy: any) => {
        if (policy.packageName) {
          groupPolicyApps.add(policy.packageName)
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        groups: groups,
        groupPolicyApps: Array.from(groupPolicyApps) // Lista de packageNames que estão em políticas de grupo
      }
    })
  } catch (error: any) {
    console.error('Erro ao buscar grupos do dispositivo:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao buscar grupos do dispositivo' },
      { status: 500 }
    )
  }
}


