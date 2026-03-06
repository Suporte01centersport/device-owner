import { NextRequest, NextResponse } from 'next/server';

/**
 * API para enviar comando de atualização de APK para dispositivos
 * POST /api/devices/update-app
 * 
 * Body:
 * {
 *   "deviceIds": ["device123", "device456"] ou "all" para todos
 *   "apkUrl": "https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk",
 *   "version": "1.0.1" (opcional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceIds, apkUrl, version } = body;

    // Validação
    if (!apkUrl || typeof apkUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'apkUrl é obrigatório' },
        { status: 400 }
      );
    }

    if (!deviceIds || (!Array.isArray(deviceIds) && deviceIds !== 'all')) {
      return NextResponse.json(
        { success: false, error: 'deviceIds deve ser um array ou "all"' },
        { status: 400 }
      );
    }

    // Verificar se a URL é válida
    try {
      new URL(apkUrl);
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'apkUrl inválida' },
        { status: 400 }
      );
    }

    // Enviar comando para o servidor WebSocket via HTTP
    console.log('═══════════════════════════════════════════════');
    console.log('📥 API: Enviando comando de atualização');
    console.log('═══════════════════════════════════════════════');
    console.log('Dispositivos:', deviceIds);
    console.log('URL do APK:', apkUrl);
    console.log('Versão:', version || 'latest');
    
    try {
      const wsHost = process.env.WEBSOCKET_HOST || 'localhost'
      const wsPort = process.env.WEBSOCKET_PORT || '3001'
      const wsResponse = await fetch(`http://${wsHost}:${wsPort}/api/update-app`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceIds,
          apkUrl,
          version: version || 'latest'
        })
      });

      const wsResult = await wsResponse.json();
      
      console.log('Resposta do servidor WebSocket:', wsResult);
      console.log('═══════════════════════════════════════════════');

      if (wsResult.success) {
        return NextResponse.json({
          success: true,
          message: 'Comando de atualização enviado com sucesso',
          deviceIds: deviceIds === 'all' ? 'todos os dispositivos' : deviceIds,
          apkUrl,
          version: version || 'latest',
          result: wsResult
        });
      } else {
        return NextResponse.json({
          success: false,
          error: wsResult.error || 'Erro ao enviar comando'
        }, { status: 500 });
      }
    } catch (error) {
      console.error('Erro ao comunicar com servidor WebSocket:', error);
      return NextResponse.json({
        success: false,
        error: 'Erro ao comunicar com servidor WebSocket. Verifique se o servidor está rodando na porta 3001.'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Erro ao processar atualização de app:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro ao processar requisição',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}

/**
 * GET para verificar status de atualizações
 */
export async function GET(request: NextRequest) {
  try {
    // Endpoint de documentação
    return NextResponse.json({
      success: true,
      message: 'Endpoint de atualização de apps',
      usage: {
        method: 'POST',
        endpoint: '/api/devices/update-app',
        body: {
          deviceIds: "Array de IDs ou string 'all'",
          apkUrl: 'URL do arquivo APK',
          version: 'Versão (opcional)'
        },
        example: {
          deviceIds: ['device123', 'device456'],
          apkUrl: 'https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk',
          version: '1.0.1'
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Erro ao processar requisição' },
      { status: 500 }
    );
  }
}

