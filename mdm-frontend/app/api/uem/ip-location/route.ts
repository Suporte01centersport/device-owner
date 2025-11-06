import { NextRequest, NextResponse } from 'next/server'

// Função para verificar se o IP é privado/local
function isPrivateIP(ip: string): boolean {
  // IPs privados: 10.x.x.x, 172.16.x.x - 172.31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^localhost$/i
  ]
  
  return privateRanges.some(range => range.test(ip))
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const ipAddress = searchParams.get('ip')

    if (!ipAddress || ipAddress === 'Unknown') {
      return NextResponse.json(
        { success: false, error: 'Endereço IP inválido' },
        { status: 400 }
      )
    }

    // Verificar se é IP privado
    if (isPrivateIP(ipAddress)) {
      return NextResponse.json({
        success: false,
        error: 'IP privado/local',
        message: 'Não é possível obter localização de IPs privados (192.168.x.x, 10.x.x.x, etc.). A localização por IP funciona apenas com IPs públicos.',
        isPrivate: true
      }, { status: 400 })
    }

    // Usar API ip-api.com para obter localização baseada no IP
    const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,lat,lon,city,country,region,timezone,isp`)
    
    if (!response.ok) {
      throw new Error('Erro ao consultar API de localização')
    }

    const data = await response.json()

    if (data.status === 'success' && data.lat && data.lon) {
      return NextResponse.json({
        success: true,
        location: {
          lat: data.lat,
          lng: data.lon,
          city: data.city,
          country: data.country,
          region: data.region,
          timezone: data.timezone,
          isp: data.isp
        }
      })
    } else {
      return NextResponse.json(
        { success: false, error: data.message || 'Não foi possível obter a localização' },
        { status: 404 }
      )
    }
  } catch (error: any) {
    console.error('Erro ao obter localização do IP:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao obter localização' },
      { status: 500 }
    )
  }
}

