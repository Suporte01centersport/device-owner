'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'

interface SupportMessage {
  id: string
  deviceId: string
  deviceName: string
  message: string
  timestamp: number
  androidVersion: string
  model: string
  receivedAt: number
  status: 'pending' | 'read' | 'resolved'
}

interface SupportMessagesModalProps {
  device: Device
  isOpen: boolean
  onClose: () => void
}

export default function SupportMessagesModal({ device, isOpen, onClose }: SupportMessagesModalProps) {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<SupportMessage | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSupportMessages()
    }
  }, [isOpen, device.deviceId])

  const loadSupportMessages = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/support-messages')
      if (response.ok) {
        const allMessages = await response.json()
        // Filtrar mensagens do dispositivo atual
        const deviceMessages = allMessages.filter((msg: SupportMessage) => 
          msg.deviceId === device.deviceId
        ).sort((a: SupportMessage, b: SupportMessage) => b.timestamp - a.timestamp)
        
        setMessages(deviceMessages)
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens de suporte:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-warning'
      case 'read': return 'text-primary'
      case 'resolved': return 'text-success'
      default: return 'text-muted'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente'
      case 'read': return 'Lida'
      case 'resolved': return 'Resolvida'
      default: return 'Desconhecido'
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Modal principal */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-xl shadow-xl max-w-4xl w-full h-[80vh] flex flex-col">
          <div className="flex justify-between items-center p-6 border-b border-border">
            <h3 className="text-lg font-semibold text-primary flex items-center">
              <span className="mr-2">🔔</span>
              Mensagens de Suporte - {device.name}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Carregando mensagens...</p>
              </div>
            ) : messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="card p-4 cursor-pointer transition-all duration-200 hover:shadow-lg"
                    onClick={() => setSelectedMessage(message)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`badge badge-sm ${getStatusColor(message.status)}`}>
                            {getStatusText(message.status)}
                          </span>
                          <span className="text-xs text-muted">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-primary line-clamp-2">
                          {message.message}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                          <span>📱 {message.model}</span>
                          <span>🤖 Android {message.androidVersion}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg">📨</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📭</span>
                </div>
                <h4 className="text-lg font-semibold text-primary mb-2">Nenhuma mensagem encontrada</h4>
                <p className="text-sm text-muted">
                  Este dispositivo ainda não enviou mensagens de suporte
                </p>
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">
                {messages.length} mensagem{messages.length !== 1 ? 's' : ''} de suporte
              </span>
              <button
                onClick={onClose}
                className="btn btn-primary"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de detalhes da mensagem */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface rounded-xl shadow-xl max-w-2xl w-full">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-primary flex items-center">
                <span className="mr-2">📨</span>
                Detalhes da Mensagem
              </h3>
              <button
                onClick={() => setSelectedMessage(null)}
                className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`badge ${getStatusColor(selectedMessage.status)}`}>
                  {getStatusText(selectedMessage.status)}
                </span>
                <span className="text-sm text-muted">
                  {formatTimestamp(selectedMessage.timestamp)}
                </span>
              </div>
              
              <div>
                <label className="text-sm font-medium text-secondary">Mensagem</label>
                <div className="mt-1 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-primary whitespace-pre-wrap">
                    {selectedMessage.message}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-secondary">Dispositivo</label>
                  <p className="text-sm text-primary">{selectedMessage.deviceName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-secondary">Modelo</label>
                  <p className="text-sm text-primary">{selectedMessage.model}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-secondary">Android</label>
                  <p className="text-sm text-primary">{selectedMessage.androidVersion}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-secondary">Recebida em</label>
                  <p className="text-sm text-primary">{formatTimestamp(selectedMessage.receivedAt)}</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => setSelectedMessage(null)}
                className="btn btn-secondary"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  // Aqui você pode implementar a funcionalidade de marcar como lida
                  console.log('Marcar como lida:', selectedMessage.id)
                }}
                className="btn btn-primary"
              >
                Marcar como Lida
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
