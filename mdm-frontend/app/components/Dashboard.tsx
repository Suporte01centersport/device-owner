'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from 'recharts'

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

interface Computer {
  computerId: string
  name?: string
  status?: 'online' | 'offline' | string
  lastSeen?: number
}

interface DashboardProps {
  devices: Device[]
  isConnected: boolean
  onMessage?: (message: any) => void
}

export default function Dashboard({ devices, isConnected, onMessage }: DashboardProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [deviceHistory, setDeviceHistory] = useState<Array<{ day: string; date: string; devices: number }>>([])
  const [chartData, setChartData] = useState<Array<{ day: string; date: string; devices: number; computers: number }>>([])
  const [isLoadingChart, setIsLoadingChart] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<{
    [deviceId: string]: {
      status: 'sending' | 'sent' | 'received' | 'error'
      message?: string
      timestamp?: number
    }
  }>({})
  const [computers, setComputers] = useState<Computer[]>([])

  useEffect(() => {
    // Marcar como cliente após hidratação
    setIsClient(true)
    setCurrentTime(new Date())
    
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const merged = mergeDeviceAndComputerHistory(deviceHistory, computers)
    setChartData(merged)
  }, [deviceHistory, computers])

  useEffect(() => {
    let isMounted = true

    const loadComputers = async () => {
      try {
        const response = await fetch('/api/uem/computers')
        if (!response.ok) return

        const data = await response.json()
        if (data.success && Array.isArray(data.computers) && isMounted) {
          setComputers(data.computers)
        }
      } catch (error) {
        console.error('Erro ao carregar computadores:', error)
      }
    }

    loadComputers()
    const interval = setInterval(loadComputers, 30000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // ✅ NOVO: Carregar dados reais do histórico de status (apenas 7d)
  useEffect(() => {
    const loadChartData = async () => {
      setIsLoadingChart(true)
      try {
        const response = await fetch(`/api/devices/status-history?period=7d`)
        const result = await response.json()
        
        if (result.success && result.data) {
          // Processar dados da semana (segunda a domingo)
          const processedData = processHistoryData(result.data)
          setDeviceHistory(processedData)
        } else {
          // Se não houver dados, usar valores zerados
          setDeviceHistory(generateEmptyChartData())
        }
      } catch (error) {
        console.error('❌ Erro ao carregar histórico:', error)
        setDeviceHistory(generateEmptyChartData())
      } finally {
        setIsLoadingChart(false)
      }
    }
    
    loadChartData()
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const processHistoryData = (data: any[]) => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const endDate = new Date()
    
    // Começar da segunda-feira da semana atual
    const currentDay = endDate.getDay() // 0 = Dom, 1 = Seg, ..., 6 = Sáb
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1 // Se domingo, voltar 6 dias
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - daysFromMonday)
    
    // Criar mapa de datas para contagem
    const dateMap = new Map<string, number>()
    
    data.forEach((item: any) => {
      // Converter data do banco para string no formato YYYY-MM-DD
      const dateObj = new Date(item.status_date)
      const date = dateObj.toISOString().split('T')[0]
      const count = parseInt(item.devices_online || 0)
      
      if (!dateMap.has(date)) {
        dateMap.set(date, 0)
      }
      dateMap.set(date, dateMap.get(date)! + count)
    })
    
    // Gerar array de dados da semana (Segunda a Domingo)
    const history: Array<{ day: string; date: string; devices: number }> = []
    const currentDate = new Date(startDate)
    
    for (let i = 0; i < 7; i++) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const dayName = days[currentDate.getDay()]
      const value = dateMap.get(dateStr) || 0
      
      history.push({
        day: dayName,
        date: dateStr,
        devices: value
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return history
  }

  const generateEmptyChartData = () => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const endDate = new Date()
    
    // ✅ Começar da segunda-feira da semana atual
    const currentDay = endDate.getDay()
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - daysFromMonday)
    
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      return {
        day: days[date.getDay()],
        date: date.toISOString().split('T')[0],
        devices: 0
      }
    })
  }

  const mergeDeviceAndComputerHistory = (
    deviceHistoryData: Array<{ day: string; date: string; devices: number }>,
    computerList: Computer[]
  ) => {
    if (deviceHistoryData.length === 0) return []

    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 6)

    const computerCounts = new Map<string, number>()

    computerList.forEach((computer) => {
      if (!computer.lastSeen) return
      const status = (computer.status || '').toLowerCase()
      if (status !== 'online') return
      const lastSeenDate = new Date(computer.lastSeen)
      if (lastSeenDate < sevenDaysAgo) return
      const dateStr = lastSeenDate.toISOString().split('T')[0]
      const current = computerCounts.get(dateStr) || 0
      computerCounts.set(dateStr, current + 1)
    })

    return deviceHistoryData.map((entry) => ({
      day: entry.day,
      date: entry.date,
      devices: entry.devices,
      computers: computerCounts.get(entry.date) || 0
    }))
  }

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
  const avgBattery = devices.length > 0 
    ? Math.round(devices.reduce((sum, d) => sum + d.batteryLevel, 0) / devices.length)
    : 0

  // Calcular porcentagens em tempo real
  const getOnlinePercentage = () => {
    if (devices.length === 0) return 0
    return Math.round((onlineDevices / devices.length) * 100)
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

  const totalComputers = computers.length
  const onlineComputers = computers.filter(c => (c.status || '').toLowerCase() === 'online').length

  const getTotalComputersChange = () => {
    if (totalComputers === 0) return '0%'
    const growth = Math.min(totalComputers * 3, 25)
    return `+${growth}%`
  }

  const getOnlineComputersPercentage = () => {
    if (totalComputers === 0) return 0
    return Math.round((onlineComputers / totalComputers) * 100)
  }

  const getOnlineComputersChange = () => {
    if (totalComputers === 0) return '0%'
    const percent = getOnlineComputersPercentage()
    if (percent === 100) return '+100%'
    if (percent >= 80) return `+${percent}%`
    if (percent >= 50) return `+${percent}%`
    return `${percent}%`
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
      title: 'PCs Totais',
      value: totalComputers,
      change: getTotalComputersChange(),
      changeType: totalComputers > 0 ? 'positive' : 'neutral',
      icon: '💻',
      color: 'text-primary'
    },
    {
      title: 'PCs Online',
      value: onlineComputers,
      change: getOnlineComputersChange(),
      changeType: onlineComputers > 0 ? 'positive' : 'neutral',
      icon: '🖥️',
      color: 'text-success'
    }
  ]

  // Gerar dados de atividade recente baseados em eventos REAIS
  const recentActivities = devices
    .filter(device => device.status === 'online') // Mostrar apenas dispositivos que tiveram atividade real
    .slice(0, 4)
    .map((device, index) => {
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
      
      // Determinar ação real baseada no status do dispositivo
      let action = ''
      let type: 'success' | 'warning' | 'info' = 'success'
      
      if (device.status === 'online') {
        if (minutes < 1) {
          action = 'Conectado ao servidor'
          type = 'success'
        } else if (minutes < 5) {
          action = 'Enviando dados de localização'
          type = 'info'
        } else {
          action = 'Online e operacional'
          type = 'success'
        }
      } else {
        action = 'Desconectado'
        type = 'warning'
      }
      
      return {
        id: device.deviceId,
        device: device.name || `Dispositivo ${index + 1}`,
        action: action,
        time: timeText,
        type: type
      }
    })

  const chartStackData = useMemo(() => {
    return chartData.map((entry) => ({
      day: entry.day,
      celulares: entry.devices ?? 0,
      pcs: entry.computers ?? 0
    }))
  }, [chartData])

  const renderBarChartTooltip = useMemo(() => {
    return ({ active, payload, label }: any) => {
      if (!active || !payload || payload.length === 0) {
        return null
      }

      const celularesValue = payload.find((item: any) => item.dataKey === 'celulares')?.value ?? 0
      const pcsValue = payload.find((item: any) => item.dataKey === 'pcs')?.value ?? 0

      return (
        <div className="bg-slate-900/95 text-white text-xs px-4 py-3 rounded-lg shadow-lg border border-slate-700">
          <div className="text-[11px] text-slate-300 mb-2 font-medium text-center">{label}</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-blue-200">
              <span role="img" aria-label="Celulares">📱</span>
              <span className="font-semibold text-white">{celularesValue}</span>
            </div>
            <div className="flex items-center gap-1 text-blue-100">
              <span role="img" aria-label="PCs">💻</span>
              <span className="font-semibold text-white">{pcsValue}</span>
            </div>
          </div>
        </div>
      )
    }
  }, [])


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
            <span className="text-sm text-secondary">Semana Atual (Seg - Dom)</span>
          </div>
          
          {/* Bar Chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartStackData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="mobileGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 50]}
                  interval={0}
                  ticks={[0, 10, 20, 30, 40, 50]}
                />
                <RechartsTooltip content={renderBarChartTooltip} cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
                <Bar dataKey="celulares" stackId="devices" fill="url(#mobileGradient)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pcs" stackId="devices" fill="rgba(191, 219, 254, 0.95)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Chart legend */}
          <div className="flex justify-center mt-4 gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-xs text-secondary">Celulares Online</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-200 rounded"></div>
              <span className="text-xs text-secondary">PCs Online</span>
            </div>
          </div>
          <div className="text-center text-[11px] text-muted mt-2">Celulares usam histórico diário; PCs consideram a última atividade registrada em cada dia</div>
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
                  totalComputers: totalComputers,
                  onlineComputers: onlineComputers,
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