import { NextRequest, NextResponse } from 'next/server'

// POST - Adicionar dispositivo ao grupo
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()
    const { deviceId, assignedBy } = body

    if (!groupId || !deviceId) {
      return NextResponse.json(
        { success: false, error: 'ID do grupo e ID do dispositivo são obrigatórios' },
        { status: 400 }
      )
    }

    // const membership = await DeviceGroupModel.addDevice(groupId, deviceId, assignedBy || 'admin')

    // Mock para demonstração
    const membership = {
      id: `membership_${Date.now()}`,
      deviceId,
      groupId,
      assignedBy: assignedBy || 'admin',
      assignedAt: new Date().toISOString()
    }

    return NextResponse.json({ success: true, data: membership })
  } catch (error) {
    console.error('Erro ao adicionar dispositivo ao grupo:', error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Remover dispositivo do grupo
export async function DELETE(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    if (!groupId || !deviceId) {
      return NextResponse.json(
        { success: false, error: 'ID do grupo e ID do dispositivo são obrigatórios' },
        { status: 400 }
      )
    }

    // const removed = await DeviceGroupModel.removeDevice(groupId, deviceId)

    // Mock para demonstração
    const removed = true

    return NextResponse.json({ success: true, removed })
  } catch (error) {
    console.error('Erro ao remover dispositivo do grupo:', error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

// GET - Listar dispositivos do grupo
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

    // const devices = await DeviceGroupModel.getGroupDevices(groupId)

    // Mock para demonstração
    const devices = [
      {
        id: '1',
        deviceId: 'DEV001',
        name: 'Samsung Galaxy S21',
        status: 'online',
        lastSeen: Date.now(),
        assignedAt: new Date().toISOString(),
        assignedBy: 'admin'
      }
    ]

    return NextResponse.json({ success: true, data: devices })
  } catch (error) {
    console.error('Erro ao buscar dispositivos do grupo:', error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}







