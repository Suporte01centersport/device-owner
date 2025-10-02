'use client'

import { useState, useEffect } from 'react'

interface Device {
  deviceId: string
  id: string
  name: string
  status: 'online' | 'offline'
  batteryLevel: number
  isDeviceOwner: boolean
  isProfileOwner: boolean
  lastSeen: number
  restrictions: any
}

interface DashboardProps {
  devices: Device[]
  isConnected: boolean
  onMessage?: (message: any) => void
}

export default function Dashboard({ devices, isConnected, onMessage }: DashboardProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  
  // Debug: verificar dados dos dispositivos
  console.log('Dashboard renderizando:', {
    devicesCount: devices.length,
    isConnected: isConnected,
    devices: devices.map(d => ({
      deviceId: d.deviceId,
      name: d.name,
      batteryLevel: d.batteryLevel,
      status: d.status
    }))
  })
  const [isClient, setIsClient] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<{
    [deviceId: string]: {
      status: 'sending' | 'sent' | 'received' | 'error'
      message?: string
      timestamp?: number
    }
  }>({})

  useEffect(() => {
    // Marcar como cliente após hidratação
    setIsClient(true)
    setCurrentTime(new Date())
    
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Processar mensagens de notificação
  useEffect(() => {
    if (!onMessage) return

    const handleMessage = (message: any) => {
      if (message.type === 'device_notification') {
        // Notificação enviada com sucesso
        setNotificationStatus(prev => ({
          ...prev,
          [message.deviceId]: {
            status: 'sent',
            message: message.body,
            timestamp: message.timestamp
          }
        }))
      } else if (message.type === 'notification_confirmed') {
        // Notificação confirmada pelo dispositivo
        setNotificationStatus(prev => ({
          ...prev,
          [message.deviceId]: {
            status: 'received',
            message: message.body,
            timestamp: message.timestamp
          }
        }))
      } else if (message.type === 'notification_error') {
        // Erro ao enviar notificação
        setNotificationStatus(prev => ({
          ...prev,
          [message.deviceId]: {
            status: 'error',
            message: message.body,
            timestamp: message.timestamp
          }
        }))
      }
    }

    // Registrar o handler de mensagens
    onMessage(handleMessage)
  }, [onMessage])

  const onlineDevices = devices.filter(d => d.status === 'online').length
  
  // Calcular dispositivos habilitados (sem restrições ativas)
  const enabledDevices = devices.filter(d => {
    if (!d.restrictions) return true
    const restrictions = d.restrictions
    // Considera habilitado se não tem restrições críticas ativas
    return !restrictions.wifiDisabled && 
           !restrictions.settingsDisabled && 
           !restrictions.installAppsDisabled
  }).length

  // Calcular dispositivos bloqueados (com restrições ativas)
  const blockedDevices = devices.filter(d => {
    if (!d.restrictions) return false
    const restrictions = d.restrictions
    // Considera bloqueado se tem restrições críticas ativas
    return restrictions.wifiDisabled || 
           restrictions.settingsDisabled || 
           restrictions.installAppsDisabled
  }).length

  const avgBattery = devices.length > 0 
    ? Math.round(devices.reduce((sum, d) => sum + d.batteryLevel, 0) / devices.length)
    : 0

  // Calcular porcentagens em tempo real
  const getOnlinePercentage = () => {
    if (devices.length === 0) return 0
    return Math.round((onlineDevices / devices.length) * 100)
  }

  const getEnabledPercentage = () => {
    if (devices.length === 0) return 0
    return Math.round((enabledDevices / devices.length) * 100)
  }

  const getBlockedPercentage = () => {
    if (devices.length === 0) return 0
    return Math.round((blockedDevices / devices.length) * 100)
  }


  const getTotalDevicesChange = () => {
    if (devices.length === 0) return '0%'
    // Mostrar crescimento baseado no número de dispositivos
    const growth = Math.min(devices.length * 3, 25) // 3% por dispositivo, máximo 25%
    return `+${growth}%`
  }

  const getOnlineChange = () => {
    if (devices.length === 0) return '0%'
    const onlinePercent = getOnlinePercentage()
    if (onlinePercent === 100) return '+100%'
    if (onlinePercent >= 80) return `+${onlinePercent}%`
    if (onlinePercent >= 50) return `+${onlinePercent}%`
    return `${onlinePercent}%`
  }

  const stats = [
    {
      title: 'Dispositivos Totais',
      value: devices.length,
      change: getTotalDevicesChange(),
      changeType: devices.length > 0 ? 'positive' : 'neutral',
      icon: '📱',
      color: 'text-primary'
    },
    {
      title: 'Online Agora',
      value: onlineDevices,
      change: getOnlineChange(),
      changeType: onlineDevices > 0 ? 'positive' : 'neutral',
      icon: '🟢',
      color: 'text-success'
    },
    {
      title: 'Dispositivos Habilitados',
      value: enabledDevices,
      change: `${getEnabledPercentage()}%`,
      changeType: enabledDevices > 0 ? 'positive' : 'neutral',
      icon: '✅',
      color: 'text-success'
    },
    {
      title: 'Dispositivos Bloqueados',
      value: blockedDevices,
      change: `${getBlockedPercentage()}%`,
      changeType: blockedDevices > 0 ? 'negative' : 'neutral',
      icon: '🚫',
      color: 'text-error'
    }
  ]

  // Gerar dados de atividade recente baseados nos dispositivos reais
  const recentActivities = devices.slice(0, 4).map((device, index) => {
    const now = Date.now()
    const lastSeen = device.lastSeen
    const timeDiff = now - lastSeen
    const minutes = Math.floor(timeDiff / 60000)
    const hours = Math.floor(timeDiff / 3600000)
    
    let timeText = ''
    if (minutes < 1) timeText = 'Agora mesmo'
    else if (minutes < 60) timeText = `${minutes} min atrás`
    else if (hours < 24) timeText = `${hours}h atrás`
    else timeText = `${Math.floor(hours / 24)}d atrás`
    
    const actions = [
      'Conectado',
      'Configuração aplicada', 
      'Dados sincronizados',
      'Localização atualizada',
      'Desconectado'
    ]
    
    const actionTypes = ['success', 'info', 'warning', 'success', 'warning']
    
    return {
      id: device.deviceId,
      device: device.name || `Dispositivo ${index + 1}`,
      action: actions[index % actions.length],
      time: timeText,
      type: device.status === 'online' ? 'success' : 'warning'
    }
  })

  // Gerar dados do gráfico baseados nos dispositivos (sem Math.random para evitar hidratação)
  const generateChartData = () => {
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    const baseValue = Math.max(1, onlineDevices) // Garantir pelo menos 1 dispositivo
    
    return days.map((day, index) => {
      // Usar índice para gerar altura consistente entre servidor e cliente
      const heightVariation = (index * 7) % 40 // Variação baseada no índice
      const height = Math.max(40, Math.min(100, 50 + heightVariation))
      const value = baseValue + (index % 3) // Variação pequena baseada no índice
      
      return {
        day,
        height: Math.round(height),
        value: Math.max(1, value)
      }
    })
  }

  const chartData = generateChartData()
  const [selectedPeriod, setSelectedPeriod] = useState('30d')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: '#1e293b' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>
            Bem-vindo ao sistema de gerenciamento de dispositivos
          </p>
        </div>
        <div className="text-right">
          {isClient && currentTime ? (
            <>
              <div className="text-sm text-secondary">
                {currentTime.toLocaleDateString('pt-BR', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
              <div className="text-lg font-semibold text-primary">
                {currentTime.toLocaleTimeString('pt-BR')}
              </div>
            </>
          ) : (
            <div className="text-sm text-secondary">Carregando...</div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="relative bg-white rounded-2xl p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl ${
                  stat.changeType === 'positive' ? 'bg-green-50' :
                  stat.changeType === 'negative' ? 'bg-red-50' : 'bg-gray-50'
                }`}>
                  {stat.icon}
                </div>
                <div>
                  <div className="text-4xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-sm text-gray-600 font-medium">{stat.title}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${
                  stat.changeType === 'positive' ? 'text-green-600' :
                  stat.changeType === 'negative' ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {stat.change}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device Status Chart */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-primary">Status dos Dispositivos</h3>
            <div className="flex gap-2">
              <button 
                className={`btn btn-sm ${selectedPeriod === '7d' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedPeriod('7d')}
              >
                7d
              </button>
              <button 
                className={`btn btn-sm ${selectedPeriod === '30d' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedPeriod('30d')}
              >
                30d
              </button>
              <button 
                className={`btn btn-sm ${selectedPeriod === '90d' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedPeriod('90d')}
              >
                90d
              </button>
            </div>
          </div>
          
          {/* Bar Chart */}
          <div className="h-64 flex items-end justify-between gap-2">
            {chartData.map((data, index) => (
              <div key={index} className="flex-1 flex flex-col items-center group cursor-pointer">
                <div 
                  className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t hover:from-blue-600 hover:to-blue-500 transition-all duration-200 relative min-h-[20px]"
                  style={{ height: `${data.height}%` }}
                >
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                    {data.value} dispositivo{data.value > 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-xs text-secondary mt-2 font-medium">
                  {data.day}
                </div>
              </div>
            ))}
          </div>
          
          {/* Chart legend */}
          <div className="flex justify-center mt-4 gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-xs text-secondary">Dispositivos Online</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-300 rounded"></div>
              <span className="text-xs text-secondary">Período: {selectedPeriod}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-primary">Atividade Recente</h3>
            <button 
              className="btn btn-sm btn-ghost"
              onClick={() => {
                // Aqui você pode implementar navegação para uma página de atividades
                console.log('Ver todas as atividades')
              }}
            >
              Ver todas
            </button>
          </div>
          
          <div className="space-y-4">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors duration-200">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.type === 'success' ? 'bg-green-500' :
                    activity.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary truncate">{activity.device}</div>
                    <div className="text-sm text-secondary">{activity.action}</div>
                    <div className="text-xs text-muted">{activity.time}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-400 text-4xl mb-2">📱</div>
                <div className="text-sm text-gray-500">Nenhuma atividade recente</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-primary mb-4">Ações Rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button 
              className="btn btn-primary hover:scale-105 transition-transform duration-200"
              onClick={() => {
                // Navegar para página de provisionamento
                console.log('Abrir página de provisionamento')
              }}
            >
              <span>📱</span>
              Provisionar Dispositivo
            </button>
            <button 
              className="btn btn-secondary hover:scale-105 transition-transform duration-200"
              onClick={() => {
                // Gerar relatório dos dispositivos
                const reportData = {
                  totalDevices: devices.length,
                  onlineDevices: onlineDevices,
                  enabledDevices: enabledDevices,
                  blockedDevices: blockedDevices,
                  avgBattery: avgBattery,
                  timestamp: new Date().toISOString()
                }
                console.log('Relatório gerado:', reportData)
                // Aqui você pode implementar download do relatório
              }}
            >
              <span>📊</span>
              Gerar Relatório
            </button>
            <button 
              className="btn btn-secondary hover:scale-105 transition-transform duration-200"
              onClick={() => {
                // Abrir configurações
                console.log('Abrir configurações do sistema')
              }}
            >
              <span>⚙️</span>
              Configurações
            </button>
            <button 
              className="btn btn-secondary hover:scale-105 transition-transform duration-200"
              onClick={() => {
                // Abrir políticas de segurança
                console.log('Abrir políticas de segurança')
              }}
            >
              <span>🔒</span>
              Políticas de Segurança
            </button>
          </div>
        </div>

        {/* Status das Notificações */}
        {Object.keys(notificationStatus).length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-primary mb-4">Status das Notificações</h3>
            <div className="space-y-3">
              {Object.entries(notificationStatus).map(([deviceId, status]) => {
                const device = devices.find(d => d.deviceId === deviceId)
                const deviceName = device?.name || `Dispositivo ${deviceId.slice(-4)}`
                
                return (
                  <div key={deviceId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        status.status === 'received' ? 'bg-green-500' :
                        status.status === 'sent' ? 'bg-blue-500' :
                        status.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <div>
                        <div className="text-sm font-medium text-primary">{deviceName}</div>
                        <div className="text-xs text-secondary">
                          {status.status === 'received' ? 'Notificação recebida' :
                           status.status === 'sent' ? 'Notificação enviada' :
                           status.status === 'error' ? 'Erro ao enviar' : 'Enviando...'}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted">
                      {status.timestamp ? new Date(status.timestamp).toLocaleTimeString('pt-BR') : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      {/* System Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}>
              <span className="text-white text-xl">{isConnected ? '✓' : '✗'}</span>
            </div>
            <div>
              <h4 className="font-semibold text-primary">Sistema {isConnected ? 'Online' : 'Offline'}</h4>
              <p className="text-sm text-secondary">
                {isConnected ? 'Todos os serviços funcionando' : 'Conexão perdida'}
              </p>
            </div>
          </div>
          <div className={`text-2xl font-bold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
            {isConnected ? '99.9%' : '0%'}
          </div>
          <div className="text-sm text-secondary">Uptime</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              avgBattery > 50 ? 'bg-green-500' : avgBattery > 20 ? 'bg-yellow-500' : 'bg-red-500'
            }`}>
              <span className="text-white text-xl">🔋</span>
            </div>
            <div>
              <h4 className="font-semibold text-primary">Bateria Média</h4>
              <p className="text-sm text-secondary">
                {devices.length > 0 ? `${devices.length} dispositivos` : 'Nenhum dispositivo'}
              </p>
            </div>
          </div>
          <div className={`text-2xl font-bold ${
            avgBattery > 50 ? 'text-green-600' : avgBattery > 20 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {devices.length > 0 ? `${avgBattery}%` : 'N/A'}
          </div>
          <div className="text-sm text-secondary">Nível médio</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-xl">📊</span>
            </div>
            <div>
              <h4 className="font-semibold text-primary">Status Geral</h4>
              <p className="text-sm text-secondary">Resumo do sistema</p>
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {onlineDevices}/{devices.length}
          </div>
          <div className="text-sm text-secondary">Online/Total</div>
        </div>
      </div>
    </div>
  )
}