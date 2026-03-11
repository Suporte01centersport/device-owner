import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import DeviceModel from '../../../../server/database/models/Device.js'
import { query } from '../../../../server/database/config.js'

// DELETE /api/devices/[deviceId] - deletar dispositivo (fallback quando WebSocket não conectado)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params

    if (!deviceId || deviceId === 'null' || deviceId === 'undefined') {
      return NextResponse.json(
        { success: false, error: 'ID do dispositivo inválido' },
        { status: 400 }
      )
    }

    await DeviceModel.delete(deviceId)

    // Persistir na tabela de dispositivos deletados para bloquear reconexão
    try {
      await query(`INSERT INTO deleted_devices (device_id) VALUES ($1) ON CONFLICT (device_id) DO NOTHING`, [deviceId])
    } catch (e) {
      console.error('Falha ao persistir dispositivo deletado:', e)
    }

    return NextResponse.json({
      success: true,
      message: 'Dispositivo deletado com sucesso',
      deviceId
    })
  } catch (error: any) {
    console.error('Erro ao deletar dispositivo:', error?.message || error)
    const isNotFound = error?.message?.includes('não encontrado')
    return NextResponse.json(
      {
        success: false,
        error: isNotFound ? 'Dispositivo não encontrado' : 'Erro ao deletar dispositivo',
        detail: error?.message
      },
      { status: isNotFound ? 404 : 500 }
    )
  }
}
