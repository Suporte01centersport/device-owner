import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import DeviceGroupModel from '../../../server/database/models/DeviceGroup.js'

// GET /api/groups - listar grupos
export async function GET() {
  try {
    const rows = await DeviceGroupModel.findAll()
    const data = (rows || []).map((g: any) => ({
      id: g.id?.toString?.() || g.id,
      name: g.name,
      description: g.description || '',
      color: g.color || '#3B82F6',
      deviceCount: Number(g.device_count || g.deviceCount || 0),
      devices: [],
      appPolicies: [],
      allowedNetworks: g.allowed_networks || [],
      allowedLocation: g.allowed_location || null,
      createdAt: g.created_at || g.createdAt || new Date().toISOString(),
      updatedAt: g.updated_at || g.updatedAt || new Date().toISOString()
    }))

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Erro ao listar grupos:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}

// POST /api/groups - criar grupo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, color } = body || {}

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Nome do grupo é obrigatório' },
        { status: 400 }
      )
    }

    const created = await DeviceGroupModel.create({ name, description, color })

    const group = {
      id: created.id?.toString?.() || created.id,
      name: created.name,
      description: created.description || '',
      color: created.color || '#3B82F6',
      deviceCount: 0,
      devices: [],
      appPolicies: [],
      createdAt: created.created_at || created.createdAt || new Date().toISOString(),
      updatedAt: created.updated_at || created.updatedAt || new Date().toISOString()
    }

    return NextResponse.json({ success: true, data: group }, { status: 201 })
  } catch (error: any) {
    console.error('Erro ao criar grupo:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}


