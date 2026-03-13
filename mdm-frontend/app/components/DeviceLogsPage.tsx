'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface DeviceLogsPageProps {
  devices: any[]
  sendMessage: (msg: any) => void
}

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

function formatLogTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function classifyLogLevel(action: string): 'info' | 'warn' | 'error' {
  const lower = action.toLowerCase()
  if (lower.includes('delete') || lower.includes('lock') || lower.includes('error') || lower.includes('fail') || lower.includes('block') || lower.includes('format') || lower.includes('alarm')) {
    return 'error'
  }
  if (lower.includes('disconnect') || lower.includes('changed') || lower.includes('update') || lower.includes('warning') || lower.includes('restart')) {
    return 'warn'
  }
  return 'info'
}

export default function DeviceLogsPage({ devices, sendMessage }: DeviceLogsPageProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Detect if user scrolled up to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
      setAutoScroll(isAtBottom)
    }
  }, [])

  // Load audit logs for selected device
  const loadDeviceLogs = useCallback(async (deviceId: string) => {
    if (!deviceId) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/audit-logs?limit=100`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          const deviceLogs: LogEntry[] = data.data
            .filter((log: any) => {
              const details = typeof log.details === 'string' ? log.details : JSON.stringify(log.details || '')
              return (
                log.target_id === deviceId ||
                details.includes(deviceId) ||
                (log.target_name && devices.find(d => d.deviceId === deviceId && d.deviceName === log.target_name))
              )
            })
            .map((log: any, index: number) => ({
              id: log.id || `audit-${index}`,
              timestamp: log.created_at || log.timestamp || new Date().toISOString(),
              level: classifyLogLevel(log.action || ''),
              source: log.action || 'system',
              message: `${log.action || 'event'}: ${log.target_name || log.target_id || ''} ${log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : ''}`.trim()
            }))
          setLogs(deviceLogs)
        }
      }
    } catch (error) {
      console.error('Erro ao carregar logs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [devices])

  // Load logs when device changes
  useEffect(() => {
    if (selectedDeviceId) {
      setLogs([])
      loadDeviceLogs(selectedDeviceId)
    }
  }, [selectedDeviceId, loadDeviceLogs])

  // Listen for real-time WebSocket events and add as log entries
  useEffect(() => {
    if (!selectedDeviceId) return

    const handleWsMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (!data.type) return

        // Check if event is related to selected device
        const eventDeviceId = data.deviceId || data.device_id || ''
        if (eventDeviceId !== selectedDeviceId) return

        let level: 'info' | 'warn' | 'error' = 'info'
        let message = ''

        switch (data.type) {
          case 'device_status':
            message = `Status atualizado: bateria ${data.batteryLevel || '?'}%, ${data.isCharging ? 'carregando' : 'descarregando'}`
            break
          case 'location_update':
            message = `Localização: ${data.latitude?.toFixed(6) || '?'}, ${data.longitude?.toFixed(6) || '?'}`
            break
          case 'device_connected':
            message = 'Dispositivo conectado'
            break
          case 'device_disconnected':
            level = 'warn'
            message = 'Dispositivo desconectado'
            break
          case 'app_installed':
            message = `App instalado: ${data.appName || data.packageName || '?'}`
            break
          case 'app_removed':
            level = 'warn'
            message = `App removido: ${data.appName || data.packageName || '?'}`
            break
          case 'compliance_violation':
            level = 'error'
            message = `Violação de compliance: ${data.reason || '?'}`
            break
          default:
            message = `${data.type}: ${JSON.stringify(data).substring(0, 120)}`
            break
        }

        if (message) {
          const newEntry: LogEntry = {
            id: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date().toISOString(),
            level,
            source: data.type,
            message
          }
          setLogs(prev => [...prev, newEntry])
        }
      } catch {}
    }

    // Try to attach to existing WebSocket connections
    // The WebSocket events will be captured through the global message handler
    window.addEventListener('message', handleWsMessage as any)

    return () => {
      window.removeEventListener('message', handleWsMessage as any)
    }
  }, [selectedDeviceId])

  const clearLogs = () => {
    setLogs([])
  }

  const filteredDevices = devices.filter(d =>
    !searchQuery ||
    (d.deviceName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.deviceId || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.level === filter)

  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId)

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'info': return 'text-green-400'
      default: return 'text-gray-400'
    }
  }

  const getLevelBg = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-500/10'
      case 'warn': return 'bg-yellow-500/10'
      case 'info': return 'bg-green-500/10'
      default: return ''
    }
  }

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'error': return 'ERROR'
      case 'warn': return 'WARN '
      case 'info': return 'INFO '
      default: return level.toUpperCase()
    }
  }

  return (
    <div className="px-6 pb-6 h-full">
      <div className="flex gap-4 h-[calc(100vh-260px)]">
        {/* Left sidebar - Device list */}
        <div className="w-72 flex-shrink-0 bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden flex flex-col">
          <div className="p-3 border-b border-[var(--border)]">
            <input
              type="text"
              placeholder="Buscar dispositivo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredDevices.length > 0 ? (
              filteredDevices.map((device) => (
                <button
                  key={device.deviceId}
                  onClick={() => setSelectedDeviceId(device.deviceId)}
                  className={`w-full text-left p-3 border-b border-[var(--border)] transition-colors ${
                    selectedDeviceId === device.deviceId
                      ? 'bg-blue-500/20 border-l-2 border-l-blue-500'
                      : 'hover:bg-[var(--surface-elevated)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      device.isOnline ? 'bg-green-500' : 'bg-gray-500'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {device.deviceName || device.model || 'Sem nome'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {device.model || device.deviceId}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-[var(--text-muted)]">
                Nenhum dispositivo encontrado
              </div>
            )}
          </div>
        </div>

        {/* Main area - Log terminal */}
        <div className="flex-1 bg-[#0d1117] rounded-xl border border-[var(--border)] overflow-hidden flex flex-col">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
              </div>
              <span className="text-sm text-gray-400 font-mono">
                {selectedDevice ? `${selectedDevice.deviceName || selectedDevice.model || 'device'} - logs` : 'selecione um dispositivo'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Filter buttons */}
              {(['all', 'info', 'warn', 'error'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    filter === f
                      ? f === 'all' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : f === 'info' ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : f === 'warn' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'text-gray-500 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'info' ? 'Info' : f === 'warn' ? 'Warning' : 'Error'}
                </button>
              ))}
              <div className="w-px h-4 bg-[#30363d] mx-1"></div>
              <button
                onClick={clearLogs}
                className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors border border-transparent hover:border-[#30363d] rounded"
              >
                Limpar
              </button>
              <button
                onClick={() => selectedDeviceId && loadDeviceLogs(selectedDeviceId)}
                className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors border border-transparent hover:border-[#30363d] rounded"
                title="Recarregar logs"
              >
                Atualizar
              </button>
            </div>
          </div>

          {/* Log content */}
          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
            style={{ maxHeight: 'calc(100vh - 320px)' }}
          >
            {!selectedDeviceId ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <span className="text-4xl mb-4">📡</span>
                <p className="text-sm">Selecione um dispositivo para ver os logs</p>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <div className="animate-spin w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full mb-4"></div>
                <p className="text-sm">Carregando logs...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <span className="text-4xl mb-4">📋</span>
                <p className="text-sm">Nenhum log encontrado{filter !== 'all' ? ` com filtro "${filter}"` : ''}</p>
                <p className="text-xs mt-2 text-gray-700">Eventos do dispositivo aparecerão aqui em tempo real</p>
              </div>
            ) : (
              <>
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 py-0.5 px-2 rounded hover:bg-white/5 ${getLevelBg(log.level)}`}
                  >
                    <span className="text-gray-600 flex-shrink-0">[{formatLogTime(log.timestamp)}]</span>
                    <span className={`flex-shrink-0 font-bold ${getLevelColor(log.level)}`}>[{getLevelLabel(log.level)}]</span>
                    <span className="text-blue-400 flex-shrink-0">{log.source}:</span>
                    <span className="text-gray-300 break-all">{log.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </>
            )}
          </div>

          {/* Terminal footer */}
          <div className="px-4 py-2 bg-[#161b22] border-t border-[#30363d] flex items-center justify-between">
            <span className="text-xs text-gray-600 font-mono">
              {filteredLogs.length} {filteredLogs.length === 1 ? 'entrada' : 'entradas'}
              {filter !== 'all' && ` (filtro: ${filter})`}
            </span>
            <span className={`text-xs font-mono ${autoScroll ? 'text-green-600' : 'text-yellow-600'}`}>
              {autoScroll ? 'auto-scroll ativo' : 'auto-scroll pausado'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
