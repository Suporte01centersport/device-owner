import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import '../../../../../server/load-env.js'
import DeviceGroupModel from '../../../../../server/database/models/DeviceGroup.js'

// GET - Buscar apps disponíveis do grupo (armazenados no banco)
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

    const apps = await DeviceGroupModel.getGroupAvailableApps(groupId)
    return NextResponse.json({ success: true, data: apps })
  } catch (error: any) {
    console.error('Erro ao buscar apps disponíveis do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao buscar apps do grupo' },
      { status: 500 }
    )
  }
}

// POST - Sincronizar apps disponíveis do grupo com base nos dispositivos
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()
    const { deviceApps } = body

    if (!groupId) {
      return NextResponse.json(
        { success: false, detail: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }

    if (!Array.isArray(deviceApps)) {
      return NextResponse.json(
        { success: false, detail: 'deviceApps deve ser um array' },
        { status: 400 }
      )
    }

    const result = await DeviceGroupModel.syncGroupAvailableApps(groupId, deviceApps)
    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('Erro ao sincronizar apps do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao sincronizar apps do grupo' },
      { status: 500 }
    )
  }
}


