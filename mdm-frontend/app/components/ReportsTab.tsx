'use client';

import React, { useState, useEffect } from 'react';
import { AppUsageData, AccessedApp } from '../types/device';

interface ReportsTabProps {
  device: any;
  isActive: boolean;
}

export default function ReportsTab({ device, isActive }: ReportsTabProps) {
  const [usageData, setUsageData] = useState<AppUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAccessedAppsModal, setShowAccessedAppsModal] = useState(false);
  const [accessedApps, setAccessedApps] = useState<AccessedApp[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  useEffect(() => {
    console.log('📊 === REPORTS TAB USEEFFECT ===');
    console.log('📊 isActive:', isActive);
    console.log('📊 device?.deviceId:', device?.deviceId);
    console.log('📊 device?.appUsageData:', device?.appUsageData);
    console.log('📊 device?.lastUsageUpdate:', device?.lastUsageUpdate);
    
    if (isActive && device?.deviceId) {
      loadUsageData();
      loadDashboardData(); // ✅ NOVO: Carregar dados do dashboard
    }
    console.log('📊 === FIM REPORTS TAB USEEFFECT ===');
  }, [isActive, device?.deviceId, device?.appUsageData]);

  const loadUsageData = async () => {
    console.log('📊 === LOAD USAGE DATA ===');
    console.log('📊 device?.appUsageData:', device?.appUsageData);
    console.log('📊 device?.appUsageData?.accessed_apps:', device?.appUsageData?.accessed_apps);
    
    try {
      // Usar dados reais do dispositivo se disponíveis
      if (device?.appUsageData) {
        console.log('📊 Usando dados reais do dispositivo');
        setUsageData(device.appUsageData);
      } else {
        console.log('📊 Nenhum dado de uso disponível - mostrando estado vazio');
        // Não gerar dados simulados - mostrar estado real
        setUsageData({
          last_access: 'N/D',
          access_count: 0,
          total_time_ms: 0,
          total_time_formatted: 'N/D',
          session_count: 0,
          is_tracking: false,
          current_session_start: null,
          accessed_apps: []
        });
      }

      console.log('📊 UsageData definido:', device?.appUsageData || 'dados vazios');
      console.log('📊 === FIM LOAD USAGE DATA ===');
    } catch (err) {
      setError('Erro ao carregar dados de uso');
      console.error('Erro ao carregar dados de uso:', err);
    }
  };

  const formatTime = (milliseconds: number): string => {
    if (milliseconds <= 0) return 'N/D';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getUsageLevel = (timeMs: number): { level: string; color: string; description: string } => {
    if (timeMs <= 0) {
      return {
        level: 'N/D',
        color: 'text-gray-600 bg-gray-100',
        description: 'Sem dados de uso disponíveis'
      };
    }
    
    const hours = timeMs / (1000 * 60 * 60);
    
    if (hours < 1) {
      return {
        level: 'Baixo',
        color: 'text-green-600 bg-green-100',
        description: 'Uso mínimo do dispositivo'
      };
    } else if (hours < 4) {
      return {
        level: 'Moderado',
        color: 'text-yellow-600 bg-yellow-100',
        description: 'Uso moderado do dispositivo'
      };
    } else if (hours < 8) {
      return {
        level: 'Alto',
        color: 'text-orange-600 bg-orange-100',
        description: 'Uso intenso do dispositivo'
      };
    } else {
      return {
        level: 'Muito Alto',
        color: 'text-red-600 bg-red-100',
        description: 'Uso excessivo do dispositivo'
      };
    }
  };

  // ✅ NOVO: Função para processar dados da semana atual (segunda a domingo)
  const processWeeklyData = (rawData: any[]) => {
    console.log('📅 === PROCESSANDO DADOS DA SEMANA ===');
    console.log('📅 Dados brutos recebidos:', rawData);
    console.log('📅 Tipo dos dados:', typeof rawData, Array.isArray(rawData));
    console.log('📅 Quantidade de registros:', rawData?.length || 0);
    
    // Criar array com os 7 dias da semana atual (segunda a domingo)
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1); // Segunda-feira
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      weekDays.push({
        date: day.toISOString().split('T')[0], // YYYY-MM-DD
        dayName: day.toLocaleDateString('pt-BR', { weekday: 'short' }),
        access_count: 0,
        total_duration_ms: 0,
        unique_apps: 0
      });
    }
    
    console.log('📅 Dias da semana criados:', weekDays.map(d => ({ date: d.date, dayName: d.dayName })));
    
    // ✅ CORREÇÃO: Processar dados mesmo se não vierem da API
    if (rawData && Array.isArray(rawData) && rawData.length > 0) {
      console.log('📅 Processando dados brutos:', rawData);
      
      const dailyTotals = new Map<string, { 
        access_count: number, 
        total_duration_ms: number, 
        unique_apps: Set<string>,
        total_accesses: number // ✅ NOVO: Total de acessos do dia (soma de todos os acessos)
      }>();
      
      rawData.forEach((item: any, index: number) => {
        console.log(`📅 Item ${index}:`, item);
        // ✅ CORREÇÃO: Converter date para formato YYYY-MM-DD
        const date = item.access_date instanceof Date 
          ? item.access_date.toISOString().split('T')[0] 
          : item.access_date.toISOString ? new Date(item.access_date).toISOString().split('T')[0] 
          : item.access_date.split('T')[0];
        
        console.log(`📅 Data processada:`, date);
        
        if (!dailyTotals.has(date)) {
          dailyTotals.set(date, { 
            access_count: 0, 
            total_duration_ms: 0, 
            unique_apps: new Set(),
            total_accesses: 0 // ✅ NOVO: Inicializar total de acessos
          });
        }
        const totals = dailyTotals.get(date)!;
        totals.access_count += parseInt(item.access_count || 0);
        totals.total_duration_ms += parseInt(item.total_duration_ms || 0);
        totals.unique_apps.add(item.package_name);
        totals.total_accesses += parseInt(item.access_count || 0); // ✅ NOVO: Somar total de acessos
      });
      
      console.log('📅 Totais calculados:', Array.from(dailyTotals.entries()));
      
      // Aplicar dados aos dias da semana
      weekDays.forEach(day => {
        const totals = dailyTotals.get(day.date);
        if (totals) {
          day.access_count = totals.access_count;
          day.total_duration_ms = totals.total_duration_ms;
          day.unique_apps = totals.unique_apps.size;
          day.total_accesses = totals.total_accesses; // ✅ NOVO: Total de acessos do dia
          console.log(`📅 ${day.dayName} (${day.date}): ${day.unique_apps} apps únicos, ${totals.total_accesses} total de acessos`);
        }
      });
    } else {
      console.log('📅 Nenhum dado para processar - usando dados vazios');
    }
    
    console.log('📅 Resultado final:', weekDays.map(d => ({ 
      dayName: d.dayName, 
      date: d.date, 
      unique_apps: d.unique_apps 
    })));
    console.log('📅 === FIM PROCESSAMENTO SEMANA ===');
    
    return weekDays;
  };

  const loadDashboardData = async () => {
    console.log('📊 === LOAD DASHBOARD DATA ===');
    console.log('📊 device?.deviceId:', device?.deviceId);
    
    if (!device?.deviceId) {
      console.log('📊 Sem deviceId - dados vazios');
      setDashboardData(null);
      return;
    }

    setIsLoadingDashboard(true);
    
    try {
      // Buscar dados do banco de dados para o dashboard
      const [topAppsResponse, dailyUsageResponse] = await Promise.all([
        fetch(`/api/devices/app-history?deviceId=${device.deviceId}&type=top&days=30`),
        fetch(`/api/devices/app-history?deviceId=${device.deviceId}&type=daily`) // ✅ CORREÇÃO: Sem parâmetro days para usar semana fixa
      ]);
      
      if (!topAppsResponse.ok || !dailyUsageResponse.ok) {
        throw new Error('Erro ao buscar dados do dashboard');
      }
      
      const [topAppsResult, dailyUsageResult] = await Promise.all([
        topAppsResponse.json(),
        dailyUsageResponse.json()
      ]);
      
      console.log('📊 Top apps:', topAppsResult.data);
      console.log('📊 Daily usage:', dailyUsageResult.data);
      
      // Debug dos dados individuais
      if (topAppsResult.data && topAppsResult.data.length > 0) {
        console.log('📊 Primeiro app:', topAppsResult.data[0]);
        console.log('📊 Total accesses do primeiro app:', topAppsResult.data[0].total_accesses);
        console.log('📊 Tipo do total_accesses:', typeof topAppsResult.data[0].total_accesses);
      }
      
      // ✅ NOVO: Processar dados da semana atual (segunda a domingo)
      const weeklyData = processWeeklyData(dailyUsageResult.data);
      console.log('📊 Dados da semana processados:', weeklyData);
      console.log('📊 Dados brutos recebidos:', dailyUsageResult.data);
      console.log('📊 Quantidade de registros:', dailyUsageResult.data?.length || 0);
      
      // Processar dados para o dashboard
      const dashboardStats = {
        totalApps: topAppsResult.data?.length || 0,
        totalAccesses: topAppsResult.data?.reduce((sum: number, app: any) => sum + parseInt(app.total_accesses || 0), 0) || 0,
        totalDuration: topAppsResult.data?.reduce((sum: number, app: any) => sum + parseInt(app.total_duration_ms || 0), 0) || 0,
        topApps: topAppsResult.data?.slice(0, 5) || [],
        dailyUsage: weeklyData, // ✅ CORREÇÃO: Usar dados processados da semana
        lastAccess: topAppsResult.data?.[0]?.last_access_time || null
      };
      
      console.log('📊 Dashboard stats:', dashboardStats);
      setDashboardData(dashboardStats);
      
    } catch (error) {
      console.error('❌ Erro ao carregar dados do dashboard:', error);
      setDashboardData(null);
    } finally {
      setIsLoadingDashboard(false);
    }
    
    console.log('📊 === FIM LOAD DASHBOARD DATA ===');
  };

  const refreshData = () => {
    loadUsageData();
    loadDashboardData(); // ✅ NOVO: Recarregar dados do dashboard também
  };

  const loadAccessedApps = async () => {
    console.log('📱 === LOAD ACCESSED APPS ===');
    console.log('📱 device?.deviceId:', device?.deviceId);
    
    if (!device?.deviceId) {
      console.log('📱 Sem deviceId - lista vazia');
      setAccessedApps([]);
      return;
    }

    setIsLoadingHistory(true);
    
    try {
      // Buscar dados do banco de dados
      const response = await fetch(`/api/devices/app-history?deviceId=${device.deviceId}&type=history&limit=100`);
      
      if (!response.ok) {
        throw new Error('Erro ao buscar histórico');
      }
      
      const result = await response.json();
      console.log('📱 Dados do banco:', result.data);
      
      if (result.success && result.data) {
        const accessedAppsData: AccessedApp[] = result.data.map((item: any) => ({
          packageName: item.package_name,
          appName: item.app_name,
          accessTime: new Date(item.last_access_time).toLocaleTimeString('pt-BR'),
          accessDate: new Date(item.access_date).toLocaleDateString('pt-BR'),
          duration: item.total_duration_ms || 0,
          accessCount: item.access_count || 1,
          iconBase64: device.installedApps?.find((installedApp: any) =>
            installedApp.packageName === item.package_name
          )?.iconBase64,
          isAllowed: item.is_allowed ?? true // Usar campo do banco de dados
        })).sort((a: AccessedApp, b: AccessedApp) => {
          // Ordenar por data/hora crescente (mais antigo primeiro)
          const timeA = new Date(`${a.accessDate} ${a.accessTime}`).getTime();
          const timeB = new Date(`${b.accessDate} ${b.accessTime}`).getTime();
          return timeA - timeB;
        });

        console.log('📱 Apps processados do banco:', accessedAppsData);
        setAccessedApps(accessedAppsData);
      } else {
        console.log('📱 Nenhum dado encontrado no banco');
        setAccessedApps([]);
      }
      
    } catch (error) {
      console.error('❌ Erro ao carregar histórico do banco:', error);
      
      // Fallback para dados em tempo real se disponíveis
      if (device?.appUsageData?.accessed_apps && device.appUsageData.accessed_apps.length > 0) {
        console.log('📱 Usando fallback para dados em tempo real');
        const accessedAppsData: AccessedApp[] = device.appUsageData.accessed_apps
          .map((app: any) => ({
            packageName: app.packageName,
            appName: app.appName,
            accessTime: app.accessTimeFormatted || new Date(app.accessTime).toLocaleTimeString('pt-BR'),
            accessDate: new Date(app.accessTime).toLocaleDateString('pt-BR'),
            duration: app.duration || 0,
            accessCount: 1,
            iconBase64: device.installedApps?.find((installedApp: any) =>
              installedApp.packageName === app.packageName
            )?.iconBase64
          }))
          .sort((a: AccessedApp, b: AccessedApp) => {
            const timeA = new Date(`${a.accessDate} ${a.accessTime}`).getTime();
            const timeB = new Date(`${b.accessDate} ${b.accessTime}`).getTime();
            return timeA - timeB;
          });

        setAccessedApps(accessedAppsData);
      } else {
        console.log('📱 Nenhum dado de acesso encontrado - lista vazia');
        setAccessedApps([]);
      }
    } finally {
      setIsLoadingHistory(false);
    }
    
    console.log('📱 === FIM LOAD ACCESSED APPS ===');
  };

  const openAccessedAppsModal = () => {
    console.log('📱 === OPEN ACCESSED APPS MODAL ===');
    console.log('📱 device:', device);
    console.log('📱 device?.appUsageData:', device?.appUsageData);
    console.log('📱 device?.appUsageData?.accessed_apps:', device?.appUsageData?.accessed_apps);
    
    loadAccessedApps();
    setShowAccessedAppsModal(true);
    
    console.log('📱 Modal aberto, showAccessedAppsModal:', true);
    console.log('📱 === FIM OPEN ACCESSED APPS MODAL ===');
  };

  const closeAccessedAppsModal = () => {
    setShowAccessedAppsModal(false);
  };

  if (!isActive) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">📊 Relatórios de Uso</h3>
        <div className="flex gap-2">
          <button
            onClick={openAccessedAppsModal}
            className="px-3 py-2 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="6" y="3" width="12" height="18" rx="2" strokeWidth="2"/>
              <line x1="10" y1="18" x2="14" y2="18" strokeWidth="2"/>
            </svg>
            Acessados
          </button>
          <button
            onClick={refreshData}
            disabled={loading}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Carregando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Atualizar
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Erro</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Funcional */}
      {isLoadingDashboard ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Carregando dados do dashboard...</span>
          </div>
        </div>
      ) : dashboardData ? (
        <>
          {/* Resumo Geral com Dados Reais */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">📈 Resumo Geral</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-blue-600">Último Acesso</p>
                    <p className="text-lg font-semibold text-blue-900">
                      {dashboardData.lastAccess ? new Date(dashboardData.lastAccess).toLocaleString('pt-BR') : 'N/D'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <rect x="6" y="3" width="12" height="18" rx="2" strokeWidth="2"/>
                      <line x1="10" y1="18" x2="14" y2="18" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-green-600">Total de Acessos</p>
                    <p className="text-lg font-semibold text-green-900">{dashboardData.totalAccesses}</p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-purple-600">Tempo Total</p>
                    <p className="text-lg font-semibold text-purple-900">{formatTime(dashboardData.totalDuration)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-orange-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <rect x="6" y="3" width="12" height="18" rx="2" strokeWidth="2"/>
                      <line x1="10" y1="18" x2="14" y2="18" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-orange-600">Apps Únicos</p>
                    <p className="text-lg font-semibold text-orange-900">{dashboardData.totalApps}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Apps Mais Acessados */}
          {dashboardData.topApps.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">🏆 Top Apps Mais Acessados</h4>
              <div className="space-y-3">
                {dashboardData.topApps.map((app: any, index: number) => (
                  <div key={app.package_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <h5 className="font-medium text-gray-900">{app.app_name}</h5>
                        <p className="text-sm text-gray-600 font-mono">{app.package_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{app.total_accesses} acessos</p>
                      <p className="text-xs text-gray-500">{formatTime(app.total_duration_ms)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gráfico de Apps Abertos por Dia */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">📈 Apps Abertos por Dia</h4>
            <div className="h-48 flex items-end justify-between space-x-2 relative">
              {dashboardData.dailyUsage.map((day: any, index: number) => {
                // ✅ NOVO: Limite de 100 para o gráfico
                const maxValue = 100;
                const currentValue = day.total_accesses || 0;
                
                // Sempre mostrar barra, mesmo com 0 acessos
                const isToday = day.date === new Date().toISOString().split('T')[0];
                
                // Calcular altura baseada em 100 acessos como máximo
                // Se tiver 100 acessos, altura é 192px (100% do container)
                // Se tiver 0 acessos, altura é 0 (mas mostramos mínimo para visualização)
                const heightPx = currentValue >= 100
                  ? 192 // Máximo: barra cheia
                  : currentValue > 0
                    ? Math.max((currentValue / maxValue) * 192, 4) // Proporcional a 100, mínimo 4px
                    : (isToday ? 4 : 2); // Mínimo 2px se não tiver acesso
                
                // Formatar valor para exibição
                const displayValue = (day.total_accesses || 0) > 100 ? '100+' : (day.total_accesses || 0);
                
                return (
                  <div key={index} className="flex flex-col items-center space-y-2">
                    <div 
                      className={`rounded-t w-8 transition-all duration-500 shadow-sm ${
                        day.total_accesses > 0 
                          ? 'bg-gradient-to-t from-blue-500 to-blue-400' 
                          : isToday 
                            ? 'bg-gradient-to-t from-gray-300 to-gray-200' 
                            : 'bg-gradient-to-t from-gray-200 to-gray-100'
                      }`}
                      style={{ height: `${heightPx}px` }}
                      title={`${day.dayName}: ${day.total_accesses || 0} acessos total`}
                    ></div>
                    <div className="text-center absolute -bottom-12 w-full">
                      <div className={`text-xs font-medium ${
                        day.total_accesses > 0 ? 'text-gray-900' : 'text-gray-500'
                      }`}>
                        {displayValue}
                      </div>
                      <div className={`text-xs ${
                        isToday ? 'text-blue-600 font-medium' : 'text-gray-600'
                      }`}>
                        {day.dayName}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-16"></div> {/* Espaço para os números */}
            <p className="text-sm text-gray-600 text-center">
              Total de acessos a apps por dia da semana atual
            </p>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📊</span>
            </div>
            <h4 className="text-lg font-semibold text-gray-500 mb-2">Nenhum dado disponível</h4>
            <p className="text-sm text-gray-400 mb-4">
              Os dados de uso aparecerão aqui quando o usuário começar a usar os apps
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm text-blue-800">
                <strong>💡 Dica:</strong> Os dados são coletados automaticamente quando o usuário acessa aplicativos através do launcher MDM.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Apps Acessados */}
      {showAccessedAppsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full h-[80vh] flex flex-col">
          <div className="flex justify-between items-center p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">📱 Apps Acessados pelo Usuário</h3>
              {device?.appUsageData?.accessed_apps && device.appUsageData.accessed_apps.length > 0 ? (
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                  {device.appUsageData.accessed_apps.length} app{device.appUsageData.accessed_apps.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                  Nenhum acesso registrado
                </span>
              )}
            </div>
            <button
              onClick={closeAccessedAppsModal}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-600">Carregando histórico...</span>
                </div>
              ) : accessedApps.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📱</span>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-500 mb-2">Nenhum app acessado</h4>
                  <p className="text-sm text-gray-400 mb-4">
                    N/D - Os apps acessados através do launcher MDM aparecerão aqui
                  </p>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                    <p className="text-sm text-blue-800">
                      <strong>💡 Dica:</strong> Para ver apps acessados, o usuário deve usar o launcher MDM para abrir aplicativos.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {accessedApps.map((app, index) => (
                    <div key={app.packageName} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center overflow-hidden shadow-md">
                            {app.iconBase64 ? (
                              <img 
                                src={`data:image/png;base64,${app.iconBase64}`} 
                                alt={app.appName}
                                className="w-full h-full object-cover rounded-lg"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                }}
                              />
                            ) : null}
                            <div className={`w-full h-full flex items-center justify-center ${app.iconBase64 ? 'hidden' : ''}`}>
                              <span className="text-white text-lg font-bold">
                                {app.appName?.charAt(0)?.toUpperCase() || '📱'}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-gray-900 text-lg">{app.appName}</h4>
                              {!app.isAllowed && (
                                <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                  Não Permitido
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 font-mono">{app.packageName}</p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-sm text-gray-500">
                                📅 {app.accessDate}
                              </span>
                              <span className="text-sm text-gray-500">
                                🕐 {app.accessTime}
                              </span>
                              <span className="text-sm text-gray-500">
                                ⏱️ {formatTime(app.duration * 1000)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {app.accessCount && app.accessCount > 1 ? `${app.accessCount} acessos` : '1 acesso'}
                          </div>
                          <div className="text-xs text-gray-500">
                            #{index + 1}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
          <div className="p-6 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">
                {accessedApps.length} app{accessedApps.length !== 1 ? 's' : ''} acessado{accessedApps.length !== 1 ? 's' : ''} pelo usuário
              </span>
              <button
                onClick={closeAccessedAppsModal}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}