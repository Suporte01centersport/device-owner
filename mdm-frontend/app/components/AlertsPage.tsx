'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface Alert {
  id: string
  deviceName: string
  deviceId: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  timestamp: string
  read: boolean
  resolved: boolean
}

interface AlertsResponse {
  success: boolean
  data: Alert[]
  unreadCount: number
}

const TYPE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'battery', label: 'Bateria' },
  { id: 'offline', label: 'Offline' },
  { id: 'geofence', label: 'Geofence' },
  { id: 'root', label: 'Root' },
  { id: 'storage', label: 'Armazenamento' },
]

const SEVERITY_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'critical', label: 'Crítico' },
  { id: 'warning', label: 'Aviso' },
  { id: 'info', label: 'Info' },
]

function getSeverityClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/150/150/20 text-red-400 border-red-500/30'
    case 'warning':
      return 'bg-yellow-500/150/150/20 text-yellow-400 border-yellow-500/30'
    case 'info':
      return 'bg-blue-500/150/150/20 text-blue-400 border-blue-500/30'
    default:
      return 'bg-[var(--surface)]/10 text-white/80 border-white/20'
  }
}

function getSeverityCardBorder(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-l-red-500'
    case 'warning':
      return 'border-l-yellow-500'
    case 'info':
      return 'border-l-blue-500'
    default:
      return 'border-l-white/30'
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴'
    case 'warning':
      return '🟡'
    case 'info':
      return '🔵'
    default:
      return '⚪'
  }
}

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'Crítico'
    case 'warning':
      return 'Aviso'
    case 'info':
      return 'Info'
    default:
      return severity
  }
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'battery':
      return '🔋'
    case 'offline':
      return '📡'
    case 'geofence':
      return '📍'
    case 'root':
      return '⚠️'
    case 'storage':
      return '💾'
    default:
      return '🔔'
  }
}

function formatDateTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return timestamp
  }
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [typeFilter, setTypeFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (severityFilter !== 'all') params.set('severity', severityFilter)
      const url = `/api/alerts${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (res.ok) {
        const data: AlertsResponse = await res.json()
        setAlerts(data.data || [])
        setUnreadCount(data.unreadCount || 0)
      } else {
        setAlerts([])
      }
    } catch (err) {
      console.error('Erro ao carregar alertas:', err)
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [typeFilter, severityFilter])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // Auto-refresh a cada 30 segundos
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      fetchAlerts()
    }, 30000)
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [fetchAlerts])

  const handleMarkAsRead = async (alertId: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/read`, { method: 'PUT' })
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, read: true } : a))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error('Erro ao marcar alerta como lido:', err)
    }
  }

  const handleResolve = async (alertId: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/resolve`, { method: 'PUT' })
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, resolved: true, read: true } : a))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error('Erro ao resolver alerta:', err)
    }
  }

  const handleResolveAll = async () => {
    try {
      const res = await fetch('/api/alerts/resolve-all', { method: 'PUT' })
      if (res.ok) {
        setAlerts((prev) => prev.map((a) => ({ ...a, resolved: true, read: true })))
        setUnreadCount(0)
      }
    } catch (err) {
      console.error('Erro ao resolver todos os alertas:', err)
    }
  }

  const handleClearOld = async () => {
    try {
      const res = await fetch('/api/alerts?older_than_days=30', { method: 'DELETE' })
      if (res.ok) {
        fetchAlerts()
      }
    } catch (err) {
      console.error('Erro ao limpar alertas antigos:', err)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🔔 Alertas
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/150/150 text-white">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-white mt-1">Alertas e notificações do sistema</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleClearOld}
            className="btn btn-secondary !text-white border-white/30"
          >
            <span>🗑️</span>
            Limpar alertas antigos
          </button>
          <button
            onClick={handleResolveAll}
            className="btn btn-primary text-white"
          >
            <span>✅</span>
            Resolver todos
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Filtro por tipo */}
        <div>
          <p className="text-xs text-white/60 mb-2 font-medium uppercase tracking-wider">Tipo</p>
          <div className="flex gap-2">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => { setTypeFilter(filter.id); setLoading(true) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === filter.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-[var(--surface)]/10 text-white/80 hover:bg-[var(--surface)]/20 border border-white/20'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {/* Filtro por severidade */}
        <div>
          <p className="text-xs text-white/60 mb-2 font-medium uppercase tracking-wider">Severidade</p>
          <div className="flex gap-2">
            {SEVERITY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => { setSeverityFilter(filter.id); setLoading(true) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  severityFilter === filter.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-[var(--surface)]/10 text-white/80 hover:bg-[var(--surface)]/20 border border-white/20'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de alertas */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-white/80">Carregando alertas...</span>
        </div>
      ) : alerts.length === 0 ? (
        <div className="card bg-[var(--surface)]/10 border border-white/20 rounded-xl p-12 flex flex-col items-center justify-center text-white/60">
          <span className="text-4xl mb-3">🔔</span>
          <p className="text-lg">Nenhum alerta encontrado</p>
          <p className="text-sm mt-1">Quando houver alertas, eles aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`card bg-[var(--surface)]/10 border border-white/20 rounded-xl p-4 border-l-4 ${getSeverityCardBorder(alert.severity)} ${
                alert.resolved ? 'opacity-60' : ''
              } ${!alert.read ? 'ring-1 ring-white/20' : ''} transition-all hover:bg-[var(--surface)]/[0.12]`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{getTypeIcon(alert.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{alert.deviceName}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getSeverityClasses(alert.severity)}`}>
                        {getSeverityIcon(alert.severity)} {getSeverityLabel(alert.severity)}
                      </span>
                      {!alert.read && (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500/150/150 flex-shrink-0"></span>
                      )}
                      {alert.resolved && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/150/150/20 text-green-400 border border-green-500/30">
                          ✅ Resolvido
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/80 mt-1">{alert.message}</p>
                    <p className="text-xs text-white/50 mt-1">{formatDateTime(alert.timestamp)}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!alert.read && (
                    <button
                      onClick={() => handleMarkAsRead(alert.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface)]/10 text-white/80 hover:bg-[var(--surface)]/20 border border-white/20 transition-all"
                    >
                      Marcar como lido
                    </button>
                  )}
                  {!alert.resolved && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/80 text-white hover:bg-blue-600 transition-all"
                    >
                      Resolver
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
