'use client'

import { useState, useEffect, useCallback } from 'react'
import PersistenceStatus from './PersistenceStatus'

interface HeaderProps {
  isConnected: boolean
  onMenuClick: () => void
  onRefreshDevices?: () => void
  onReconnect?: () => void
  supportNotifications?: any[]
  unreadSupportCount?: number
  onSupportNotificationClick?: (deviceId: string, deviceName?: string) => void
}

export default function Header({ isConnected, onMenuClick, onRefreshDevices, onReconnect, supportNotifications = [], unreadSupportCount = 0, onSupportNotificationClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState(3)
  const [showSupportDropdown, setShowSupportDropdown] = useState(false)
  const [showUserDashboard, setShowUserDashboard] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState<any[]>([])

  const loadUnreadMessages = useCallback(async () => {
    try {
      const response = await fetch('/api/support-messages')
      if (response.ok) {
        const allMessages = await response.json()
        const unread = allMessages
          .filter((msg: any) => msg.status === 'pending')
          .sort((a: any, b: any) => b.timestamp - a.timestamp)
          .slice(0, 10) // Mostrar apenas as 10 mais recentes
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

  // Fechar dropdown ao clicar fora ou quando um modal/remote desktop estiver aberto
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      // Verificar se clicou em um modal ou acesso remoto (z-50)
      const isModalOrRemoteDesktop = target.closest('[class*="z-50"]') || 
                                     target.closest('.fixed.inset-0[class*="z-50"]')
      
      if (showSupportDropdown && !target.closest('.support-dropdown-container')) {
        setShowSupportDropdown(false)
      }
      if (showUserDashboard && !target.closest('.user-dashboard-container')) {
        setShowUserDashboard(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSupportDropdown])

  const formatTimestamp = (timestamp: number) => {
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
    setShowSupportDropdown(!showSupportDropdown)
  }

  const handleUserAvatarClick = () => {
    setShowSupportDropdown(false)
    setShowUserDashboard(!showUserDashboard)
  }

  const handleNotificationClick = (message: { deviceId: string; deviceName?: string }) => {
    if (onSupportNotificationClick) {
      onSupportNotificationClick(message.deviceId, message.deviceName)
    }
    setShowSupportDropdown(false)
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

          {/* Search bar */}
          <div className="relative hidden md:block">
            <input
              type="text"
              placeholder="buscar aplicações..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent shadow-sm transition-all duration-200"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
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


          {/* Support Notifications */}
          <div className="relative support-dropdown-container">
            <button 
              className="relative p-2 rounded-lg hover:bg-border-light transition-colors group"
              onClick={handleSupportClick}
              title={unreadSupportCount > 0 ? `${unreadSupportCount} mensagem${unreadSupportCount !== 1 ? 's' : ''} de suporte não lida${unreadSupportCount !== 1 ? 's' : ''}` : 'Mensagens de Suporte'}
            >
              <span className="text-xl group-hover:scale-110 transition-transform">🔔</span>
              {unreadSupportCount > 0 && (
                <span className={`support-notification-badge ${unreadSupportCount > 9 ? 'large-count' : ''}`}>
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
                      <span className="text-blue-400">🔔</span>
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
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-medium">
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
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full">
                        Administrador do sistema
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--text-secondary)]">Status</span>
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
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
