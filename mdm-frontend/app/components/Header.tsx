'use client'

import { useState, useEffect, useCallback } from 'react'
import PersistenceStatus from './PersistenceStatus'

interface HeaderProps {
  isConnected: boolean
  onMenuClick: () => void
  supportNotifications?: any[]
  unreadSupportCount?: number
  onSupportNotificationClick?: (deviceId: string) => void
}

export default function Header({ isConnected, onMenuClick, supportNotifications = [], unreadSupportCount = 0, onSupportNotificationClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState(3)
  const [showSupportDropdown, setShowSupportDropdown] = useState(false)
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

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (showSupportDropdown && !target.closest('.support-dropdown-container')) {
        setShowSupportDropdown(false)
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
    setShowSupportDropdown(!showSupportDropdown)
  }

  const handleNotificationClick = (deviceId: string) => {
    if (onSupportNotificationClick) {
      onSupportNotificationClick(deviceId)
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
              className="w-80 px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all duration-200"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Persistence status */}
          <PersistenceStatus />

          {/* Connection status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-success' : 'bg-error'
            }`} />
            <span className="text-sm text-secondary">
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
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
              <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-xl border border-border z-50 max-h-96 overflow-hidden">
                <div className="p-4 border-b border-border bg-gradient-to-r from-blue-50 to-blue-100">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-primary flex items-center gap-2">
                      <span className="text-blue-600">🔔</span>
                      Mensagens de Suporte
                    </h3>
                    <button
                      onClick={() => setShowSupportDropdown(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  {unreadSupportCount > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      {unreadSupportCount} mensagem{unreadSupportCount !== 1 ? 's' : ''} não lida{unreadSupportCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                
                <div className="max-h-80 overflow-y-auto">
                  {unreadMessages.length > 0 ? (
                    unreadMessages.map((message, index) => (
                      <div 
                        key={message.id || index}
                        className="p-4 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors group"
                        onClick={() => handleNotificationClick(message.deviceId)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white text-sm">📱</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {message.deviceName}
                              </p>
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                                Nova
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-2 mb-2 leading-relaxed">
                              {message.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-500">
                                📱 {message.model} • Android {message.androidVersion}
                              </p>
                              <p className="text-xs text-blue-600 font-medium">
                                {formatTimestamp(message.timestamp)}
                              </p>
                            </div>
                          </div>
                          <div className="text-gray-400 group-hover:text-blue-600 transition-colors">
                            →
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl text-gray-400">📭</span>
                      </div>
                      <h4 className="text-sm font-medium text-gray-900 mb-1">Nenhuma mensagem pendente</h4>
                      <p className="text-xs text-gray-500">
                        Todas as mensagens de suporte foram lidas
                      </p>
                    </div>
                  )}
                </div>
                
                {unreadMessages.length > 0 && (
                  <div className="p-3 border-t border-gray-200 bg-gray-50">
                    <p className="text-xs text-center text-gray-500">
                      Clique em uma mensagem para abrir o dispositivo
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-primary">Administrador</div>
              <div className="text-xs text-secondary">admin@mdm.com</div>
            </div>
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">A</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
