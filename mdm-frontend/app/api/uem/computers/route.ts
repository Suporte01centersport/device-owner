import { NextRequest, NextResponse } from 'next/server'
const ComputerModel = require('../../../../server/database/models/Computer')

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get('organizationId')

    const computers = await ComputerModel.findAll(organizationId || null)

    return NextResponse.json({
      success: true,
      computers
    })
  } catch (error: any) {
    console.error('Erro ao buscar computadores:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar computadores' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { organizationId, ...computerData } = body

    if (!computerData.computerId) {
      return NextResponse.json(
        { error: 'computerId é obrigatório' },
        { status: 400 }
      )
    }

    const computer = await ComputerModel.upsert(computerData, organizationId || null)

    return NextResponse.json({
      success: true,
      computer
    })
  } catch (error: any) {
    console.error('Erro ao criar/atualizar computador:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar/atualizar computador' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const computerId = searchParams.get('computerId')
    const organizationId = searchParams.get('organizationId')

    if (!computerId) {
      return NextResponse.json(
        { error: 'computerId é obrigatório' },
        { status: 400 }
      )
    }

    const deleted = await ComputerModel.delete(computerId, organizationId || null)

    if (!deleted) {
      return NextResponse.json(
        { error: 'Computador não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Computador deletado com sucesso'
    })
  } catch (error: any) {
    console.error('Erro ao deletar computador:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao deletar computador' },
      { status: 500 }
    )
  }
}


