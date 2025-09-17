import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const supportMessagesPath = path.join(process.cwd(), 'server', 'support_messages.json')

export async function GET(request: NextRequest) {
  try {
    // Verificar se o arquivo existe
    if (!fs.existsSync(supportMessagesPath)) {
      return NextResponse.json([])
    }

    // Ler o arquivo de mensagens de suporte
    const data = fs.readFileSync(supportMessagesPath, 'utf8')
    const messages = JSON.parse(data)

    return NextResponse.json(messages)
  } catch (error) {
    console.error('Erro ao carregar mensagens de suporte:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { messageId, status } = await request.json()

    if (!fs.existsSync(supportMessagesPath)) {
      return NextResponse.json(
        { error: 'Arquivo de mensagens não encontrado' },
        { status: 404 }
      )
    }

    // Ler mensagens existentes
    const data = fs.readFileSync(supportMessagesPath, 'utf8')
    const messages = JSON.parse(data)

    // Encontrar e atualizar a mensagem
    const messageIndex = messages.findIndex((msg: any) => msg.id === messageId)
    if (messageIndex === -1) {
      return NextResponse.json(
        { error: 'Mensagem não encontrada' },
        { status: 404 }
      )
    }

    // Atualizar status
    messages[messageIndex].status = status
    messages[messageIndex].updatedAt = Date.now()

    // Salvar arquivo atualizado
    fs.writeFileSync(supportMessagesPath, JSON.stringify(messages, null, 2))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao atualizar mensagem de suporte:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
