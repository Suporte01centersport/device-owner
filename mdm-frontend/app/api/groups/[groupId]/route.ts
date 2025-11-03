import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import DeviceGroupModel from '../../../../server/database/models/DeviceGroup.js'

// DELETE /api/groups/[groupId] - remover grupo e associações
export async function DELETE(
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

    const result = await DeviceGroupModel.delete(groupId)
    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('Erro ao deletar grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}




