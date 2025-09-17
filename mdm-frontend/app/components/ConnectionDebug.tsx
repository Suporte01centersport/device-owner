'use client'

import { useState, useEffect } from 'react'

interface ConnectionDebugProps {
  connectionStatus: string
  isConnected: boolean
  reconnectAttempts: number
  isPolling: boolean
  pollingAttempts: number
  queueStatus?: {
    size: number
    maxSize: number
    processing: boolean
    messages: Array<{
      id: string
      priority: string
      attempts: number
      maxAttempts: number
      age: number
    }>
  }
  onForceReconnect: () => void
  onClearQueue?: () => void
}

export default function ConnectionDebug({
  connectionStatus,
  isConnected,
  reconnectAttempts,
  isPolling,
  pollingAttempts,
  queueStatus,
  onForceReconnect,
  onClearQueue
}: ConnectionDebugProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [connectionHistory, setConnectionHistory] = useState<Array<{
    timestamp: Date
    status: string
    details: string
  }>>([])

  useEffect(() => {
    const newEntry = {
      timestamp: new Date(),
      status: connectionStatus,
      details: isConnected ? 'Conectado' : isPolling ? `Polling HTTP (${pollingAttempts})` : 'Desconectado'
    }
    
    setConnectionHistory(prev => [newEntry, ...prev.slice(0, 9)]) // Manter apenas 10 entradas
  }, [connectionStatus, isConnected, isPolling, pollingAttempts])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-700'
      case 'connecting': return 'text-yellow-400'
      case 'reconnecting': return 'text-orange-400'
      case 'fallback': return 'text-blue-400'
      case 'disconnected': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return '🟢'
      case 'connecting': return '🟡'
      case 'reconnecting': return '🟠'
      case 'fallback': return '🔵'
      case 'disconnected': return '🔴'
      default: return '⚪'
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-glass rounded-lg border border-white/10 shadow-lg">
        {/* Header */}
        <div 
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getStatusIcon(connectionStatus)}</span>
            <span className={`text-sm font-medium ${getStatusColor(connectionStatus)}`}>
              {connectionStatus === 'connected' && 'Conectado'}
              {connectionStatus === 'connecting' && 'Conectando...'}
              {connectionStatus === 'reconnecting' && `Reconectando (${reconnectAttempts})`}
              {connectionStatus === 'fallback' && `Fallback HTTP (${pollingAttempts})`}
              {connectionStatus === 'disconnected' && 'Desconectado'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {!isConnected && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onForceReconnect()
                }}
                className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors border border-blue-500/20"
              >
                🔄
              </button>
            )}
            <span className="text-gray-400 text-xs">
              {isExpanded ? '▼' : '▶'}
            </span>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-white/10 p-3 space-y-3">
            {/* Status Details */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white">Status da Conexão</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">WebSocket:</span>
                  <span className={isConnected ? 'text-green-700' : 'text-red-400'}>
                    {isConnected ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">HTTP Fallback:</span>
                  <span className={isPolling ? 'text-blue-400' : 'text-gray-400'}>
                    {isPolling ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">Tentativas WS:</span>
                  <span className="text-orange-400">{reconnectAttempts}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">Tentativas HTTP:</span>
                  <span className="text-blue-400">{pollingAttempts}</span>
                </div>
                {queueStatus && (
                  <>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-400">Fila de Msgs:</span>
                      <span className="text-purple-400">{queueStatus.size}/{queueStatus.maxSize}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-400">Processando:</span>
                      <span className={queueStatus.processing ? 'text-yellow-400' : 'text-gray-400'}>
                        {queueStatus.processing ? 'Sim' : 'Não'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Connection History */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white">Histórico de Conexão</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {connectionHistory.map((entry, index) => (
                  <div key={index} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center space-x-2">
                      <span>{getStatusIcon(entry.status)}</span>
                      <span className="text-gray-300">{entry.details}</span>
                    </div>
                    <span className="text-gray-500">
                      {entry.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Network Info */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white">Informações de Rede</h4>
              <div className="text-xs space-y-1">
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">WebSocket URL:</span>
                  <span className="text-gray-300 font-mono">
                    {process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3002'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">API URL:</span>
                  <span className="text-gray-300 font-mono">
                    {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002/api'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">User Agent:</span>
                  <span className="text-gray-300 text-xs truncate max-w-32">
                    {typeof window !== 'undefined' ? window.navigator.userAgent.substring(0, 30) + '...' : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Message Queue */}
            {queueStatus && queueStatus.messages.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-white">Fila de Mensagens</h4>
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {queueStatus.messages.slice(0, 5).map((msg) => (
                    <div key={msg.id} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-lg text-xs ${
                          msg.priority === 'high' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          msg.priority === 'normal' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                          'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                        }`}>
                          {msg.priority}
                        </span>
                        <span className="text-gray-300 truncate max-w-20">
                          {msg.id.split('_')[1]}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500">
                          {msg.attempts}/{msg.maxAttempts}
                        </span>
                        <span className="text-gray-500">
                          {Math.round(msg.age / 1000)}s
                        </span>
                      </div>
                    </div>
                  ))}
                  {queueStatus.messages.length > 5 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{queueStatus.messages.length - 5} mais...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-2">
              <button
                onClick={onForceReconnect}
                className="flex-1 text-xs px-3 py-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors border border-blue-500/20"
              >
                🔄 Reconectar
              </button>
              <button
                onClick={() => {
                  setConnectionHistory([])
                }}
                className="flex-1 text-xs px-3 py-2 bg-gray-500/10 text-gray-400 rounded-lg hover:bg-gray-500/20 transition-colors border border-gray-500/20"
              >
                🗑️ Limpar
              </button>
              {onClearQueue && (
                <button
                  onClick={onClearQueue}
                  className="flex-1 text-xs px-3 py-2 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500/20 transition-colors border border-purple-500/20"
                >
                  📋 Limpar Fila
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
