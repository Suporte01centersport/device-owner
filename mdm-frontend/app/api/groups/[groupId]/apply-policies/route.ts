import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'

// POST - Aplicar políticas de apps a todos os dispositivos do grupo
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params
    const body = await request.json()
    const { allowedApps } = body

    if (!groupId) {
      return NextResponse.json(
        { success: false, detail: 'ID do grupo é obrigatório' },
        { status: 400 }
      )
    }

    if (!Array.isArray(allowedApps)) {
      return NextResponse.json(
        { success: false, detail: 'allowedApps deve ser um array' },
        { status: 400 }
      )
    }

    // ✅ Aplicar política via servidor WebSocket HTTP
    // IMPORTANTE: Política do grupo ADICIONA aos apps já configurados individualmente
    // Mescla apps da política de grupo + apps individuais já configurados
    try {
      const wsUrl = 'http://localhost:3002/api/groups/' + encodeURIComponent(groupId) + '/apply-policies'
      console.log('Chamando servidor WebSocket:', wsUrl)
      
      const wsResponse = await fetch(wsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          allowedApps: allowedApps // Apps da política de grupo (serão mesclados com apps individuais)
        })
      })

      if (!wsResponse.ok) {
        const errorText = await wsResponse.text()
        console.error('Erro do servidor WebSocket:', wsResponse.status, errorText)
        return NextResponse.json(
          { 
            success: false, 
            detail: `Erro do servidor WebSocket (${wsResponse.status}): ${errorText || 'Erro desconhecido'}`,
            status: wsResponse.status
          },
          { status: wsResponse.status }
        )
      }

      const wsResult = await wsResponse.json()
      
      if (wsResult.success) {
        return NextResponse.json({
          success: true,
          data: wsResult.data
        })
      } else {
        return NextResponse.json(
          { success: false, detail: wsResult.error || 'Erro ao aplicar políticas' },
          { status: 500 }
        )
      }
    } catch (fetchError: any) {
      console.error('Erro ao comunicar com servidor WebSocket:', fetchError)
      return NextResponse.json(
        { 
          success: false, 
          detail: 'Erro ao comunicar com servidor WebSocket. Verifique se o servidor está rodando na porta 3002.',
          error: fetchError?.message,
          code: fetchError?.code
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Erro ao aplicar políticas:', error?.message || error)
    return NextResponse.json(
      { success: false, detail: error?.message || 'Erro ao aplicar políticas' },
      { status: 500 }
    )
  }
}

