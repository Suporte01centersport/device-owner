import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import DeviceGroupModel from '../../../../../server/database/models/DeviceGroup.js'

// GET /api/groups/[groupId]/stats - estatísticas do grupo
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    if (!groupId) {
      return NextResponse.json(
        { success: false, error: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }
    const stats = await DeviceGroupModel.getGroupStats(groupId)
    return NextResponse.json({ success: true, data: stats })
  } catch (error: any) {
    console.error('Erro ao obter estatísticas do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}



