'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import LocationMapModal from './LocationMapModal'

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
  sendMessage?: (message: any) => boolean | void
  alarmError?: { deviceId: string } | null
  onAlarmErrorHandled?: () => void
}

export default function SupportMessagesModal({ device, isOpen, onClose, onMessageStatusUpdate, sendMessage, alarmError, onAlarmErrorHandled }: SupportMessagesModalProps) {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<SupportMessage | null>(null)
  const [outgoingMessage, setOutgoingMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [alarmOn, setAlarmOn] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [sentHistory, setSentHistory] = useState<Array<{ id: string; message: string; timestamp: number; deviceName: string }>>([])

  useEffect(() => {
    if (isOpen) {
      loadSupportMessages()
    }
  }, [isOpen, device.deviceId])

  // Sincronizar alarmOn quando receber erro (dispositivo não conectado)
  useEffect(() => {
    if (alarmError && alarmError.deviceId === device.deviceId && isOpen) {
      setAlarmOn(false)
      onAlarmErrorHandled?.()
    }
  }, [alarmError, device.deviceId, isOpen, onAlarmErrorHandled])

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

  const handleControlAction = async (action: 'lock' | 'unlock' | 'locate' | 'alarm' | 'reboot') => {
    if (!sendMessage) {
      alert('Conexão não disponível')
      return
    }
    if (device.status !== 'online') {
      alert('O dispositivo está offline. Apenas dispositivos online podem receber comandos.')
      return
    }
    switch (action) {
      case 'lock': {
        const lockOk = await sendMessage({ type: 'lock_device', deviceId: device.deviceId, timestamp: Date.now() })
        if (!lockOk) {
          alert('Não foi possível travar. Verifique se o servidor está rodando e o dispositivo conectado.')
        } else {
          alert('Comando de travar enviado!')
        }
        break
      }
      case 'unlock': {
        const unlockOk = await sendMessage({ type: 'unlock_device', deviceId: device.deviceId, timestamp: Date.now() })
        if (!unlockOk) {
          alert('Não foi possível desbloquear. Verifique se o servidor está rodando e o dispositivo conectado.')
        } else {
          alert('Comando de desbloquear enviado!')
        }
        break
      }
      case 'locate':
        sendMessage({ type: 'request_location', deviceId: device.deviceId, timestamp: Date.now() })
        setShowLocationModal(true)
        break
      case 'alarm':
        if (alarmOn) {
          sendMessage({ type: 'stop_alarm', deviceId: device.deviceId, timestamp: Date.now() })
          setAlarmOn(false)
          alert('Alarme parado')
        } else {
          sendMessage({ type: 'start_alarm', deviceId: device.deviceId, timestamp: Date.now() })
          setAlarmOn(true)
          alert('Alarme iniciado - toque novamente para parar')
        }
        break
      case 'reboot':
        if (!confirm('Reiniciar o dispositivo agora?')) return
        const rebootOk = await sendMessage({ type: 'reboot_device', deviceId: device.deviceId, timestamp: Date.now() })
        if (!rebootOk) {
          alert('Não foi possível reiniciar. Verifique se o servidor está rodando e o dispositivo conectado.')
        }
        break
    }
  }

  const saveMessageToHistory = (messageText: string) => {
    try {
      const key = `messageHistory_${device.deviceId}`
      const existing = localStorage.getItem(key)
      const history = existing ? JSON.parse(existing) : []
      const newMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        message: messageText,
        timestamp: Date.now(),
        deviceId: device.deviceId,
        deviceName: device.name
      }
      const updated = [newMessage, ...history]
      localStorage.setItem(key, JSON.stringify(updated))
      setSentHistory(updated)
    } catch (e) {
      console.error('Erro ao salvar no histórico:', e)
    }
  }

  const loadSentHistory = () => {
    try {
      const key = `messageHistory_${device.deviceId}`
      const existing = localStorage.getItem(key)
      setSentHistory(existing ? JSON.parse(existing) : [])
    } catch (e) {
      setSentHistory([])
    }
  }

  const handleOpenHistory = () => {
    loadSentHistory()
    setShowHistoryModal(true)
  }

  const handleSendMessage = async () => {
    if (!outgoingMessage.trim()) {
      alert('Digite uma mensagem para enviar')
      return
    }
    if (device.status !== 'online') {
      alert('O dispositivo está offline. Apenas dispositivos online podem receber mensagens.')
      return
    }

    const messageText = outgoingMessage.trim()
    setIsSending(true)
    try {
      const res = await fetch('/api/devices/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.deviceId, message: messageText })
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        saveMessageToHistory(messageText)
        setOutgoingMessage('')
        alert('Mensagem enviada com sucesso!')
        return
      }
      if (sendMessage) {
        sendMessage({
          type: 'send_test_notification',
          deviceId: device.deviceId,
          message: messageText,
          timestamp: Date.now()
        })
        saveMessageToHistory(messageText)
        setOutgoingMessage('')
        alert('Mensagem enviada via WebSocket!')
      } else {
        alert(`Erro: ${data.error || 'Dispositivo não conectado. Verifique se o celular está online e o servidor na porta 3001.'}`)
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      if (sendMessage) {
        sendMessage({
          type: 'send_test_notification',
          deviceId: device.deviceId,
          message: messageText,
          timestamp: Date.now()
        })
        saveMessageToHistory(messageText)
        setOutgoingMessage('')
        alert('Mensagem enviada via WebSocket (API indisponível)')
      } else {
        alert('Erro ao enviar. Verifique se o servidor está rodando na porta 3001.')
      }
    } finally {
      setIsSending(false)
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
      {/* Modal principal - azul meio escuro fora dos balões */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div 
          className="rounded-xl shadow-xl max-w-4xl w-full h-[80vh] flex flex-col bg-background"
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
            {/* Dashboard de Controle - balão com fundo claro */}
            {device.status === 'online' && sendMessage && (
              <div className="mb-6 p-4 bg-surface rounded-xl border border-border">
                <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                  <span>🎛️</span>
                  Controle do Dispositivo
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <button
                    onClick={() => handleControlAction('lock')}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-background hover:bg-surface transition-colors"
                    title="Travar dispositivo - tela preta com cadeado até desbloquear"
                  >
                    <span className="text-2xl">🔒</span>
                    <span className="text-xs font-medium text-primary">Travar</span>
                  </button>
                  <button
                    onClick={() => handleControlAction('unlock')}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-background hover:bg-surface transition-colors"
                    title="Desbloquear dispositivo"
                  >
                    <span className="text-2xl">🔓</span>
                    <span className="text-xs font-medium text-primary">Desbloquear</span>
                  </button>
                  <button
                    onClick={() => handleControlAction('locate')}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-background hover:bg-surface transition-colors"
                    title="Solicitar localização"
                  >
                    <span className="text-2xl">📍</span>
                    <span className="text-xs font-medium text-primary">Localizar</span>
                  </button>
                  <button
                    onClick={() => handleControlAction('alarm')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                      alarmOn ? 'border-red-500 bg-red-50' : 'border-border bg-background hover:bg-surface'
                    }`}
                    title={alarmOn ? 'Parar alarme' : 'Iniciar alarme sonoro'}
                  >
                    <span className="text-2xl">{alarmOn ? '⏹️' : '🔊'}</span>
                    <span className="text-xs font-medium text-primary">{alarmOn ? 'Parar Alerta' : 'Som Alerta'}</span>
                  </button>
                  <button
                    onClick={() => handleControlAction('reboot')}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-background hover:bg-surface hover:border-red-200 transition-colors"
                    title="Reiniciar dispositivo"
                  >
                    <span className="text-2xl">🔄</span>
                    <span className="text-xs font-medium text-primary">Reiniciar</span>
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-secondary mt-2">Carregando mensagens...</p>
              </div>
            ) : messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="bg-surface rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-lg border border-border"
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
                <p className="text-sm text-secondary">
                  Este dispositivo ainda não enviou mensagens de suporte
                </p>
              </div>
            )}
          </div>
          
          {/* Área para enviar mensagem - balão branco onde digita */}
          {device.status === 'online' && sendMessage && (
            <div className="p-6 border-t border-border bg-background text-primary">
              <h4 className="text-sm font-medium text-primary mb-3">📤 Enviar mensagem para o celular</h4>
              <div className="flex gap-3">
                <textarea
                  value={outgoingMessage}
                  onChange={(e) => setOutgoingMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 px-4 py-3 border border-border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900 resize-none min-h-[80px] placeholder:text-gray-500"
                  disabled={isSending}
                  rows={3}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!outgoingMessage.trim() || isSending}
                  className="btn btn-primary self-end px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          )}

          <div className="p-6 border-t border-border">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-secondary">
                  {messages.length} mensagem{messages.length !== 1 ? 's' : ''} de suporte
                </span>
                <button
                  onClick={handleOpenHistory}
                  className="btn btn-sm btn-secondary flex items-center gap-2"
                  title="Ver mensagens enviadas para o celular"
                >
                  <span>📋</span>
                  Ver Histórico
                </button>
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

      {/* Modal de Histórico de Mensagens Enviadas */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-surface rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-primary">📋 Histórico de Mensagens Enviadas</h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {sentHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📭</span>
                  </div>
                  <h4 className="text-lg font-semibold text-primary mb-2">Nenhuma mensagem enviada</h4>
                  <p className="text-sm text-secondary">
                    As mensagens que você enviar para o celular aparecerão aqui
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sentHistory.map((msg) => (
                    <div key={msg.id} className="card p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-primary">{msg.deviceName}</span>
                        <span className="text-xs text-secondary">{formatTimestamp(msg.timestamp)}</span>
                      </div>
                      <p className="text-sm text-black whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border">
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-primary w-full">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de localização com mapa */}
      <LocationMapModal
        device={device}
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
      />

      {/* Modal de detalhes da mensagem - mesma cor do fundo */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-background rounded-xl shadow-xl max-w-2xl w-full">
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
                <span className="text-sm text-secondary">
                  {formatTimestamp(selectedMessage.timestamp)}
                </span>
              </div>
              
              <div>
                <label className="text-sm font-medium text-secondary">Mensagem</label>
                <div className="mt-1 p-3 bg-surface rounded-lg">
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
