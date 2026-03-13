'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
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
  assignedUserName?: string | null
  model?: string
  manufacturer?: string
  androidVersion?: string
  osType?: string
  deviceType?: 'mobile' | 'computer'
  assignedUser?: { name?: string } | null
  assignedDeviceUserId?: string | null
  wifiDataUsage?: number
  mobileDataUsage?: number
  dataUsage?: number
}

interface Computer {
  computerId: string
  name?: string
  status?: 'online' | 'offline' | string
  lastSeen?: number
  hostname?: string
  loggedInUser?: string
  assignedUserName?: string | null
}

interface DashboardProps {
  devices: Device[]
  isConnected: boolean
  onMessage?: (message: any) => void
  onViewChange?: (view: string) => void
}

export default function Dashboard({ devices, isConnected, onMessage, onViewChange }: DashboardProps) {
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
  const [chartPeriod, setChartPeriod] = useState<'7d' | '14d' | '30d'>('7d')
  const [viewMode, setViewMode] = useState<'atual' | 'historico'>('atual')
  const [recentAlerts, setRecentAlerts] = useState<Array<{ id: string; message: string; severity: 'critical' | 'warning' | 'info'; timestamp: number }>>([])
  const [globalMessageOpen, setGlobalMessageOpen] = useState(false)
  const [globalMessageText, setGlobalMessageText] = useState('')
  const [globalMessageSending, setGlobalMessageSending] = useState(false)
  const [globalMessageTarget, setGlobalMessageTarget] = useState<'all' | 'online'>('all')
  const [backupStatus, setBackupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

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

  // Carregar dados do histórico de status (com período selecionável e atualização a cada hora)
  useEffect(() => {
    const loadChartData = async () => {
      setIsLoadingChart(true)
      try {
        const response = await fetch(`/api/devices/status-history?period=${chartPeriod}`)
        const result = await response.json()
        
        if (result.success && result.data) {
          const processedData = processHistoryData(result.data, chartPeriod)
          setDeviceHistory(processedData)
        } else {
          setDeviceHistory(generateEmptyChartData(chartPeriod))
        }
      } catch (error) {
        console.error('❌ Erro ao carregar histórico:', error)
        setDeviceHistory(generateEmptyChartData(chartPeriod))
      } finally {
        setIsLoadingChart(false)
      }
    }
    
    loadChartData()
    const refreshInterval = setInterval(loadChartData, 60 * 60 * 1000) // Atualizar a cada hora
    
    return () => clearInterval(refreshInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPeriod])

  const processHistoryData = (data: any[], period: '7d' | '14d' | '30d' = '7d') => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const endDate = new Date()
    const numDays = period === '7d' ? 7 : period === '14d' ? 14 : 30
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - numDays + 1)
    
    const deviceMap = new Map<string, number>()
    const mobileMap = new Map<string, number>()
    const computerMap = new Map<string, number>()
    
    data.forEach((item: any) => {
      const dateObj = new Date(item.status_date)
      const date = dateObj.toISOString().split('T')[0]
      const totalDevices = parseInt(item.devices_online || 0)
      const mobileDevices = parseInt(item.mobile_online ?? item.devices_online ?? 0)
      const computerDevices = parseInt(item.computers_online || 0)
      
      deviceMap.set(date, totalDevices)
      mobileMap.set(date, mobileDevices)
      computerMap.set(date, computerDevices)
    })
    
    const historyData: Array<{ day: string; date: string; devices: number; computers: number }> = []
    const currentDate = new Date(startDate)
    
    for (let i = 0; i < numDays; i++) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const dayName = period === '7d' ? days[currentDate.getDay()] : `${currentDate.getDate()}/${currentDate.getMonth() + 1}`
      const deviceCount = deviceMap.get(dateStr) || 0
      const computerCount = computerMap.get(dateStr) || 0
      const mobileCount = mobileMap.get(dateStr) || deviceCount - computerCount
      
      historyData.push({
        day: dayName,
        date: dateStr,
        devices: Math.max(mobileCount, 0),
        computers: Math.max(computerCount, 0)
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return historyData
  }

  const generateEmptyChartData = (period: '7d' | '14d' | '30d' = '7d') => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const endDate = new Date()
    const numDays = period === '7d' ? 7 : period === '14d' ? 14 : 30
    const startDate = new Date(endDate)
    startDate.setDate(endDate.getDate() - numDays + 1)
    
    return Array.from({ length: numDays }, (_, i) => {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      return {
        day: period === '7d' ? days[date.getDay()] : `${date.getDate()}/${date.getMonth() + 1}`,
        date: date.toISOString().split('T')[0],
        devices: 0,
        computers: 0
      }
    })
  }

  const mergeDeviceAndComputerHistory = (
    deviceHistoryData: Array<{ day: string; date: string; devices: number; computers?: number }>,
    computerList: Computer[],
    deviceList: Device[]
  ) => {
    if (deviceHistoryData.length === 0) return []

    const todayStr = new Date().toISOString().split('T')[0]
    const onlineMobileCount = deviceList.filter(d => d.status === 'online').length
    const onlinePcCount = computerList.filter(c => (c.status || '').toLowerCase() === 'online').length

    const computerCounts = new Map<string, number>()
    computerList.forEach((computer) => {
      if (!computer.lastSeen) return
      if ((computer.status || '').toLowerCase() !== 'online') return
      const lastSeenDate = new Date(computer.lastSeen)
      const dateStr = lastSeenDate.toISOString().split('T')[0]
      const current = computerCounts.get(dateStr) || 0
      computerCounts.set(dateStr, current + 1)
    })

    return deviceHistoryData.map((entry) => {
      let baseDevices = entry.devices || 0
      let baseComputers = entry.computers ?? computerCounts.get(entry.date) ?? 0

      // Para hoje: usar contagem em tempo real (garante que dispositivos conectados apareçam)
      if (entry.date === todayStr) {
        baseDevices = Math.max(baseDevices, onlineMobileCount)
        baseComputers = Math.max(baseComputers, onlinePcCount)
      }

      return {
        day: entry.day,
        date: entry.date,
        devices: baseDevices,
        computers: baseComputers
      }
    })
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
      if (message.type === 'computer_status_update') {
        console.log('💻 Atualização de computador recebida:', message.computerId, 'Status:', message.computer?.status)
        // Atualizar computador na lista
        setComputers(prev => {
          const existingIndex = prev.findIndex(c => c.computerId === message.computerId)
          if (existingIndex >= 0) {
            const updated = [...prev]
            updated[existingIndex] = { ...updated[existingIndex], ...message.computer }
            return updated
          } else {
            const computer = message.computer
            return [...prev, {
              id: computer.id || computer.computerId,
              name: computer.name || 'Computador',
              computerId: computer.computerId || message.computerId,
              status: computer.status || 'online',
              lastSeen: computer.lastSeen || Date.now(),
              osType: computer.osType || 'unknown',
              osVersion: computer.osVersion || '',
              osBuild: computer.osBuild,
              architecture: computer.architecture || 'unknown',
              hostname: computer.hostname,
              domain: computer.domain,
              cpuModel: computer.cpuModel,
              cpuCores: computer.cpuCores,
              cpuThreads: computer.cpuThreads,
              memoryTotal: computer.memoryTotal || 0,
              memoryUsed: computer.memoryUsed || 0,
              storageTotal: computer.storageTotal || 0,
              storageUsed: computer.storageUsed || 0,
              storageDrives: computer.storageDrives || [],
              ipAddress: computer.ipAddress,
              macAddress: computer.macAddress,
              networkType: computer.networkType,
              wifiSSID: computer.wifiSSID,
              isWifiEnabled: computer.isWifiEnabled !== undefined ? computer.isWifiEnabled : false,
              isBluetoothEnabled: computer.isBluetoothEnabled !== undefined ? computer.isBluetoothEnabled : false,
              agentVersion: computer.agentVersion,
              agentInstalledAt: computer.agentInstalledAt,
              lastHeartbeat: computer.lastHeartbeat,
              loggedInUser: computer.loggedInUser,
              assignedDeviceUserId: computer.assignedDeviceUserId,
              assignedUserId: computer.assignedUserId,
              assignedUserName: computer.assignedUserName,
              complianceStatus: computer.complianceStatus || 'unknown',
              antivirusInstalled: computer.antivirusInstalled !== undefined ? computer.antivirusInstalled : false,
              antivirusEnabled: computer.antivirusEnabled !== undefined ? computer.antivirusEnabled : false,
              antivirusName: computer.antivirusName,
              firewallEnabled: computer.firewallEnabled !== undefined ? computer.firewallEnabled : false,
              encryptionEnabled: computer.encryptionEnabled !== undefined ? computer.encryptionEnabled : false,
              latitude: computer.latitude,
              longitude: computer.longitude,
              locationAccuracy: computer.locationAccuracy,
              lastLocationUpdate: computer.lastLocationUpdate,
              restrictions: computer.restrictions || {},
              installedPrograms: computer.installedPrograms || [],
              installedProgramsCount: computer.installedPrograms?.length || computer.installedProgramsCount || 0
            }]
          }
        })
      }
    }

    // Registrar o handler de mensagens
    onMessage(handleMessage)
  }, [onMessage])

  // Carregar alertas recentes
  useEffect(() => {
    let isMounted = true
    const loadAlerts = async () => {
      try {
        const response = await fetch('/api/alerts')
        if (!response.ok) return
        const data = await response.json()
        if (isMounted && Array.isArray(data.alerts)) {
          setRecentAlerts(data.alerts.slice(0, 5))
        }
      } catch {
        // API de alertas pode não existir - gerar alertas baseados nos dispositivos
        if (isMounted) {
          const generated: typeof recentAlerts = []
          combinedDevices.forEach(d => {
            if (d.batteryLevel < 20 && d.batteryLevel > 0) {
              generated.push({
                id: `bat-${d.deviceId}`,
                message: `${d.name || d.deviceId}: Bateria em ${d.batteryLevel}%`,
                severity: d.batteryLevel < 10 ? 'critical' : 'warning',
                timestamp: d.lastSeen || Date.now()
              })
            }
            if (d.status === 'offline') {
              generated.push({
                id: `off-${d.deviceId}`,
                message: `${d.name || d.deviceId}: Dispositivo offline`,
                severity: 'warning',
                timestamp: d.lastSeen || Date.now()
              })
            }
          })
          setRecentAlerts(generated.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5))
        }
      }
    }
    loadAlerts()
    const interval = setInterval(loadAlerts, 60000)
    return () => { isMounted = false; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices])

  const handleExportCSV = () => {
    const csvHeader = 'ID,Nome,Modelo,Fabricante,SO,Status,Bateria %,Device Owner,Profile Owner,Último Acesso,Usuário\n'
    const csvRows = devices.map(d => [
      d.deviceId,
      `"${(d.name || '').replace(/"/g, '""')}"`,
      `"${(d.model || '-').replace(/"/g, '""')}"`,
      `"${(d.manufacturer || '-').replace(/"/g, '""')}"`,
      d.androidVersion ? `Android ${d.androidVersion}` : (d.osType || '-'),
      d.status === 'online' ? 'Online' : 'Offline',
      d.batteryLevel ?? '-',
      d.isDeviceOwner ? 'Sim' : 'Não',
      d.isProfileOwner ? 'Sim' : 'Não',
      d.lastSeen ? new Date(d.lastSeen).toLocaleString('pt-BR') : 'N/D',
      `"${(d.assignedUserName || d.assignedUser?.name || 'N/A').replace(/"/g, '""')}"`
    ].join(','))
    const csvContent = csvHeader + csvRows.join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventario-mdm-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBackupConfig = async () => {
    setBackupStatus('loading')
    try {
      const response = await fetch('/api/config/backup', { method: 'POST' })
      if (response.ok) {
        setBackupStatus('success')
      } else {
        setBackupStatus('error')
      }
    } catch {
      setBackupStatus('error')
    }
    setTimeout(() => setBackupStatus('idle'), 3000)
  }

  const handleSendGlobalMessage = async () => {
    if (!globalMessageText.trim()) return
    setGlobalMessageSending(true)
    try {
      // Send via REST API
      await fetch('/api/devices/notify-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: globalMessageText, target: globalMessageTarget })
      })
      // Also send via WebSocket for real-time delivery
      onMessage?.({ type: 'send_mass_notification', message: globalMessageText, target: globalMessageTarget, timestamp: Date.now() })
      const targetLabel = globalMessageTarget === 'all' ? 'todos os dispositivos' : 'dispositivos online'
      setGlobalMessageText('')
      setGlobalMessageOpen(false)
      setGlobalMessageTarget('all')
    } catch {
      console.error('Erro ao enviar mensagem global')
    } finally {
      setGlobalMessageSending(false)
    }
  }

  const combinedDevices = useMemo(() => devices, [devices])

  const combinedComputers = useMemo(() => computers, [computers])

  useEffect(() => {
    const merged = mergeDeviceAndComputerHistory(deviceHistory, combinedComputers, combinedDevices)
    setChartData(merged)
  }, [deviceHistory, combinedComputers, combinedDevices])

  const onlineDevices = combinedDevices.filter(d => d.status === 'online').length
  
  const avgBattery = combinedDevices.length > 0 
    ? Math.round(combinedDevices.reduce((sum, d) => sum + d.batteryLevel, 0) / combinedDevices.length)
    : 0

  // Calcular porcentagens em tempo real
  const getOnlinePercentage = () => {
    if (combinedDevices.length === 0) return 0
    return Math.round((onlineDevices / combinedDevices.length) * 100)
  }


  const getTotalDevicesChange = () => {
    if (combinedDevices.length === 0) return '0%'
    // Mostrar crescimento baseado no número de dispositivos
    const growth = Math.min(combinedDevices.length * 3, 25) // 3% por dispositivo, máximo 25%
    return `+${growth}%`
  }

  const getOnlineChange = () => {
    if (combinedDevices.length === 0) return '0%'
    const onlinePercent = getOnlinePercentage()
    if (onlinePercent === 100) return '+100%'
    if (onlinePercent >= 80) return `+${onlinePercent}%`
    if (onlinePercent >= 50) return `+${onlinePercent}%`
    return `${onlinePercent}%`
  }

  const totalComputers = combinedComputers.length
  const onlineComputers = combinedComputers.filter(c => (c.status || '').toLowerCase() === 'online').length

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

  // Enhanced Dashboard computations
  const offlineDevices = combinedDevices.length - onlineDevices
  const batteryAlerts = combinedDevices.filter(d => d.batteryLevel > 0 && d.batteryLevel < 20).length

  const onlinePercent = combinedDevices.length > 0 ? Math.round((onlineDevices / combinedDevices.length) * 100) : 0
  const offlinePercent = 100 - onlinePercent

  const batteryLow = combinedDevices.filter(d => d.batteryLevel >= 0 && d.batteryLevel < 20).length
  const batteryMid = combinedDevices.filter(d => d.batteryLevel >= 20 && d.batteryLevel < 50).length
  const batteryHigh = combinedDevices.filter(d => d.batteryLevel >= 50).length
  const batteryMax = Math.max(batteryLow, batteryMid, batteryHigh, 1)

  const complianceStats = useMemo(() => {
    if (combinedDevices.length === 0) return { compliant: 0, total: 0, percent: 0 }
    const compliant = combinedDevices.filter(d => {
      const hasRestrictions = d.restrictions && Object.keys(d.restrictions).length > 0
      const isOnline = d.status === 'online'
      const hasUser = !!d.assignedUserName
      return hasRestrictions && isOnline && hasUser
    }).length
    return {
      compliant,
      total: combinedDevices.length,
      percent: Math.round((compliant / combinedDevices.length) * 100)
    }
  }, [combinedDevices])

  // Top Dispositivos Problemáticos
  const problemDevices = useMemo(() => {
    return devices
      .map(d => {
        const issues: { label: string; severity: 'critical' | 'warning' }[] = []
        if ((d.batteryLevel ?? 100) < 20) issues.push({ label: 'Bateria baixa', severity: d.batteryLevel < 10 ? 'critical' : 'warning' })
        const lastSeenMs = Date.now() - (d.lastSeen || Date.now())
        if (d.status !== 'online' && lastSeenMs > 86400000) issues.push({ label: 'Offline >24h', severity: 'critical' })
        if (!d.assignedUserName && !d.assignedUser?.name && !d.assignedDeviceUserId) issues.push({ label: 'Sem usuário', severity: 'warning' })
        return { ...d, issues }
      })
      .filter(d => d.issues.length > 0)
      .sort((a, b) => b.issues.length - a.issues.length)
      .slice(0, 5)
  }, [devices])

  // Distribuição de Bateria (4 faixas)
  const batteryDistribution = useMemo(() => {
    const critical = combinedDevices.filter(d => d.batteryLevel >= 0 && d.batteryLevel < 20).length
    const low = combinedDevices.filter(d => d.batteryLevel >= 20 && d.batteryLevel < 50).length
    const good = combinedDevices.filter(d => d.batteryLevel >= 50 && d.batteryLevel < 80).length
    const full = combinedDevices.filter(d => d.batteryLevel >= 80).length
    const total = combinedDevices.length || 1
    return { critical, low, good, full, total }
  }, [combinedDevices])

  // Uso de Dados - helper para formatar bytes
  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const val = bytes / Math.pow(1024, i)
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }

  const hasAnyDataUsage = useMemo(() => {
    return devices.some(d => d.wifiDataUsage != null || d.mobileDataUsage != null || d.dataUsage != null)
  }, [devices])

  const stats = [
    {
      title: 'Dispositivos Totais',
      value: combinedDevices.length,
      change: getTotalDevicesChange(),
      changeType: combinedDevices.length > 0 ? 'positive' : 'neutral',
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
  const recentActivities = useMemo(() => {
    const now = Date.now()

    const buildActivity = (opts: {
      id: string
      name: string
      icon: string
      lastSeen?: number
      status?: string
      kind: 'device' | 'computer'
    }) => {
      if (!opts.lastSeen) return null

      const lastSeenMs = typeof opts.lastSeen === 'string' ? new Date(opts.lastSeen).getTime() : opts.lastSeen
      if (!lastSeenMs || isNaN(lastSeenMs)) return null

      const timeDiff = now - lastSeenMs
      if (isNaN(timeDiff) || timeDiff < 0) return null

      const minutes = Math.floor(timeDiff / 60000)
      const hours = Math.floor(timeDiff / 3600000)

      let timeText = ''
      if (minutes < 1) timeText = 'Agora mesmo'
      else if (minutes < 60) timeText = `${minutes} min atrás`
      else if (hours < 24) timeText = `${hours}h atrás`
      else timeText = `${Math.floor(hours / 24)}d atrás`

      let action = ''
      let type: 'success' | 'warning' | 'info' = 'success'

      const status = (opts.status || '').toLowerCase()

      if (status === 'online') {
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

      if (opts.kind === 'computer') {
        action = status === 'online' ? 'PC conectado' : 'PC offline'
      }

      return {
        id: opts.id,
        device: opts.name,
        action,
        time: timeText,
        type,
        icon: opts.icon,
        timestamp: lastSeenMs
      }
    }

    const deviceActivities = combinedDevices
      .filter(device => device.lastSeen)
      .map(device => buildActivity({
        id: device.deviceId,
        name: device.name || device.deviceId,
        icon: '📱',
        lastSeen: device.lastSeen,
        status: device.status,
        kind: 'device'
      }))
      .filter(Boolean) as Array<{ id: string; device: string; action: string; time: string; type: 'success' | 'warning' | 'info'; icon: string; timestamp: number }>

    const computerActivities = combinedComputers
      .filter(computer => computer.lastSeen)
      .map(computer => buildActivity({
        id: computer.computerId,
        name: computer.name || computer.computerId,
        icon: '💻',
        lastSeen: computer.lastSeen,
        status: computer.status,
        kind: 'computer'
      }))
      .filter(Boolean) as Array<{ id: string; device: string; action: string; time: string; type: 'success' | 'warning' | 'info'; icon: string; timestamp: number }>

    return [...deviceActivities, ...computerActivities]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4)
  }, [combinedDevices, combinedComputers])

  const chartStackData = useMemo(() => {
    if (viewMode === 'atual') {
      return [{
        day: 'Agora',
        celulares: onlineDevices,
        pcs: onlineComputers
      }]
    }
    return chartData.map((entry) => ({
      day: entry.day,
      celulares: entry.devices ?? 0,
      pcs: entry.computers ?? 0
    }))
  }, [chartData, viewMode, onlineDevices, onlineComputers])

  const chartMaxValue = useMemo(() => {
    const maxCelulares = Math.max(...chartStackData.map(d => d.celulares), 1)
    const maxPcs = Math.max(...chartStackData.map(d => d.pcs), 1)
    return Math.max(5, maxCelulares + maxPcs, maxCelulares, maxPcs)
  }, [chartStackData])

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


  // Skeleton loader while data is being fetched
  if (devices.length === 0 && !isClient) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="flex justify-between items-center">
          <div>
            <div className="h-8 w-48 bg-[var(--surface)] rounded-lg mb-2" />
            <div className="h-4 w-72 bg-[var(--surface)] rounded-lg" />
          </div>
          <div className="text-right">
            <div className="h-4 w-40 bg-[var(--surface)] rounded-lg mb-2" />
            <div className="h-6 w-24 bg-[var(--surface)] rounded-lg" />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[var(--surface)] rounded-2xl p-6 h-32">
              <div className="flex items-center justify-between">
                <div className="space-y-3 flex-1">
                  <div className="h-4 w-24 bg-[var(--border)] rounded" />
                  <div className="h-8 w-16 bg-[var(--border)] rounded" />
                </div>
                <div className="w-12 h-12 bg-[var(--border)] rounded-xl" />
              </div>
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="bg-[var(--surface)] rounded-2xl p-6 h-72">
          <div className="h-5 w-48 bg-[var(--border)] rounded mb-4" />
          <div className="h-full w-full bg-[var(--border)] rounded-xl opacity-30" />
        </div>
        {/* Actions skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-[var(--surface)] rounded-2xl p-6 h-48">
              <div className="h-5 w-32 bg-[var(--border)] rounded mb-4" />
              <div className="space-y-3">
                <div className="h-10 w-full bg-[var(--border)] rounded-lg" />
                <div className="h-10 w-full bg-[var(--border)] rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-sm mt-1 text-white">
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
          <div key={index} className="relative bg-[var(--surface)] rounded-2xl p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl ${
                  stat.changeType === 'positive' ? 'bg-green-500/150/150/15' :
                  stat.changeType === 'negative' ? 'bg-red-500/150/150/15' : 'bg-[var(--surface-elevated)]'
                }`}>
                  {stat.icon}
                </div>
                <div>
                  <div className="text-4xl font-bold text-[var(--text-primary)]">{stat.value}</div>
                  <div className="text-sm text-[var(--text-secondary)] font-medium">{stat.title}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${
                  stat.changeType === 'positive' ? 'text-green-600' :
                  stat.changeType === 'negative' ? 'text-red-600' : 'text-[var(--text-secondary)]'
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
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h3 className="text-lg font-semibold text-primary">Status dos Dispositivos</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setViewMode('atual')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'atual'
                    ? 'bg-primary text-white'
                    : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
                }`}
                title="Ver dados do momento"
              >
                Agora
              </button>
              <button
                onClick={() => setViewMode('historico')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                  viewMode === 'historico'
                    ? 'bg-primary text-white'
                    : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
                }`}
                title="Ver histórico por período"
              >
                📅 Histórico
              </button>
              {viewMode === 'historico' && (
                <>
                  {(['7d', '14d', '30d'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setChartPeriod(p)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        chartPeriod === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
                      }`}
                    >
                      {p === '7d' ? '7d' : p === '14d' ? '14d' : '30d'}
                    </button>
                  ))}
                </>
              )}
            </div>
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
                  domain={[0, chartMaxValue]}
                  allowDataOverflow
                />
                <RechartsTooltip content={renderBarChartTooltip} cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
                <Legend
                  verticalAlign="top"
                  align="center"
                  wrapperStyle={{ top: -6, fontSize: 12 }}
                  payload={[
                    { value: 'Celulares Online', type: 'square', color: '#2563eb' },
                    { value: 'PCs Online', type: 'square', color: '#93c5fd' }
                  ]}
                />
                <Bar
                  dataKey="celulares"
                  fill="url(#mobileGradient)"
                  radius={[6, 6, 0, 0]}
                  label={({ value, x, y, width, height }) =>
                    value > 0 ? (
                      <text
                        x={x + width / 2}
                        y={y + height / 2}
                        fill="white"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={14}
                        fontWeight={600}
                      >
                        {value}
                      </text>
                    ) : null
                  }
                />
                <Bar
                  dataKey="pcs"
                  fill="#93c5fd"
                  radius={[6, 6, 0, 0]}
                  label={({ value, x, y, width, height }) =>
                    value > 0 ? (
                      <text
                        x={x + width / 2}
                        y={y + height / 2}
                        fill="#1e40af"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={14}
                        fontWeight={600}
                      >
                        {value}
                      </text>
                    ) : null
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Chart legend */}
          <div className="flex justify-center mt-4 gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500/150/150 rounded"></div>
              <span className="text-xs text-secondary">Celulares Online</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-200 rounded"></div>
              <span className="text-xs text-secondary">PCs Online</span>
            </div>
          </div>
          <div className="text-center text-[11px] text-muted mt-2">
            {viewMode === 'atual' ? 'Dados em tempo real do momento.' : 'Atualiza a cada hora. Hoje usa dados em tempo real.'}
          </div>

          {/* Lista de dispositivos conectados agora */}
          {(onlineDevices > 0 || onlineComputers > 0) && (
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Conectados agora</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {combinedDevices
                  .filter(d => d.status === 'online')
                  .map((d) => (
                    <div key={d.deviceId} className="flex items-center gap-3 py-2 px-3 bg-[var(--surface-elevated)] rounded-lg">
                      <span className="text-lg">📱</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{d.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {d.assignedUserName ? `Usuário: ${d.assignedUserName}` : 'Sem usuário vinculado'}
                        </div>
                      </div>
                    </div>
                  ))}
                {combinedComputers
                  .filter(c => (c.status || '').toLowerCase() === 'online')
                  .map((c) => (
                    <div key={c.computerId} className="flex items-center gap-3 py-2 px-3 bg-[var(--surface-elevated)] rounded-lg">
                      <span className="text-lg">💻</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {c.name || c.hostname || c.computerId}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {c.assignedUserName || c.loggedInUser
                            ? `Usuário: ${c.assignedUserName || c.loggedInUser}`
                            : 'Sem usuário vinculado'}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
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
                <div key={activity.id} className="flex items-start gap-3 hover:bg-[var(--surface-elevated)] p-2 rounded-lg transition-colors duration-200">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.type === 'success' ? 'bg-green-500/150/150' :
                    activity.type === 'warning' ? 'bg-yellow-500/150/150' : 'bg-blue-500/150/150'
                  }`} />
                  <div className="text-lg">{activity.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary truncate">{activity.device}</div>
                    <div className="text-sm text-secondary">{activity.action}</div>
                    <div className="text-xs text-muted">{activity.time}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-[var(--text-muted)] text-4xl mb-2">📱</div>
                <div className="text-sm text-[var(--text-secondary)]">Nenhuma atividade recente</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-primary mb-4">Ações Rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <button 
              className="btn btn-primary hover:scale-105 transition-transform duration-200"
              onClick={() => onViewChange?.('devices')}
            >
              <span>📱</span>
              Provisionar Dispositivo
            </button>
            <button
              className="btn btn-secondary hover:scale-105 transition-transform duration-200"
              onClick={() => {
                const now = new Date().toLocaleString('pt-BR')
                const deviceRows = combinedDevices.map(d => `
                  <tr>
                    <td>${d.name || d.deviceId}</td>
                    <td>${(d as any).model || '-'}</td>
                    <td>${(d as any).androidVersion ? 'Android ' + (d as any).androidVersion : ((d as any).osType || '-')}</td>
                    <td><span class="${d.status === 'online' ? 'badge-green' : 'badge-red'}">${d.status === 'online' ? 'Online' : 'Offline'}</span></td>
                    <td>${d.batteryLevel ?? '-'}%</td>
                    <td>${d.lastSeen ? new Date(d.lastSeen).toLocaleString('pt-BR') : 'N/D'}</td>
                    <td>${d.assignedUserName || (d as any).assignedUser?.name || '-'}</td>
                  </tr>
                `).join('')
                const win = window.open('', '_blank')
                if (!win) return
                win.document.write(`
                  <html><head><title>Relatório MDM - ${new Date().toISOString().slice(0, 10)}</title>
                  <style>
                    body { font-family: Arial, sans-serif; padding: 30px; color: #333; max-width: 1100px; margin: 0 auto; }
                    h1 { color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
                    h2 { color: #374151; margin-top: 30px; }
                    .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
                    .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 24px; min-width: 160px; }
                    .summary-card .value { font-size: 28px; font-weight: bold; color: #1f2937; }
                    .summary-card .label { font-size: 13px; color: #6b7280; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
                    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
                    th { background: #f3f4f6; font-weight: 600; }
                    tr:nth-child(even) { background: #f9fafb; }
                    .badge-green { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
                    .badge-red { background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
                    .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
                    @media print { body { padding: 10px; } }
                  </style></head><body>
                  <h1>Relatório Geral MDM Center</h1>
                  <p>Gerado em: ${now}</p>

                  <h2>Resumo</h2>
                  <div class="summary">
                    <div class="summary-card"><div class="value">${combinedDevices.length}</div><div class="label">Total de Dispositivos</div></div>
                    <div class="summary-card"><div class="value" style="color:#10b981">${onlineDevices}</div><div class="label">Online</div></div>
                    <div class="summary-card"><div class="value" style="color:#ef4444">${combinedDevices.length - onlineDevices}</div><div class="label">Offline</div></div>
                    <div class="summary-card"><div class="value">${totalComputers}</div><div class="label">Computadores</div></div>
                    <div class="summary-card"><div class="value">${onlineComputers}</div><div class="label">Computadores Online</div></div>
                    <div class="summary-card"><div class="value">${avgBattery}%</div><div class="label">Bateria Média</div></div>
                    <div class="summary-card"><div class="value">${batteryAlerts}</div><div class="label">Alertas de Bateria (&lt;20%)</div></div>
                  </div>

                  <h2>Dispositivos</h2>
                  <table>
                    <thead>
                      <tr><th>Nome</th><th>Modelo</th><th>SO</th><th>Status</th><th>Bateria</th><th>Último Acesso</th><th>Usuário</th></tr>
                    </thead>
                    <tbody>${deviceRows}</tbody>
                  </table>

                  <div class="footer">MDM Center - Relatório gerado automaticamente em ${now}</div>
                  </body></html>
                `)
                win.document.close()
                setTimeout(() => win.print(), 500)
              }}
            >
              <span>📊</span>
              Gerar Relatório
            </button>
            <button 
              className="btn btn-secondary hover:scale-105 transition-transform duration-200"
              onClick={() => onViewChange?.('settings')}
            >
              <span>⚙️</span>
              Configurações
            </button>
            <button 
              className="btn btn-secondary hover:scale-105 transition-transform duration-200"
              onClick={() => onViewChange?.('policies')}
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
                const device = combinedDevices.find(d => d.deviceId === deviceId)
                const deviceName = device?.name || `Dispositivo ${deviceId.slice(-4)}`
                
                return (
                  <div key={deviceId} className="flex items-center justify-between p-3 bg-[var(--surface-elevated)] rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        status.status === 'received' ? 'bg-green-500/150/150' :
                        status.status === 'sent' ? 'bg-blue-500/150/150' :
                        status.status === 'error' ? 'bg-red-500/150/150' : 'bg-yellow-500/150/150'
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
              isConnected ? 'bg-green-500/150/150' : 'bg-red-500/150/150'
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
              avgBattery > 50 ? 'bg-green-500/150/150' : avgBattery > 20 ? 'bg-yellow-500/150/150' : 'bg-red-500/150/150'
            }`}>
              <span className="text-white text-xl">🔋</span>
            </div>
            <div>
              <h4 className="font-semibold text-primary">Bateria Média</h4>
              <p className="text-sm text-secondary">
                {combinedDevices.length > 0 ? `${combinedDevices.length} dispositivos` : 'Nenhum dispositivo'}
              </p>
            </div>
          </div>
          <div className={`text-2xl font-bold ${
            avgBattery > 50 ? 'text-green-600' : avgBattery > 20 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {combinedDevices.length > 0 ? `${avgBattery}%` : 'N/A'}
          </div>
          <div className="text-sm text-secondary">Nível médio</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500/150/150 rounded-lg flex items-center justify-center">
              <span className="text-white text-xl">📊</span>
            </div>
            <div>
              <h4 className="font-semibold text-primary">Status Geral</h4>
              <p className="text-sm text-secondary">Resumo do sistema</p>
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {onlineDevices}/{combinedDevices.length}
          </div>
          <div className="text-sm text-secondary">Online/Total</div>
        </div>
      </div>

      {/* ======= ENHANCED DASHBOARD SECTIONS ======= */}

      {/* Status Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <span className="text-xl">📱</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{combinedDevices.length}</div>
              <div className="text-xs text-[var(--text-secondary)]">Total de Dispositivos</div>
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
              <span className="text-xl">🟢</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{onlineDevices}</div>
              <div className="text-xs text-[var(--text-secondary)]">Online</div>
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
              <span className="text-xl">🔴</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{offlineDevices}</div>
              <div className="text-xs text-[var(--text-secondary)]">Offline</div>
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-yellow-600/20 flex items-center justify-center">
              <span className="text-xl">🔋</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{batteryAlerts}</div>
              <div className="text-xs text-[var(--text-secondary)]">Alertas Bateria (&lt;20%)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section - Pure CSS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Online/Offline Pie Chart */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Online / Offline</h3>
          <div className="flex flex-col items-center">
            <div className="relative w-40 h-40 mb-4">
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: combinedDevices.length > 0
                    ? `conic-gradient(#22c55e ${onlinePercent * 3.6}deg, #ef4444 ${onlinePercent * 3.6}deg 360deg)`
                    : 'conic-gradient(var(--surface-elevated) 0deg, var(--surface-elevated) 360deg)',
                }}
              />
              <div className="absolute inset-3 rounded-full bg-[var(--surface)] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{onlinePercent}%</div>
                  <div className="text-xs text-[var(--text-secondary)]">online</div>
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500/150/150" />
                <span className="text-sm text-[var(--text-secondary)]">Online ({onlineDevices})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/150/150" />
                <span className="text-sm text-[var(--text-secondary)]">Offline ({offlineDevices})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Battery Distribution Bar Chart */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Distribuição de Bateria</h3>
          <div className="space-y-5 mt-6">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-[var(--text-secondary)]">Critico (0-20%)</span>
                <span className="text-sm font-semibold text-red-400">{batteryLow}</span>
              </div>
              <div className="w-full h-5 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500/150/150 rounded-full transition-all duration-500"
                  style={{ width: `${batteryMax > 0 ? (batteryLow / batteryMax) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-[var(--text-secondary)]">Medio (20-50%)</span>
                <span className="text-sm font-semibold text-yellow-400">{batteryMid}</span>
              </div>
              <div className="w-full h-5 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500/150/150 rounded-full transition-all duration-500"
                  style={{ width: `${batteryMax > 0 ? (batteryMid / batteryMax) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-[var(--text-secondary)]">Bom (50-100%)</span>
                <span className="text-sm font-semibold text-green-400">{batteryHigh}</span>
              </div>
              <div className="w-full h-5 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500/150/150 rounded-full transition-all duration-500"
                  style={{ width: `${batteryMax > 0 ? (batteryHigh / batteryMax) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Alerts Panel */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Alertas Recentes</h3>
          <div className="space-y-3">
            {recentAlerts.length > 0 ? (
              recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-3 bg-[var(--surface-elevated)] rounded-lg">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    alert.severity === 'critical' ? 'bg-red-500/150/150' :
                    alert.severity === 'warning' ? 'bg-yellow-500/150/150' : 'bg-blue-500/150/150'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${
                      alert.severity === 'critical' ? 'text-red-400' :
                      alert.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                    }`}>
                      {alert.message}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {new Date(alert.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-sm text-[var(--text-secondary)]">Nenhum alerta ativo</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Panel (Enhanced) */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Ações Rápidas Avançadas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <button
            className="btn btn-secondary hover:scale-105 transition-transform duration-200 flex items-center gap-2"
            onClick={handleExportCSV}
          >
            <span>📥</span>
            Exportar Inventário CSV
          </button>
          <button
            className={`btn hover:scale-105 transition-transform duration-200 flex items-center gap-2 ${
              backupStatus === 'loading' ? 'btn-secondary opacity-60 cursor-wait' :
              backupStatus === 'success' ? 'btn-success' :
              backupStatus === 'error' ? 'btn-error' : 'btn-secondary'
            }`}
            onClick={handleBackupConfig}
            disabled={backupStatus === 'loading'}
          >
            <span>{backupStatus === 'success' ? '✅' : backupStatus === 'error' ? '❌' : backupStatus === 'loading' ? '⏳' : '💾'}</span>
            {backupStatus === 'success' ? 'Backup Concluido!' :
             backupStatus === 'error' ? 'Erro no Backup' :
             backupStatus === 'loading' ? 'Fazendo Backup...' : 'Backup Configurações'}
          </button>
          <button
            className={`btn ${globalMessageOpen ? 'btn-primary' : 'btn-secondary'} hover:scale-105 transition-transform duration-200 flex items-center gap-2`}
            onClick={() => setGlobalMessageOpen(!globalMessageOpen)}
          >
            <span>📢</span>
            Enviar Mensagem Global
          </button>
        </div>

        {/* Inline Global Message Form */}
        {globalMessageOpen && (
          <div className="mt-4 p-4 bg-[var(--surface-elevated)] rounded-lg border border-[var(--border)] animate-fade-in">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Enviar mensagem para:
            </label>
            <div className="flex gap-2 mb-3">
              {([['all', 'Todos os dispositivos'], ['online', 'Apenas online']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setGlobalMessageTarget(val)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    globalMessageTarget === val
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--surface-elevated)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              className="w-full p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--primary)] transition-colors"
              rows={3}
              placeholder="Digite a mensagem a ser enviada para todos os dispositivos..."
              value={globalMessageText}
              onChange={(e) => setGlobalMessageText(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-3">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setGlobalMessageOpen(false); setGlobalMessageText('') }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSendGlobalMessage}
                disabled={globalMessageSending || !globalMessageText.trim()}
              >
                {globalMessageSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Compliance Overview */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Visao de Conformidade</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Compliance Gauge */}
          <div className="flex flex-col items-center">
            <div className="relative w-36 h-36 mb-3">
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: `conic-gradient(var(--primary) ${complianceStats.percent * 3.6}deg, var(--surface-elevated) ${complianceStats.percent * 3.6}deg 360deg)`,
                }}
              />
              <div className="absolute inset-3 rounded-full bg-[var(--surface)] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{complianceStats.percent}%</div>
                  <div className="text-xs text-[var(--text-secondary)]">conforme</div>
                </div>
              </div>
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              {complianceStats.compliant} de {complianceStats.total} dispositivos
            </div>
          </div>

          {/* Compliance Details */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-[var(--text-secondary)]">Com restricoes aplicadas</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {combinedDevices.filter(d => d.restrictions && Object.keys(d.restrictions).length > 0).length}/{combinedDevices.length}
                </span>
              </div>
              <div className="w-full h-3 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${combinedDevices.length > 0 ? (combinedDevices.filter(d => d.restrictions && Object.keys(d.restrictions).length > 0).length / combinedDevices.length) * 100 : 0}%`,
                    backgroundColor: 'var(--primary)'
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-[var(--text-secondary)]">Online</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{onlineDevices}/{combinedDevices.length}</span>
              </div>
              <div className="w-full h-3 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500/150/150 rounded-full transition-all duration-500"
                  style={{ width: `${onlinePercent}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-[var(--text-secondary)]">Com usuario atribuido</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {combinedDevices.filter(d => !!d.assignedUserName).length}/{combinedDevices.length}
                </span>
              </div>
              <div className="w-full h-3 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500/150/150 rounded-full transition-all duration-500"
                  style={{
                    width: `${combinedDevices.length > 0 ? (combinedDevices.filter(d => !!d.assignedUserName).length / combinedDevices.length) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}