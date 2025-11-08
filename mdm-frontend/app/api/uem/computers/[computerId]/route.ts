import { NextRequest, NextResponse } from 'next/server'
const ComputerModel = require('../../../../../server/database/models/Computer')

export async function GET(
  request: NextRequest,
  { params }: { params: { computerId: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get('organizationId')

    const computer = await ComputerModel.findById(params.computerId, organizationId || null)

    if (!computer) {
      return NextResponse.json(
        { error: 'Computador não encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      computer
    })
  } catch (error: any) {
    console.error('Erro ao buscar computador:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar computador' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { computerId: string } }
) {
  try {
    const body = await request.json()
    const { organizationId, ...computerData } = body

    computerData.computerId = params.computerId
    const computer = await ComputerModel.upsert(computerData, organizationId || null)

    return NextResponse.json({
      success: true,
      computer
    })
  } catch (error: any) {
    console.error('Erro ao atualizar computador:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar computador' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { computerId: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get('organizationId')

    const deleted = await ComputerModel.delete(params.computerId, organizationId || null)

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


