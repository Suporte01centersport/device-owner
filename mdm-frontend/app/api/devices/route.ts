import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import DeviceModel from '../../../server/database/models/Device.js'

// GET /api/devices - lista inventário de dispositivos
export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('search') || undefined
    const status = request.nextUrl.searchParams.get('status') || undefined
    const limit = request.nextUrl.searchParams.get('limit')
    const offset = request.nextUrl.searchParams.get('offset')

    const filters: any = {}
    if (search) filters.search = search
    if (status) filters.status = status
    if (limit) filters.limit = Number(limit)
    if (offset) filters.offset = Number(offset)

    const devices = await DeviceModel.findAll(undefined, filters)
    return NextResponse.json({ success: true, data: devices })
  } catch (error: any) {
    console.error('Erro ao listar dispositivos:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}


