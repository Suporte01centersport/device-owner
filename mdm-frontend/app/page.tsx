'use client'

import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import DeviceCard from './components/DeviceCard'
import DeviceModal from './components/DeviceModal'
import SupportMessagesModal from './components/SupportMessagesModal'
import { Device, AppInfo } from './types/device'
import { usePersistence } from './lib/persistence'

// Interfaces Device e AppInfo importadas de './types/device'

export default function Home() {
  // Usar hook de persistência
  const {
    devices,
    adminPassword: currentAdminPassword,
    isLoaded: isDataLoaded,
    updateDevices,
    updateAdminPassword,
    syncWithServer
  } = usePersistence()

  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)
  const [supportDevice, setSupportDevice] = useState<Device | null>(null)
  const [supportNotifications, setSupportNotifications] = useState<any[]>([])
  const [unreadSupportCount, setUnreadSupportCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentView, setCurrentView] = useState('dashboard')
  const [showPassword, setShowPassword] = useState<boolean>(false)


  // Solicitar permissão de notificação
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const websocket = new WebSocket('ws://localhost:3002')
        
        websocket.onopen = () => {
          console.log('WebSocket conectado')
          setIsConnected(true)
          setWs(websocket)
          
          // Send web client identification
          websocket.send(JSON.stringify({
            type: 'web_client',
            timestamp: Date.now()
          }))
          
          // Aguardar um pouco antes de solicitar a senha
          setTimeout(() => {
            // Solicitar senha de administrador atual
            websocket.send(JSON.stringify({
              type: 'get_admin_password',
              timestamp: Date.now()
            }))
          }, 500)
        }

        websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            handleWebSocketMessage(message)
          } catch (error) {
            console.error('Erro ao processar mensagem WebSocket:', error)
          }
        }

        websocket.onclose = () => {
          console.log('WebSocket desconectado')
          setIsConnected(false)
          setWs(null)
          
          // Tentar reconectar após 3 segundos
          setTimeout(connectWebSocket, 3000)
        }

        websocket.onerror = (error) => {
          console.error('Erro WebSocket:', error)
          setIsConnected(false)
        }
      } catch (error) {
        console.error('Erro ao conectar WebSocket:', error)
        setIsConnected(false)
      }
    }

    connectWebSocket()

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [])

  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'devices_list':
        console.log('Lista de dispositivos recebida:', message.devices)
        const newDevices = message.devices || []
        syncWithServer(newDevices, message.adminPassword)
        break
      case 'devices_status':
        console.log('Status dos dispositivos atualizado:', message.devices)
        const updatedDevices = message.devices || []
        syncWithServer(updatedDevices)
        break
      case 'device_status':
        console.log('Status do dispositivo atualizado:', message.device)
        updateDevices(prevDevices => {
          const existingIndex = prevDevices.findIndex(d => d.deviceId === message.device.deviceId)
          if (existingIndex >= 0) {
            const updated = [...prevDevices]
            updated[existingIndex] = { ...updated[existingIndex], ...message.device }
            return updated
          } else {
            return [...prevDevices, message.device]
          }
        })
        break
      case 'device_connected':
        console.log('Dispositivo conectado:', message.device)
        updateDevices(prevDevices => {
          const existingIndex = prevDevices.findIndex(d => d.deviceId === message.device.deviceId)
          if (existingIndex >= 0) {
            const updated = [...prevDevices]
            updated[existingIndex] = { ...updated[existingIndex], ...message.device }
            return updated
          } else {
            return [...prevDevices, message.device]
          }
        })
        break
      case 'device_deleted':
        updateDevices(prevDevices => 
          prevDevices.filter(device => device.deviceId !== message.deviceId)
        )
        break
      case 'app_permissions_updated':
        console.log('Permissões de aplicativos atualizadas:', message)
        updateDevices(prevDevices => 
          prevDevices.map(device => {
            if (device.deviceId === message.deviceId) {
              return { ...device, allowedApps: message.allowedApps }
            }
            return device
          })
        )
        break
      case 'location_updated':
        console.log('Localização atualizada:', message)
        updateDevices(prevDevices => 
          prevDevices.map(device => {
            if (device.deviceId === message.deviceId) {
              return { 
                ...device, 
                latitude: message.location.latitude,
                longitude: message.location.longitude,
                locationAccuracy: message.location.accuracy,
                lastLocationUpdate: message.location.timestamp,
                isLocationEnabled: true
              }
            }
            return device
          })
        )
        break
      case 'admin_password_response':
        const password = message.password || ''
        updateAdminPassword(password)
        break
      case 'new_support_message':
        console.log('Nova mensagem de suporte recebida:', message.data)
        // Mostrar notificação de nova mensagem de suporte
        if (message.data) {
          showSupportNotification(message.data)
        }
        break
      default:
        console.log('Mensagem WebSocket não reconhecida:', message)
    }
  }, [updateDevices, updateAdminPassword, syncWithServer])

  const sendMessage = useCallback((message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket não conectado')
    }
  }, [ws])

  const handleDeviceClick = (device: Device) => {
    setSelectedDevice(device)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedDevice(null)
  }

  const handleDeleteDevice = useCallback((deviceId: string) => {
    if (window.confirm('Tem certeza que deseja deletar este dispositivo permanentemente? Esta ação não pode ser desfeita.')) {
      sendMessage({
        type: 'delete_device',
        deviceId: deviceId,
        timestamp: Date.now()
      })
      console.log('Dispositivo deletado:', deviceId)
    }
  }, [sendMessage])

  const loadUnreadSupportCount = useCallback(async () => {
    try {
      const response = await fetch('/api/support-messages')
      if (response.ok) {
        const allMessages = await response.json()
        const unreadCount = allMessages.filter((msg: any) => msg.status === 'pending').length
        console.log('Contagem de mensagens não lidas:', unreadCount)
        setUnreadSupportCount(unreadCount)
      }
    } catch (error) {
      console.error('Erro ao carregar contagem de mensagens não lidas:', error)
    }
  }, [])

  // Debounced version para evitar chamadas excessivas
  const debouncedLoadUnreadCount = useCallback(() => {
    const timeoutId = setTimeout(() => {
      loadUnreadSupportCount()
    }, 500) // 500ms de debounce
    
    return () => clearTimeout(timeoutId)
  }, [loadUnreadSupportCount])

  const handleSupportClick = useCallback((device: Device) => {
    setSupportDevice(device)
    setIsSupportModalOpen(true)
  }, [])

  const [supportCountUpdateTrigger, setSupportCountUpdateTrigger] = useState(0)

  const handleSupportModalClose = useCallback(() => {
    setIsSupportModalOpen(false)
    setSupportDevice(null)
    // Recarregar contagem após fechar o modal (mensagens podem ter sido lidas)
    loadUnreadSupportCount()
    // Trigger para atualizar todos os badges dos DeviceCards
    setSupportCountUpdateTrigger(prev => prev + 1)
  }, [loadUnreadSupportCount])

  const handleSupportCountUpdate = useCallback(() => {
    loadUnreadSupportCount()
    setSupportCountUpdateTrigger(prev => prev + 1)
  }, [loadUnreadSupportCount])

  const showSupportNotification = useCallback((supportMessage: any) => {
    // Adicionar notificação à lista temporária
    setSupportNotifications(prev => [...prev, {
      ...supportMessage,
      id: supportMessage.id || `notification_${Date.now()}`,
      timestamp: Date.now()
    }])
    
    // Recarregar contagem real do banco de dados com debounce
    debouncedLoadUnreadCount()
    
    // Mostrar notificação do browser se suportado
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nova Mensagem de Suporte', {
        body: `Dispositivo: ${supportMessage.deviceName}\nMensagem: ${supportMessage.message.substring(0, 100)}...`,
        icon: '/favicon.ico',
        tag: 'support-message'
      })
    }
    
    // Auto-remover notificação temporária após 10 segundos
    setTimeout(() => {
      setSupportNotifications(prev => 
        prev.filter(notif => notif.id !== supportMessage.id)
      )
    }, 10000)
  }, [debouncedLoadUnreadCount])

  // Carregar contagem inicial de mensagens não lidas
  useEffect(() => {
    loadUnreadSupportCount()
  }, [loadUnreadSupportCount])

  const handleDeviceDeleted = useCallback((deviceId: string) => {
    setDevices(prevDevices => prevDevices.filter(device => device.deviceId !== deviceId))
  }, [])

  const handleSetAdminPasswordAll = useCallback(() => {
    const passwordInput = document.getElementById('adminPassword') as HTMLInputElement
    const confirmInput = document.getElementById('adminPasswordConfirm') as HTMLInputElement
    
    if (!passwordInput || !confirmInput) {
      alert('Erro: Campos de senha não encontrados')
      return
    }

    const password = passwordInput.value.trim()
    const confirmPassword = confirmInput.value.trim()

    if (!password) {
      alert('Por favor, digite uma senha')
      passwordInput.focus()
      return
    }

    if (password.length < 4) {
      alert('A senha deve ter pelo menos 4 caracteres')
      passwordInput.focus()
      return
    }

    if (password !== confirmPassword) {
      alert('As senhas não coincidem')
      confirmInput.focus()
      return
    }

    const onlineDevices = devices.filter(d => d.status === 'online')
    
    if (confirm(`Definir senha de administrador?${onlineDevices.length > 0 ? `\n\n${onlineDevices.length} dispositivo(s) online receberão a senha imediatamente.` : '\n\nDispositivos receberão a senha quando se conectarem.'}`)) {
      // Enviar para todos os dispositivos (online e offline)
      sendMessage({
        type: 'set_admin_password',
        data: {
          password: password
        },
        timestamp: Date.now()
      })
      
      // Atualizar estado da senha
      updateAdminPassword(password)
      
      if (onlineDevices.length > 0) {
        alert(`Senha de administrador definida e enviada para ${onlineDevices.length} dispositivos online!`)
      } else {
        alert('Senha de administrador definida! Dispositivos receberão a senha quando se conectarem.')
      }
      
      // Limpar campos
      passwordInput.value = ''
      confirmInput.value = ''
    }
  }, [sendMessage, devices, updateAdminPassword])

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard devices={devices} isConnected={isConnected} onMessage={handleWebSocketMessage} />
      case 'devices':
        return (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-primary">Dispositivos</h1>
                <p className="text-secondary mt-1">Gerencie todos os dispositivos conectados</p>
              </div>
              <div className="flex gap-3">
                <button className="btn btn-primary">
                  <span>📱</span>
                  Provisionar Dispositivo
                </button>
                <button className="btn btn-secondary">
                  <span>⚙️</span>
                  Configurações
                </button>
              </div>
            </div>

            {devices.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow">
                  <span className="text-3xl">📱</span>
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2">Nenhum dispositivo conectado</h3>
                <p className="text-secondary mb-6">
                  Conecte dispositivos Android para começar o gerenciamento
                </p>
                <button className="btn btn-primary btn-lg">
                  <span>📱</span>
                  Conectar Primeiro Dispositivo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {devices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    onClick={() => handleDeviceClick(device)}
                    onDelete={() => handleDeleteDevice(device.deviceId)}
                    onSupport={() => handleSupportClick(device)}
                    onSupportCountUpdate={supportCountUpdateTrigger}
                  />
                ))}
              </div>
            )}
          </div>
        )
      case 'settings':
        return (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-primary">Configurações</h1>
                <p className="text-secondary mt-1">Gerencie as configurações do sistema MDM</p>
              </div>
              <div className="flex gap-3">
                <button className="btn btn-secondary">
                  <span>💾</span>
                  Salvar Configurações
                </button>
                <button className="btn btn-primary">
                  <span>🔄</span>
                  Aplicar Mudanças
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Configurações do Servidor */}
              <div className="lg:col-span-2 space-y-6">
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-primary mb-4">Configurações do Servidor</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        Endereço do Servidor WebSocket
                      </label>
                      <input
                        type="text"
                        defaultValue="ws://localhost:3002"
                        className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        Intervalo de Heartbeat (segundos)
                      </label>
                      <input
                        type="number"
                        defaultValue="30"
                        className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-primary mb-4">Configurações de Dispositivo</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-primary">Atualização Automática de Status</div>
                        <div className="text-xs text-secondary">Atualizar status dos dispositivos automaticamente</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-primary">Rastreamento de Localização</div>
                        <div className="text-xs text-secondary">Permitir rastreamento de localização dos dispositivos</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-primary mb-4">Senha de Administrador</h3>
                  
                  {/* Senha Atual */}
                <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <div className="text-sm font-medium text-gray-700">Senha Atual:</div>
                            <div className="text-lg font-mono text-gray-900">
                                {currentAdminPassword ? (showPassword ? currentAdminPassword : '••••••••') : 'Não definida'}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                Debug: {currentAdminPassword ? `Tamanho: ${currentAdminPassword.length}` : 'Vazia'}
                            </div>
                        </div>
                        {currentAdminPassword && (
                            <button
                                onClick={() => setShowPassword(!showPassword)}
                                className="ml-3 p-2 text-gray-500 hover:text-gray-700 transition-colors"
                                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        )}
                    </div>
                </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        Nova Senha de Administrador
                      </label>
                      <input
                        type="password"
                        id="adminPassword"
                        placeholder="Digite a nova senha (mín. 4 caracteres)"
                        className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        Confirmar Senha
                      </label>
                      <input
                        type="password"
                        id="adminPasswordConfirm"
                        placeholder="Confirme a nova senha"
                        className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={handleSetAdminPasswordAll}
                        className="btn btn-primary flex-1"
                      >
                        <span>🔐</span>
                        Definir Senha
                      </button>
                      <button 
                        onClick={() => {
                          const passwordInput = document.getElementById('adminPassword') as HTMLInputElement
                          const confirmInput = document.getElementById('adminPasswordConfirm') as HTMLInputElement
                          if (passwordInput) passwordInput.value = ''
                          if (confirmInput) confirmInput.value = ''
                        }}
                        className="btn btn-secondary"
                      >
                        <span>🗑️</span>
                        Limpar
                      </button>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-xs text-blue-800">
                        <strong>📋 Instruções:</strong>
                        <ul className="mt-1 list-disc list-inside space-y-1">
                          <li>A senha será salva no servidor e enviada para <strong>todos os dispositivos</strong></li>
                          <li>Será necessária para alterar o nome do dispositivo</li>
                          <li>Dispositivos offline receberão a senha automaticamente quando se conectarem</li>
                          <li>Você pode definir a senha mesmo sem dispositivos conectados</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar de Informações */}
              <div className="space-y-6">
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-primary mb-4">Status do Sistema</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-secondary">Servidor WebSocket</span>
                      <span className={`badge ${isConnected ? 'badge-success' : 'badge-error'}`}>
                        {isConnected ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-secondary">Dispositivos Conectados</span>
                      <span className="text-sm font-medium text-primary">
                        {devices.filter(d => d.status === 'online').length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-secondary">Total de Dispositivos</span>
                      <span className="text-sm font-medium text-primary">{devices.length}</span>
                    </div>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-primary mb-4">Ações Rápidas</h3>
                  <div className="space-y-3">
                    <button className="btn btn-secondary w-full">
                      <span>🔄</span>
                      Reiniciar Servidor
                    </button>
                    <button className="btn btn-secondary w-full">
                      <span>💾</span>
                      Backup de Configurações
                    </button>
                    <button className="btn btn-warning w-full">
                      <span>⚠️</span>
                      Limpar Cache
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      default:
        return <Dashboard devices={devices} isConnected={isConnected} />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <Header 
          isConnected={isConnected}
          onMenuClick={() => setSidebarOpen(true)}
          supportNotifications={supportNotifications}
          unreadSupportCount={unreadSupportCount}
          onSupportNotificationClick={(deviceId) => {
            const device = devices.find(d => d.deviceId === deviceId)
            if (device) {
              handleSupportClick(device)
            }
          }}
        />

        {/* Content */}
        <main className="animate-fade-in">
          {!isDataLoaded ? (
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Carregando dados salvos...</p>
              </div>
            </div>
          ) : (
            renderContent()
          )}
        </main>
      </div>

      {/* Device Modal */}
      {isModalOpen && selectedDevice && (
        <DeviceModal
          device={selectedDevice}
          onClose={handleCloseModal}
          onDelete={() => handleDeleteDevice(selectedDevice.deviceId)}
          sendMessage={sendMessage}
        />
      )}

      {/* Support Messages Modal */}
      {isSupportModalOpen && supportDevice && (
        <SupportMessagesModal
          device={supportDevice}
          isOpen={isSupportModalOpen}
          onClose={handleSupportModalClose}
          onMessageStatusUpdate={handleSupportCountUpdate}
        />
      )}
    </div>
  )
}