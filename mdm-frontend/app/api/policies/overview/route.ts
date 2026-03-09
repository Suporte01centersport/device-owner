import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import DeviceGroupModel from '../../../../server/database/models/DeviceGroup.js'
import DeviceModel from '../../../../server/database/models/Device.js'

/**
 * GET /api/policies/overview
 * Retorna políticas de app (de todos os grupos) e dispositivos livres em uma única chamada.
 */
export async function GET() {
  try {
    const [groups, freeDevices] = await Promise.all([
      DeviceGroupModel.findAll(),
      DeviceModel.findFreeDevices()
    ])

    const appPolicies: Array<{
      id: string
      groupId: string
      groupName: string
      packageName: string
      appName: string
      policyType: string
      isAllowed: boolean
    }> = []

    for (const g of groups || []) {
      const groupId = g.id?.toString?.() || g.id
      const policies = await DeviceGroupModel.getGroupPolicies(groupId).catch(() => [])
      for (const p of policies || []) {
        appPolicies.push({
          id: p.id?.toString?.() || p.id,
          groupId,
          groupName: g.name || '',
          packageName: p.package_name || '',
          appName: p.app_name || '',
          policyType: p.policy_type || 'allow',
          isAllowed: p.policy_type !== 'block'
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        appPolicies,
        freeDevices,
        totalPolicies: appPolicies.length,
        totalFreeDevices: freeDevices.length
      }
    })
  } catch (error: any) {
    console.error('Erro ao buscar overview de políticas:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
