'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import PersistenceStatus from './PersistenceStatus'

interface HeaderProps {
  isConnected: boolean
  onMenuClick: () => void
  onRefreshDevices?: () => void
  onReconnect?: () => void
  supportNotifications?: any[]
  unreadSupportCount?: number
  onSupportNotificationClick?: (deviceId: string, deviceName?: string) => void
  onViewChange?: (view: string) => void
}

interface AlertItem {
  id: string
  device_name: string
  device_id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  created_at: string
  is_read: boolean
  read_at: string | null
  is_resolved: boolean
  resolved_at: string | null
}

export default function Header({ isConnected, onMenuClick, onRefreshDevices, onReconnect, supportNotifications = [], unreadSupportCount = 0, onSupportNotificationClick, onViewChange }: HeaderProps) {
  const [showSupportDropdown, setShowSupportDropdown] = useState(false)
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false)
  const [showUserDashboard, setShowUserDashboard] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState<any[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [unreadAlertCount, setUnreadAlertCount] = useState(0)
  const alertPollRef = useRef<NodeJS.Timeout | null>(null)

  // Carregar alertas não lidos
  const loadAlerts = useCallback(async () => {
    try {
      const response = await fetch('/api/alerts?limit=10')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // Normalizar campos - API pode retornar read_at/resolved_at ou is_read/is_resolved
          const normalized = (data.data || []).map((a: any) => ({
            ...a,
            is_read: a.is_read ?? (a.read_at != null),
            is_resolved: a.is_resolved ?? (a.resolved_at != null),
          }))
          setAlerts(normalized)
          setUnreadAlertCount(data.unreadCount || 0)
        }
      }
    } catch (error) {
      // silencioso
    }
  }, [])

  // Poll de alertas a cada 30s
  useEffect(() => {
    loadAlerts()
    alertPollRef.current = setInterval(loadAlerts, 30000)
    return () => {
      if (alertPollRef.current) clearInterval(alertPollRef.current)
    }
  }, [loadAlerts])

  const loadUnreadMessages = useCallback(async () => {
    try {
      const response = await fetch('/api/support-messages')
      if (response.ok) {
        const allMessages = await response.json()
        const unread = allMessages
          .filter((msg: any) => msg.status === 'pending')
          .sort((a: any, b: any) => b.timestamp - a.timestamp)
          .slice(0, 10)
        setUnreadMessages(unread)
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens não lidas:', error)
    }
  }, [])

  useEffect(() => {
    if (showSupportDropdown) {
      loadUnreadMessages()
    }
  }, [showSupportDropdown, loadUnreadMessages])

  useEffect(() => {
    if (showAlertsDropdown) {
      loadAlerts()
    }
  }, [showAlertsDropdown, loadAlerts])

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (showSupportDropdown && !target.closest('.support-dropdown-container')) {
        setShowSupportDropdown(false)
      }
      if (showAlertsDropdown && !target.closest('.alerts-dropdown-container')) {
        setShowAlertsDropdown(false)
      }
      if (showUserDashboard && !target.closest('.user-dashboard-container')) {
        setShowUserDashboard(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSupportDropdown, showAlertsDropdown, showUserDashboard])

  const formatTimestamp = (timestamp: number | string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return 'Agora'
    if (diffInMinutes < 60) return `${diffInMinutes} min atrás`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h atrás`
    return date.toLocaleDateString('pt-BR')
  }

  const handleSupportClick = () => {
    setShowUserDashboard(false)
    setShowAlertsDropdown(false)
    setShowSupportDropdown(!showSupportDropdown)
  }

  const handleAlertsClick = () => {
    setShowUserDashboard(false)
    setShowSupportDropdown(false)
    setShowAlertsDropdown(!showAlertsDropdown)
  }

  const handleUserAvatarClick = () => {
    setShowSupportDropdown(false)
    setShowAlertsDropdown(false)
    setShowUserDashboard(!showUserDashboard)
  }

  const handleNotificationClick = (message: { deviceId: string; deviceName?: string }) => {
    if (onSupportNotificationClick) {
      onSupportNotificationClick(message.deviceId, message.deviceName)
    }
    setShowSupportDropdown(false)
  }

  const handleAlertClick = async (alert: AlertItem) => {
    // Marcar como lido
    if (!alert.is_read) {
      try {
        await fetch('/api/alerts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [alert.id], action: 'read' })
        })
      } catch {}
    }
    setShowAlertsDropdown(false)
    // Navegar para página de alertas
    if (onViewChange) {
      onViewChange('alerts')
    }
  }

  const handleViewAllAlerts = () => {
    setShowAlertsDropdown(false)
    if (onViewChange) {
      onViewChange('alerts')
    }
  }

  const markAllAlertsRead = async () => {
    try {
      const unreadIds = alerts.filter(a => !a.is_read).map(a => a.id)
      if (unreadIds.length > 0) {
        await fetch('/api/alerts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: unreadIds, action: 'read' })
        })
        loadAlerts()
      }
    } catch {}
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴'
      case 'warning': return '🟡'
      case 'info': return '🔵'
      default: return '⚪'
    }
  }

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'critical': return 'Crítico'
      case 'warning': return 'Aviso'
      case 'info': return 'Info'
      default: return severity
    }
  }

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case 'battery': return 'Bateria baixa'
      case 'offline': return 'Dispositivo offline'
      case 'geofence': return 'Geofence'
      case 'root': return 'Root detectado'
      case 'storage': return 'Armazenamento'
      case 'compliance': return 'Compliance'
      default: return type
    }
  }

  return (
    <header className="bg-surface border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-lg hover:bg-border-light transition-colors"
          >
            <span className="text-xl">☰</span>
          </button>

        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Persistence status */}
          <PersistenceStatus />

          {/* Connection status + Atualizar dispositivos */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-success' : 'bg-error'
            }`} />
            <span className="text-sm text-secondary">
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
            {isConnected && onRefreshDevices && (
              <button
                onClick={onRefreshDevices}
                title="Atualizar lista de dispositivos"
                className="p-1.5 rounded-lg hover:bg-border-light transition-colors text-secondary hover:text-primary"
              >
                <span className="text-lg">🔄</span>
              </button>
            )}
            {!isConnected && onReconnect && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  onReconnect()
                }}
                title="Reconectar ao servidor (verifique se está rodando na porta 3001)"
                className="px-2 py-1 text-xs font-medium rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors hover:bg-primary/40"
              >
                Reconectar
              </button>
            )}
          </div>

          {/* Alerts Bell */}
          <div className="relative alerts-dropdown-container">
            <button
              className="relative p-2 rounded-lg hover:bg-border-light transition-colors group"
              onClick={handleAlertsClick}
              title={unreadAlertCount > 0 ? `${unreadAlertCount} alerta${unreadAlertCount !== 1 ? 's' : ''} não lido${unreadAlertCount !== 1 ? 's' : ''}` : 'Alertas do sistema'}
            >
              <span className={`text-xl transition-transform ${unreadAlertCount > 0 ? 'animate-bounce-subtle' : ''} group-hover:scale-110`}>
                {unreadAlertCount > 0 ? '🔔' : '🔕'}
              </span>
              {unreadAlertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 flex items-center justify-center px-1 bg-red-500/150/150 text-white text-xs font-bold rounded-full shadow-lg">
                  {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
                </span>
              )}
            </button>

            {/* Dropdown de alertas */}
            {showAlertsDropdown && (
              <div className="absolute right-0 top-full mt-2 w-[420px] bg-[var(--surface)] rounded-lg shadow-xl border border-[var(--border)] z-40 max-h-[500px] overflow-hidden">
                <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-elevated)]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <span>🔔</span>
                      Alertas
                      {unreadAlertCount > 0 && (
                        <span className="px-2 py-0.5 bg-red-500/150/150/20 text-red-400 text-xs rounded-full font-medium">
                          {unreadAlertCount} novo{unreadAlertCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      {unreadAlertCount > 0 && (
                        <button
                          onClick={markAllAlertsRead}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Marcar lidos
                        </button>
                      )}
                      <button
                        onClick={() => setShowAlertsDropdown(false)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {alerts.length > 0 ? (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3 border-b border-[var(--border)] hover:bg-[var(--surface-elevated)] cursor-pointer transition-colors ${
                          !alert.is_read ? 'bg-[var(--surface-elevated)]/50' : ''
                        }`}
                        onClick={() => handleAlertClick(alert)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5 text-lg">
                            {getSeverityIcon(alert.severity)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                alert.severity === 'critical' ? 'bg-red-500/150/150/20 text-red-400' :
                                alert.severity === 'warning' ? 'bg-yellow-500/150/150/20 text-yellow-400' :
                                'bg-blue-500/150/150/20 text-blue-400'
                              }`}>
                                {getSeverityLabel(alert.severity)}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {getAlertTypeLabel(alert.type)}
                              </span>
                              {!alert.is_read && (
                                <span className="w-2 h-2 bg-blue-500/150/150 rounded-full flex-shrink-0"></span>
                              )}
                            </div>
                            <p className="text-sm text-[var(--text-primary)] line-clamp-1">
                              {alert.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-[var(--text-muted)]">
                                📱 {alert.device_name || 'Dispositivo'}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {formatTimestamp(alert.created_at)}
                              </span>
                            </div>
                          </div>
                          {alert.is_resolved && (
                            <span className="text-xs text-green-400 flex-shrink-0">✓</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 bg-[var(--surface-elevated)] rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl">✅</span>
                      </div>
                      <h4 className="text-sm font-medium text-[var(--text-primary)] mb-1">Nenhum alerta</h4>
                      <p className="text-xs text-[var(--text-muted)]">
                        Todos os sistemas estão funcionando normalmente
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-elevated)]">
                  <button
                    onClick={handleViewAllAlerts}
                    className="w-full text-center text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors py-1"
                  >
                    Ver todos os alertas →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Support Notifications */}
          <div className="relative support-dropdown-container">
            <button
              className="relative p-2 rounded-lg hover:bg-border-light transition-colors group"
              onClick={handleSupportClick}
              title={unreadSupportCount > 0 ? `${unreadSupportCount} mensagem${unreadSupportCount !== 1 ? 's' : ''} de suporte não lida${unreadSupportCount !== 1 ? 's' : ''}` : 'Mensagens de Suporte'}
            >
              <span className="text-xl group-hover:scale-110 transition-transform">💬</span>
              {unreadSupportCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 flex items-center justify-center px-1 bg-red-500/150/150 text-white text-xs font-bold rounded-full shadow-lg">
                  {unreadSupportCount > 99 ? '99+' : unreadSupportCount}
                </span>
              )}
            </button>

            {/* Dropdown de notificações de suporte */}
            {showSupportDropdown && (
              <div className="absolute right-0 top-full mt-2 w-96 bg-[var(--surface)] rounded-lg shadow-xl border border-[var(--border)] z-40 max-h-96 overflow-hidden">
                <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-elevated)]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <span className="text-blue-400">💬</span>
                      Mensagens de Suporte
                    </h3>
                    <button
                      onClick={() => setShowSupportDropdown(false)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  {unreadSupportCount > 0 && (
                    <p className="text-xs text-blue-400 mt-1">
                      {unreadSupportCount} mensagem{unreadSupportCount !== 1 ? 's' : ''} não lida{unreadSupportCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {unreadMessages.length > 0 ? (
                    unreadMessages.map((message, index) => (
                      <div
                        key={message.id || index}
                        className="p-4 border-b border-[var(--border)] hover:bg-[var(--surface-elevated)] cursor-pointer transition-colors group"
                        onClick={() => handleNotificationClick(message)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white text-sm">📱</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                {message.deviceName}
                              </p>
                              <span className="px-2 py-0.5 bg-red-500/150/150/20 text-red-400 text-xs rounded-full font-medium">
                                Nova
                              </span>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2 leading-relaxed">
                              {message.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[var(--text-muted)]">
                                📱 {message.model} • Android {message.androidVersion}
                              </p>
                              <p className="text-xs text-blue-400 font-medium">
                                {formatTimestamp(message.timestamp)}
                              </p>
                            </div>
                          </div>
                          <div className="text-[var(--text-muted)] group-hover:text-blue-400 transition-colors">
                            →
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 bg-[var(--surface-elevated)] rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl">📭</span>
                      </div>
                      <h4 className="text-sm font-medium text-[var(--text-primary)] mb-1">Nenhuma mensagem pendente</h4>
                      <p className="text-xs text-[var(--text-muted)]">
                        Todas as mensagens de suporte foram lidas
                      </p>
                    </div>
                  )}
                </div>

                {unreadMessages.length > 0 && (
                  <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-elevated)]">
                    <p className="text-xs text-center text-[var(--text-muted)]">
                      Clique em uma mensagem para abrir o dispositivo
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User menu - avatar clicável */}
          <div className="relative user-dashboard-container">
            <button
              onClick={handleUserAvatarClick}
              className="flex items-center gap-3 p-1 rounded-lg hover:bg-border-light transition-colors"
              title="Ver informações do usuário"
            >
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-primary">Administrador</div>
                <div className="text-xs text-secondary">admin@mdm.com</div>
              </div>
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center ring-2 ring-[var(--border)] shadow-md hover:ring-[var(--primary)] transition-all cursor-pointer">
                <span className="text-white text-base font-semibold">A</span>
              </div>
            </button>

            {/* Mini dashboard do usuário */}
            {showUserDashboard && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--surface)] rounded-xl shadow-xl border border-[var(--border)] z-40 overflow-hidden">
                <div className="p-4 bg-[var(--surface-elevated)] border-b border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl font-semibold">A</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--text-primary)] text-lg">Administrador</h3>
                      <p className="text-sm text-[var(--text-secondary)]">admin@mdm.com</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/150/150/20 text-blue-400 text-xs font-medium rounded-full">
                        Administrador do sistema
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--text-secondary)]">Status</span>
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500/150/150' : 'bg-red-500/150/150'}`} />
                      {isConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--text-secondary)]">Função</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">Administrador MDM</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-[var(--text-secondary)]">Sessão ativa</span>
                    <span className="text-sm text-[var(--text-primary)]">Agora</span>
                  </div>
                </div>
                <div className="p-3 bg-[var(--surface-elevated)] border-t border-[var(--border)]">
                  <p className="text-xs text-center text-[var(--text-muted)]">
                    Painel de gerenciamento de dispositivos
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
