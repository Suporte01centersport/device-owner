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

export async function PATCH(request: NextRequest) {
  try {
    const { messageId, status } = await request.json()

    if (!messageId || !status) {
      return NextResponse.json(
        { error: 'messageId e status são obrigatórios' },
        { status: 400 }
      )
    }

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

    // Atualizar apenas o status e timestamp
    messages[messageIndex].status = status
    messages[messageIndex].updatedAt = Date.now()

    // Salvar arquivo atualizado
    fs.writeFileSync(supportMessagesPath, JSON.stringify(messages, null, 2))

    console.log(`Mensagem ${messageId} marcada como ${status}`)
    return NextResponse.json({ 
      success: true, 
      message: `Status atualizado para ${status}` 
    })
  } catch (error) {
    console.error('Erro ao atualizar status da mensagem:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { deviceId } = await request.json()

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId é obrigatório' },
        { status: 400 }
      )
    }

    if (!fs.existsSync(supportMessagesPath)) {
      return NextResponse.json({ success: true, message: 'Nenhuma mensagem para limpar' })
    }

    // Ler mensagens existentes
    const data = fs.readFileSync(supportMessagesPath, 'utf8')
    const messages = JSON.parse(data)

    // Filtrar mensagens, removendo as do dispositivo especificado
    const remainingMessages = messages.filter((msg: any) => msg.deviceId !== deviceId)
    const deletedCount = messages.length - remainingMessages.length

    // Salvar arquivo atualizado
    fs.writeFileSync(supportMessagesPath, JSON.stringify(remainingMessages, null, 2))

    console.log(`${deletedCount} mensagens de suporte limpas para dispositivo ${deviceId}`)
    return NextResponse.json({ 
      success: true, 
      message: `${deletedCount} mensagem${deletedCount !== 1 ? 's' : ''} removida${deletedCount !== 1 ? 's' : ''}`,
      deletedCount
    })
  } catch (error) {
    console.error('Erro ao limpar mensagens de suporte:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}