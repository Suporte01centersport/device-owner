import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DeviceStatusHistory = require('../../../../server/database/models/DeviceStatusHistory');

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '7d';
    
    // Calcular datas baseadas no período
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '14d':
        startDate.setDate(endDate.getDate() - 14);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`📊 Buscando histórico de status de ${startDateStr} até ${endDateStr}`);
    
    // Buscar histórico de dispositivos online por dia
    const dailyCounts = await DeviceStatusHistory.getDailyOnlineCounts(startDateStr, endDateStr);
    
    console.log(`📊 Histórico encontrado:`, dailyCounts);
    
    return NextResponse.json({
      success: true,
      data: dailyCounts,
      period: period,
      startDate: startDateStr,
      endDate: endDateStr
    });
  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico de status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

