import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
import DeviceGroupModel from '../../../../server/database/models/DeviceGroup.js'

const DEFAULT_GROUPS = [
  {
    name: 'Full',
    description: 'Grupo com acesso completo a todos os recursos',
    color: '#2563EB' // Azul
  },
  {
    name: 'Separação de pedidos',
    description: 'Equipe de separação e preparação de pedidos',
    color: '#059669' // Verde
  },
  {
    name: 'Estoque',
    description: 'Controle de estoque e inventário com dispositivos móveis',
    color: '#7C3AED' // Roxo
  }
]

// POST /api/groups/seed - cria grupos padrão se não existirem
export async function POST() {
  try {
    const existing = await DeviceGroupModel.findAll()
    const existingNames = new Set((existing || []).map((g: any) => (g.name || '').toLowerCase()))

    const created: any[] = []
    for (const group of DEFAULT_GROUPS) {
      if (!existingNames.has(group.name.toLowerCase())) {
        const g = await DeviceGroupModel.create(group)
        created.push(Array.isArray(g) ? g[0] : g)
        existingNames.add(group.name.toLowerCase())
      }
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      message: created.length > 0 ? `${created.length} grupo(s) criado(s)` : 'Grupos já existem'
    })
  } catch (error: any) {
    console.error('Erro ao criar grupos padrão:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Erro ao criar grupos', detail: error?.message || String(error) },
      { status: 500 }
    )
  }
}
