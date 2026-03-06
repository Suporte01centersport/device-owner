'use client'

import { useState, useEffect } from 'react'
import { Computer } from '../../types/uem'
import RemoteDesktopViewer from './RemoteDesktopViewer'
import RemoteDesktopViewerWebRTC from './RemoteDesktopViewerWebRTC'

interface RemoteAccessModalProps {
  computer: Computer
  onClose: () => void
  websocket?: WebSocket
}

export default function RemoteAccessModal({ computer, onClose, websocket }: RemoteAccessModalProps) {
  const [loading, setLoading] = useState(false)
  const [remoteInfo, setRemoteInfo] = useState<{
    anydeskId?: string
    anydeskInstalled: boolean
    rdpEnabled: boolean
    connectionString?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRemoteDesktop, setShowRemoteDesktop] = useState(true) // Abrir diretamente
  const [useWebRTC, setUseWebRTC] = useState(false) // Usar WebSocket simples por padrão (o agente envia frames via WebSocket)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    // Se o computador estiver online, iniciar sessão automaticamente e mostrar visualizador
    // Usar sessionId já existente se houver, para evitar múltiplas sessões
    if (computer.status === 'online' && !sessionId) {
      const newSessionId = `desktop_${computer.computerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      setSessionId(newSessionId)
      startRemoteDesktop(newSessionId)
    } else if (computer.status !== 'online') {
      setError('Computador está offline. Não é possível conectar.')
      setShowRemoteDesktop(false)
    }
  }, [computer.status, computer.computerId]) // Removido sessionId das dependências para evitar loop
  
  const startRemoteDesktop = async (newSessionId: string) => {
    try {
      const response = await fetch('/api/uem/remote/desktop/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ computerId: computer.computerId })
      })
      
      const result = await response.json()
      if (result.success) {
        const finalSessionId = result.sessionId || newSessionId
        setSessionId(finalSessionId)
        setShowRemoteDesktop(true)
      } else {
        setError(result.error || 'Erro ao iniciar sessão de acesso remoto')
        setShowRemoteDesktop(false)
      }
      } catch (err) {
        setError('Erro ao conectar com o servidor')
      }
  }

  const loadRemoteAccessInfo = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/uem/remote/access?computerId=${computer.computerId}`)
      const data = await response.json()
      
      if (data.success) {
        setRemoteInfo(data.info)
      } else {
        setError(data.error || 'Erro ao carregar informações de acesso remoto')
      }
      } catch (err) {
        setError('Erro ao conectar com o servidor')
      } finally {
      setLoading(false)
    }
  }

  const handleStartAnyDesk = async () => {
    try {
      const response = await fetch('/api/uem/remote/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: computer.computerId,
          action: 'start_anydesk'
        })
      })

      const result = await response.json()
      if (result.success) {
        // Recarregar informações após iniciar
        await loadRemoteAccessInfo()
      } else {
        alert(`Erro: ${result.error}`)
      }
    } catch (err) {
      alert('Erro ao iniciar AnyDesk')
    }
  }

  const handleCopyAnyDeskId = () => {
    if (remoteInfo?.anydeskId) {
      navigator.clipboard.writeText(remoteInfo.anydeskId)
      alert('ID do AnyDesk copiado!')
    }
  }

  // Se mostrar desktop remoto, renderizar o visualizador diretamente (tela cheia)
  if (showRemoteDesktop && sessionId && computer.status === 'online') {
    // Usar WebRTC se disponível, caso contrário usar WebSocket
    if (useWebRTC) {
      return (
        <RemoteDesktopViewerWebRTC
          computer={computer}
          sessionId={sessionId}
          onClose={() => {
            setShowRemoteDesktop(false)
            // Parar sessão WebRTC
            fetch('/api/uem/remote/desktop/stop', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                sessionId: sessionId,
                computerId: computer.computerId,
                useWebRTC: true
              })
            }).catch(() => {}) // Silenciosamente ignorar erros
            onClose()
          }}
          websocket={websocket}
        />
      )
    } else {
      return (
        <RemoteDesktopViewer
          computer={computer}
          sessionId={sessionId}
          onClose={() => {
            setShowRemoteDesktop(false)
            // Parar sessão
            fetch('/api/uem/remote/desktop/stop', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                sessionId: sessionId,
                computerId: computer.computerId 
              })
            }).catch(() => {}) // Silenciosamente ignorar erros
            onClose()
          }}
          websocket={websocket}
        />
      )
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => {
        // Não fechar ao clicar no backdrop - apenas com botão ou ESC
        e.stopPropagation()
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-primary">Acesso Remoto - {computer.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-secondary">Carregando informações de acesso remoto...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* AnyDesk Section */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xl">🖥️</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-primary">AnyDesk</h3>
                    <p className="text-sm text-secondary">Acesso remoto via AnyDesk</p>
                  </div>
                </div>

                {remoteInfo?.anydeskInstalled ? (
                  <div className="space-y-4">
                    {remoteInfo.anydeskId ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-secondary mb-1">ID do AnyDesk:</p>
                            <p className="text-2xl font-mono font-bold text-primary">
                              {remoteInfo.anydeskId}
                            </p>
                          </div>
                          <button
                            onClick={handleCopyAnyDeskId}
                            className="btn btn-primary"
                          >
                            Copiar ID
                          </button>
                        </div>
                        <p className="text-xs text-secondary mt-2">
                          Use este ID no AnyDesk para conectar ao computador
                        </p>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-yellow-800 mb-3">
                          AnyDesk está instalado, mas não está rodando ou não foi possível obter o ID.
                        </p>
                        <button
                          onClick={handleStartAnyDesk}
                          className="btn btn-primary"
                        >
                          Iniciar AnyDesk
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800 mb-3">
                      AnyDesk não está instalado neste computador.
                    </p>
                    <p className="text-sm text-secondary mb-3">
                      Instale o AnyDesk no computador para habilitar acesso remoto.
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/uem/remote/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              deviceId: computer.computerId,
                              action: 'install_anydesk'
                            })
                          })
                          const result = await response.json()
                          if (result.success) {
                            alert('Comando para instalar AnyDesk enviado!')
                            await loadRemoteAccessInfo()
                          } else {
                            alert(`Erro: ${result.error}`)
                          }
                        } catch (err) {
                          alert('Erro ao enviar comando')
                        }
                      }}
                      className="btn btn-primary"
                    >
                      Instalar AnyDesk
                    </button>
                  </div>
                )}
              </div>

              {/* RDP Section */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xl">🖥️</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-primary">RDP (Remote Desktop)</h3>
                    <p className="text-sm text-secondary">Acesso remoto via Windows Remote Desktop</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-secondary">Status RDP:</span>
                    <span className={`badge ${remoteInfo?.rdpEnabled ? 'badge-success' : 'badge-error'}`}>
                      {remoteInfo?.rdpEnabled ? 'Habilitado' : 'Desabilitado'}
                    </span>
                  </div>

                  {!remoteInfo?.rdpEnabled && (
                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/uem/remote/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              deviceId: computer.computerId,
                              action: 'enable_rdp'
                            })
                          })
                          const result = await response.json()
                          if (result.success) {
                            alert('RDP habilitado com sucesso!')
                            await loadRemoteAccessInfo()
                          } else {
                            alert(`Erro: ${result.error}`)
                          }
                        } catch (err) {
                          alert('Erro ao habilitar RDP')
                        }
                      }}
                      className="btn btn-primary w-full"
                    >
                      Habilitar RDP
                    </button>
                  )}

                  {remoteInfo?.rdpEnabled && computer.ipAddress && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-secondary mb-2">Conectar usando:</p>
                      <p className="text-lg font-mono text-primary">
                        mstsc /v:{computer.ipAddress}
                      </p>
                      <p className="text-xs text-secondary mt-2">
                        Use o comando acima no prompt de comando do Windows ou conecte via cliente RDP
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Acesso Remoto Integrado */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xl">🖥️</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-primary">Acesso Remoto Integrado</h3>
                    <p className="text-sm text-secondary">Visualize e controle a tela do computador diretamente no navegador</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-secondary">
                    Conecte-se ao computador remotamente e controle como se estivesse fisicamente presente.
                    Você poderá ver a tela do computador e interagir com mouse e teclado.
                  </p>
                  
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/uem/remote/desktop/start', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ computerId: computer.computerId })
                        })
                        
                        const result = await response.json()
                        if (result.success) {
                          setSessionId(result.sessionId)
                          setShowRemoteDesktop(true)
                        } else {
                          alert(`Erro: ${result.error}`)
                        }
                      } catch (err) {
                        alert('Erro ao iniciar acesso remoto')
                        // Silenciosamente ignorar erros
                      }
                    }}
                    className="btn btn-primary w-full text-lg py-3"
                    disabled={computer.status !== 'online'}
                  >
                    {computer.status === 'online' ? '🖥️ Conectar e Controlar Remotamente' : 'Computador Offline'}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-bold text-red-600 mb-2">📋 Instruções</h4>
                <ul className="text-sm text-secondary space-y-1 list-disc list-inside">
                  <li><strong>Acesso Remoto Integrado:</strong> Clique no botão acima para conectar e controlar o computador diretamente no navegador</li>
                  <li>AnyDesk: Instale o AnyDesk no computador e use o ID acima para conectar</li>
                  <li>RDP: Configure o usuário remoto no Windows e use o IP acima para conectar</li>
                  <li>Ambos os métodos requerem que o computador esteja online e acessível na rede</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Fechar
          </button>
        </div>
      </div>

    </div>
  )
}

