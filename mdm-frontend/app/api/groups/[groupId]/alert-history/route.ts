import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import GroupAlertHistoryModel from '../../../../../server/database/models/GroupAlertHistory.js'

// GET /api/groups/[groupId]/alert-history?date=YYYY-MM-DD - Buscar histórico por data
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!groupId) {
      return NextResponse.json(
        { success: false, detail: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }

    // Limpar alertas antigos automaticamente ao acessar o histórico
    try {
      await GroupAlertHistoryModel.cleanupOldAlerts()
    } catch (cleanupError) {
      // Não falhar a requisição se a limpeza falhar
      console.error('Erro ao limpar alertas antigos (não crítico):', cleanupError)
    }

    if (!date) {
      // Se não forneceu data, retornar datas disponíveis
      const availableDates = await GroupAlertHistoryModel.getAvailableDates(groupId)
      return NextResponse.json({ 
        success: true, 
        data: { availableDates },
        message: 'Forneça o parâmetro ?date=YYYY-MM-DD para buscar alertas de uma data específica'
      })
    }

    // Validar formato da data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { success: false, detail: 'Formato de data inválido. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const alerts = await GroupAlertHistoryModel.findByGroupAndDate(groupId, date)

    return NextResponse.json({ success: true, data: alerts })
  } catch (error: any) {
    console.error('Erro ao buscar histórico de alertas:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao buscar histórico de alertas' },
      { status: 500 }
    )
  }
}

// POST /api/groups/[groupId]/alert-history - Salvar alerta no histórico
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()

    console.log('📨 POST /api/groups/[groupId]/alert-history recebido:', {
      groupId,
      bodyKeys: Object.keys(body),
      deviceId: body.deviceId,
      alertType: body.alertType
    })

    if (!groupId) {
      console.error('❌ groupId não fornecido')
      return NextResponse.json(
        { success: false, detail: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }

    const {
      deviceId,
      deviceName,
      alertType,
      alertTitle,
      alertMessage,
      alertData
    } = body

    if (!deviceId || !deviceName || !alertType || !alertTitle || !alertMessage) {
      console.error('❌ Campos obrigatórios faltando:', {
        deviceId: !!deviceId,
        deviceName: !!deviceName,
        alertType: !!alertType,
        alertTitle: !!alertTitle,
        alertMessage: !!alertMessage
      })
      return NextResponse.json(
        { success: false, detail: 'Campos obrigatórios: deviceId, deviceName, alertType, alertTitle, alertMessage' },
        { status: 400 }
      )
    }

    console.log('💾 Chamando GroupAlertHistoryModel.create()...')
    const alert = await GroupAlertHistoryModel.create({
      groupId,
      deviceId,
      deviceName,
      alertType,
      alertTitle,
      alertMessage,
      alertData: alertData || {}
    })

    // Se alert for null, significa que já existe um alerta similar (duplicata ignorada)
    if (!alert) {
      console.log('ℹ️ Alerta duplicado ignorado (já existe nos últimos 5 minutos)')
      return NextResponse.json({ 
        success: true, 
        data: null,
        message: 'Alerta duplicado ignorado (já existe nos últimos 5 minutos)'
      })
    }

    console.log('✅ Alerta criado com sucesso:', alert.id)

    // Limpar alertas antigos em background (não bloquear resposta)
    GroupAlertHistoryModel.cleanupOldAlerts().catch(err => {
      console.error('Erro ao limpar alertas antigos (não crítico):', err)
    })

    return NextResponse.json({ success: true, data: alert })
  } catch (error: any) {
    console.error('❌ Erro ao salvar alerta no histórico:', error?.message || error)
    console.error('   Stack:', error?.stack)
    return NextResponse.json(
      { 
        success: false, 
        detail: error?.message || 'Erro ao salvar alerta no histórico',
        error: error?.detail || error?.code
      },
      { status: 500 }
    )
  }
}

