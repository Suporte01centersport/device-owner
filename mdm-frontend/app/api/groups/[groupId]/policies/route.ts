import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
// @ts-ignore
require('dotenv').config()
import DeviceGroupModel from '../../../../../server/database/models/DeviceGroup.js'

// GET - Listar políticas do grupo
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

    const policies = await DeviceGroupModel.getGroupPolicies(groupId)
    return NextResponse.json({ success: true, data: policies })
  } catch (error: any) {
    console.error('Erro ao listar políticas:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao listar políticas' },
      { status: 500 }
    )
  }
}

// POST - Adicionar política de aplicativo ao grupo
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()
    const { packageName, appName, policyType } = body

    if (!groupId || !packageName || !appName) {
      return NextResponse.json(
        { success: false, detail: 'Dados obrigatórios não fornecidos' },
        { status: 400 }
      )
    }

    const policy = await DeviceGroupModel.addAppPolicy(groupId, {
      packageName,
      appName,
      policyType: policyType || 'allow'
    })

    return NextResponse.json({ success: true, data: policy })
  } catch (error: any) {
    console.error('Erro ao adicionar política:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao adicionar política' },
      { status: 500 }
    )
  }
}

// DELETE - Remover política de aplicativo do grupo
export async function DELETE(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const { searchParams } = new URL(request.url)
    const packageName = searchParams.get('packageName')

    if (!groupId || !packageName) {
      return NextResponse.json(
        { success: false, detail: 'ID do grupo e nome do pacote são obrigatórios' },
        { status: 400 }
      )
    }

    const deleted = await DeviceGroupModel.removeAppPolicy(groupId, packageName)

    return NextResponse.json({ success: true, data: deleted })
  } catch (error: any) {
    console.error('Erro ao remover política:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao remover política' },
      { status: 500 }
    )
  }
}
















