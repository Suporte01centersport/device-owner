import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
import DeviceGroupModel from '../../../../server/database/models/DeviceGroup.js'

// DELETE /api/groups/delete-all - excluir todos os grupos e políticas
export async function DELETE() {
  try {
    const result = await DeviceGroupModel.deleteAll()
    return NextResponse.json({
      success: true,
      message: `${result.deletedCount} grupo(s) e suas políticas foram excluídos`,
      deletedCount: result.deletedCount
    })
  } catch (error: any) {
    console.error('Erro ao excluir todos os grupos:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro ao excluir grupos', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
