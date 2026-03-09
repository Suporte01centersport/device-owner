import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import DeviceModel from '../../../../server/database/models/Device.js'

// GET /api/devices/free - dispositivos que não estão em nenhum grupo
export async function GET() {
  try {
    const devices = await DeviceModel.findFreeDevices()
    return NextResponse.json({ success: true, data: devices })
  } catch (error: any) {
    console.error('Erro ao listar dispositivos livres:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
