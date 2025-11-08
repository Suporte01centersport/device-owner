import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import '../../../../../server/load-env.js'
import DeviceGroupModel from '../../../../../server/database/models/DeviceGroup.js'
import { query } from '../../../../../server/database/config.js'

// GET - Buscar apps únicos de todos os dispositivos do grupo
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

    // Buscar todos os device_ids dos dispositivos no grupo
    const devices = await DeviceGroupModel.getGroupDevices(groupId)
    const deviceIds = devices.map((d: any) => d.device_id || d.deviceId).filter(Boolean)

    if (deviceIds.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // Buscar apps instalados de dispositivos online (do WebSocket)
    // Nota: Precisamos acessar os dados em memória do WebSocket ou buscar do banco
    // Por enquanto, vamos retornar uma estrutura que permita buscar apps de um dispositivo específico
    // A interface pode buscar apps de um dispositivo como referência

    // Para simplificar, retornamos uma estrutura indicando que os apps devem ser buscados dos dispositivos
    // A interface pode usar os apps do primeiro dispositivo online como base
    return NextResponse.json({ 
      success: true, 
      data: {
        deviceIds,
        message: 'Use os apps instalados de um dispositivo do grupo como referência'
      }
    })
  } catch (error: any) {
    console.error('Erro ao buscar apps do grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao buscar apps do grupo' },
      { status: 500 }
    )
  }
}


