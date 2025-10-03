import { NextRequest, NextResponse } from 'next/server'

// POST - Adicionar política de aplicativo ao grupo
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()
    const { packageName, appName, isAllowed, policyType } = body

    if (!groupId || !packageName || !appName) {
      return NextResponse.json(
        { success: false, error: 'Dados obrigatórios não fornecidos' },
        { status: 400 }
      )
    }

    // const policy = await DeviceGroupModel.addAppPolicy(groupId, {
    //   packageName,
    //   appName,
    //   isAllowed: isAllowed !== false,
    //   policyType: policyType || 'allow'
    // })

    // Mock para demonstração
    const policy = {
      id: `policy_${Date.now()}`,
      packageName,
      appName,
      isAllowed: isAllowed !== false,
      policyType: policyType || 'allow',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    return NextResponse.json({ success: true, data: policy })
  } catch (error) {
    console.error('Erro ao adicionar política:', error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
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
        { success: false, error: 'ID do grupo e nome do pacote são obrigatórios' },
        { status: 400 }
      )
    }

    // const deleted = await DeviceGroupModel.removeAppPolicy(groupId, packageName)

    // Mock para demonstração
    const deleted = true

    return NextResponse.json({ success: true, deleted })
  } catch (error) {
    console.error('Erro ao remover política:', error)
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}


