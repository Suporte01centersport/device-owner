'use client'

import { useState } from 'react'
import PersistenceStatus from './PersistenceStatus'

interface HeaderProps {
  isConnected: boolean
  onMenuClick: () => void
  supportNotifications?: any[]
  onSupportNotificationClick?: (deviceId: string) => void
}

export default function Header({ isConnected, onMenuClick, supportNotifications = [], onSupportNotificationClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState(3)

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
          <div className="relative">
            <button 
              className="relative p-2 rounded-lg hover:bg-border-light transition-colors"
              onClick={() => {
                if (supportNotifications.length > 0 && onSupportNotificationClick) {
                  onSupportNotificationClick(supportNotifications[0].deviceId)
                }
              }}
            >
              <span className="text-xl">🔔</span>
              {supportNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center">
                  {supportNotifications.length}
                </span>
              )}
            </button>
            
            {/* Dropdown de notificações */}
            {supportNotifications.length > 0 && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-border z-50">
                <div className="p-3 border-b border-border">
                  <h3 className="font-semibold text-primary">Mensagens de Suporte</h3>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {supportNotifications.map((notification, index) => (
                    <div 
                      key={notification.id || index}
                      className="p-3 border-b border-border hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        if (onSupportNotificationClick) {
                          onSupportNotificationClick(notification.deviceId)
                        }
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">📨</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">
                            {notification.deviceName}
                          </p>
                          <p className="text-xs text-secondary truncate">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted">
                            {new Date(notification.timestamp).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
