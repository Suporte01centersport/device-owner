import { NextRequest, NextResponse } from 'next/server'

// Tipos de restrições suportadas
interface DeviceRestrictions {
  deviceId: string
  cameraDisabled?: boolean
  screenCaptureDisabled?: boolean
  bluetoothDisabled?: boolean
  usbDataTransferDisabled?: boolean
  wifiDisabled?: boolean
  factoryResetDisabled?: boolean
  safeBootDisabled?: boolean
  statusBarDisabled?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const body: DeviceRestrictions = await request.json()
    const { deviceId } = body

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID é obrigatório' },
        { status: 400 }
      )
    }

    console.log(`🔒 Aplicando restrições de segurança para dispositivo ${deviceId}`)
    console.log('Restrições:', body)

    // Retornar sucesso - as restrições serão enviadas via WebSocket
    return NextResponse.json({
      success: true,
      deviceId,
      restrictions: body,
      message: 'Restrições serão aplicadas no dispositivo',
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('Erro ao aplicar restrições:', error)
    return NextResponse.json(
      { error: 'Erro ao processar restrições de segurança' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const deviceId = searchParams.get('deviceId')

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID é obrigatório' },
        { status: 400 }
      )
    }

    // Aqui você buscaria do banco de dados as restrições atuais
    // Por enquanto, retornando um objeto padrão

    return NextResponse.json({
      success: true,
      deviceId,
      restrictions: {
        cameraDisabled: false,
        screenCaptureDisabled: false,
        bluetoothDisabled: false,
        usbDataTransferDisabled: false,
        wifiDisabled: false,
        factoryResetDisabled: true,
        safeBootDisabled: true,
        statusBarDisabled: false
      }
    })

  } catch (error) {
    console.error('Erro ao buscar restrições:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar restrições' },
      { status: 500 }
    )
  }
}

