import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
// @ts-ignore
require('dotenv').config()
import DeviceGroupModel from '../../../../../server/database/models/DeviceGroup.js'

// GET /api/groups/[groupId]/restrictions - Obter restrições do grupo
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params

    if (!groupId) {
      return NextResponse.json(
        { success: false, detail: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }

    const restrictions = await DeviceGroupModel.getRestrictions(groupId)

    return NextResponse.json({
      success: true,
      data: {
        allowedNetworks: restrictions.allowed_networks || [],
        allowedLocation: restrictions.allowed_location || null
      }
    })
  } catch (error: any) {
    console.error('Erro ao buscar restrições do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao buscar restrições' },
      { status: 500 }
    )
  }
}

// PUT /api/groups/[groupId]/restrictions - Atualizar restrições do grupo
export async function PUT(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()
    const { allowedNetworks, allowedLocation } = body

    if (!groupId) {
      return NextResponse.json(
        { success: false, detail: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }

    const updateData: any = {}

    if (allowedNetworks !== undefined) {
      updateData.allowed_networks = Array.isArray(allowedNetworks) ? allowedNetworks : []
    }

    if (allowedLocation !== undefined) {
      updateData.allowed_location = allowedLocation || null
    }

    const updated = await DeviceGroupModel.update(groupId, updateData)

    return NextResponse.json({
      success: true,
      data: {
        allowedNetworks: updated.allowed_networks || [],
        allowedLocation: updated.allowed_location || null
      }
    })
  } catch (error: any) {
    console.error('Erro ao atualizar restrições do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao atualizar restrições' },
      { status: 500 }
    )
  }
}

