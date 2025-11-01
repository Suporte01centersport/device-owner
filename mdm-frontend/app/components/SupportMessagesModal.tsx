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
  onMessageStatusUpdate?: () => void
}

export default function SupportMessagesModal({ device, isOpen, onClose, onMessageStatusUpdate }: SupportMessagesModalProps) {
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

  const updateMessageStatus = async (messageId: string, newStatus: 'read' | 'resolved') => {
    try {
      const response = await fetch('/api/support-messages', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          status: newStatus
        })
      })

      if (response.ok) {
        // Atualizar o estado local
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === messageId 
              ? { ...msg, status: newStatus }
              : msg
          )
        )
        
        // Atualizar mensagem selecionada se for a mesma
        if (selectedMessage && selectedMessage.id === messageId) {
          setSelectedMessage({ ...selectedMessage, status: newStatus })
        }
        
        const statusText = newStatus === 'read' ? 'lida' : 'resolvida'
        console.log(`Mensagem marcada como ${statusText} com sucesso`)
        
        // Notificar o componente pai sobre a mudança
        if (onMessageStatusUpdate) {
          onMessageStatusUpdate()
        }
        
        // Fechar modal de detalhes após marcar como resolvida
        if (newStatus === 'resolved') {
          setSelectedMessage(null)
        }
      } else {
        const statusText = newStatus === 'read' ? 'lida' : 'resolvida'
        console.error(`Erro ao marcar mensagem como ${statusText}`)
        alert(`Erro ao marcar mensagem como ${statusText}`)
      }
    } catch (error) {
      const statusText = newStatus === 'read' ? 'lida' : 'resolvida'
      console.error(`Erro ao marcar mensagem como ${statusText}:`, error)
      alert(`Erro ao marcar mensagem como ${statusText}`)
    }
  }

  const clearAllMessages = async () => {
    if (!confirm(`Tem certeza que deseja limpar todas as mensagens de suporte do dispositivo "${device.name}"?\n\nEsta ação não pode ser desfeita.`)) {
      return
    }

    try {
      const response = await fetch('/api/support-messages', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: device.deviceId
        })
      })

      if (response.ok) {
        const result = await response.json()
        
        // Limpar mensagens do estado local
        setMessages([])
        setSelectedMessage(null)
        
        // Notificar o componente pai sobre a mudança
        if (onMessageStatusUpdate) {
          onMessageStatusUpdate()
        }
        
        console.log('Todas as mensagens foram limpas com sucesso')
        alert(`✅ ${result.message || 'Mensagens limpas com sucesso!'}`)
      } else {
        console.error('Erro ao limpar mensagens')
        alert('❌ Erro ao limpar mensagens de suporte')
      }
    } catch (error) {
      console.error('Erro ao limpar mensagens:', error)
      alert('Erro ao limpar mensagens de suporte')
    }
  }

  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Modal principal */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div 
          className="bg-surface rounded-xl shadow-xl max-w-4xl w-full h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
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
                          <span className={`badge badge-sm ${
                            message.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            message.status === 'read' ? 'bg-blue-100 text-blue-800' :
                            message.status === 'resolved' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {message.status === 'pending' && '⏳ '}
                            {message.status === 'read' && '👁️ '}
                            {message.status === 'resolved' && '✅ '}
                            {getStatusText(message.status)}
                          </span>
                          <span className="text-xs text-muted">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <p className={`text-sm line-clamp-2 ${
                          message.status === 'pending' ? 'text-primary font-medium' : 'text-secondary'
                        }`}>
                          {message.message}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                          <span>📱 {message.model}</span>
                          <span>🤖 Android {message.androidVersion}</span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-center">
                        <span className="text-lg mb-1">
                          {message.status === 'pending' ? '🔔' : 
                           message.status === 'read' ? '📖' : 
                           message.status === 'resolved' ? '✅' : '📨'}
                        </span>
                        {message.status === 'pending' && (
                          <span className="text-xs text-yellow-600 font-medium">Nova</span>
                        )}
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
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">
                  {messages.length} mensagem{messages.length !== 1 ? 's' : ''} de suporte
                </span>
                {messages.length > 0 && (
                  <button
                    onClick={clearAllMessages}
                    className="btn btn-sm btn-danger flex items-center gap-2"
                    title="Limpar todas as mensagens deste dispositivo"
                  >
                    <span>🗑️</span>
                    Limpar Mensagens
                  </button>
                )}
              </div>
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
            
            <div className="p-6 border-t border-border flex justify-between items-center">
              <button
                onClick={() => setSelectedMessage(null)}
                className="btn btn-secondary"
              >
                Fechar
              </button>
              
              <div className="flex gap-3">
                {selectedMessage.status === 'pending' && (
                  <>
                    <button
                      onClick={() => updateMessageStatus(selectedMessage.id, 'read')}
                      className="btn btn-primary"
                    >
                      👁️ Marcar como Lida
                    </button>
                    <button
                      onClick={() => updateMessageStatus(selectedMessage.id, 'resolved')}
                      className="btn btn-success"
                    >
                      ✅ Marcar como Resolvida
                    </button>
                  </>
                )}
                
                {selectedMessage.status === 'read' && (
                  <>
                    <button
                      className="btn btn-primary opacity-50 cursor-not-allowed"
                      disabled
                    >
                      👁️ Já Lida
                    </button>
                    <button
                      onClick={() => updateMessageStatus(selectedMessage.id, 'resolved')}
                      className="btn btn-success"
                    >
                      ✅ Marcar como Resolvida
                    </button>
                  </>
                )}
                
                {selectedMessage.status === 'resolved' && (
                  <button
                    className="btn btn-success opacity-50 cursor-not-allowed"
                    disabled
                  >
                    ✅ Já Resolvida
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
