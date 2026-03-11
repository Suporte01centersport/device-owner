'use client'

import { useState, useEffect, useRef } from 'react'
import { Device, AppInfo } from '../types/device'
import LocationView from './LocationView'
import ReportsTab from './ReportsTab'
import TermsModal from './TermsModal'
import { showAlert, showConfirm } from '../lib/dialog'

// Interfaces Device e AppInfo importadas de '../types/device'

interface DeviceModalProps {
  device: Device
  onClose: () => void
  onDelete: (deviceId: string) => void
  onUpdate?: () => void
  sendMessage: (message: any) => void
  onUnlinkUser?: () => void
  initialTab?: string
}

export default function DeviceModal({ device, onClose, onDelete, onUpdate, sendMessage, onUnlinkUser, initialTab = 'overview' }: DeviceModalProps) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [assignedUser, setAssignedUser] = useState<any>(null)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab, device.deviceId])
  const [loadingUser, setLoadingUser] = useState(false)
  
  // Buscar dados completos do usuário da API
  useEffect(() => {
    const loadUserData = async () => {
      if (!device.assignedDeviceUserId && !device.assignedUserId) {
        setAssignedUser(null)
        return
      }
      
      setLoadingUser(true)
      try {
        const response = await fetch(`/api/devices/assign-user?deviceId=${device.deviceId}`)
        const result = await response.json()
        
        if (result.success && result.device) {
          setAssignedUser({
            id: result.device.user_id,
            name: result.device.name,
            cpf: result.device.cpf,
            email: result.device.email,
            phone: result.device.phone,
            department: result.device.department,
            position: result.device.position
          })
        }
      } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error)
      } finally {
        setLoadingUser(false)
      }
    }
    
    loadUserData()
  }, [device.deviceId, device.assignedDeviceUserId, device.assignedUserId])

  // Função para detectar se os dados são válidos ou ainda estão carregando
  const isDataLoading = () => {
    // Detectar valores zerados
    const isZeroed = device.batteryLevel === 0 && 
                     device.installedAppsCount === 0 && 
                     device.storageTotal === 0
    
    // Detectar valores simulados específicos (85% bateria, 32GB total, 15GB usado, 3 apps)
    const isSimulated = device.batteryLevel === 85 && 
                        device.storageTotal === 32 * 1024 * 1024 * 1024 && // 32GB
                        device.storageUsed === 15 * 1024 * 1024 * 1024 &&   // 15GB
                        device.installedAppsCount === 3
    
    return isZeroed || isSimulated
  }
  const MDM_PACKAGE = 'com.mdm.launcher'
  const [selectedApps, setSelectedApps] = useState<string[]>(() => (device.allowedApps || []).filter(p => p !== MDM_PACKAGE))
  const [isSaving, setIsSaving] = useState(false)
  const [appFilter, setAppFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isApplyingPolicies, setIsApplyingPolicies] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  // Estado para Modo Perdido
  const [lostModeMessage, setLostModeMessage] = useState('')

  // Estado para Configuração WiFi
  const [wifiSSID, setWifiSSID] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [wifiSecurity, setWifiSecurity] = useState('WPA')

  // Estado para confirmação de Wipe Seletivo
  const [showSelectiveWipeConfirm, setShowSelectiveWipeConfirm] = useState(false)
  
  // Fechar TermsModal ao pressionar ESC (prioridade sobre o modal principal)
  useEffect(() => {
    if (!showTermsModal) return
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // Prevenir que o handler do modal principal também execute
        setShowTermsModal(false)
      }
    }
    // Usar capture phase para garantir que executa primeiro
    document.addEventListener('keydown', handleEsc, true)
    return () => document.removeEventListener('keydown', handleEsc, true)
  }, [showTermsModal])

  // Fechar ao pressionar ESC (modal principal) - só fecha se não houver modais internos abertos
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Se há um modal interno aberto, não fechar o modal principal
        if (!showTermsModal && !showMessageModal && !showHistoryModal) {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose, showTermsModal, showMessageModal, showHistoryModal])
  
  const [deviceGroups, setDeviceGroups] = useState<Array<{ id: string; name: string; color: string; policies: Array<{ packageName: string; appName: string }> }>>([])
  const [groupPolicyApps, setGroupPolicyApps] = useState<string[]>([]) // Apps que estão em políticas de grupo
  const [messageHistory, setMessageHistory] = useState<Array<{
    id: string
    message: string
    timestamp: number
    deviceId: string
    deviceName: string
  }>>([])

  // Buscar grupos do dispositivo e suas políticas
  useEffect(() => {
    const loadDeviceGroups = async () => {
      try {
        const res = await fetch(`/api/devices/${device.deviceId}/groups`)
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            setDeviceGroups(data.data.groups || [])
            setGroupPolicyApps(data.data.groupPolicyApps || [])
          }
        }
      } catch (error) {
        console.error('Erro ao buscar grupos do dispositivo:', error)
      }
    }
    loadDeviceGroups()
  }, [device.deviceId])

  // Timestamp da última mudança local - ignora syncs do servidor por 3s após toggle
  const lastLocalChangeRef = useRef(0)
  const sendTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Sincronizar selectedApps com allowedApps do dispositivo
  useEffect(() => {
    // Ignorar sync do servidor se houve mudança local recente (evita loop)
    if (Date.now() - lastLocalChangeRef.current < 3000) return
    if (device.allowedApps) {
      const individualApps = device.allowedApps.filter(app => app !== MDM_PACKAGE && !groupPolicyApps.includes(app))
      setSelectedApps(individualApps)
    }
  }, [device.allowedApps, groupPolicyApps])

  const formatStorage = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatLastSeen = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (days > 0) return `${days} dias atrás`
    if (hours > 0) return `${hours} horas atrás`
    if (minutes > 0) return `${minutes} minutos atrás`
    return 'Agora'
  }



  const getBatteryColor = (level: number) => {
    if (level > 50) return 'text-success'
    if (level > 20) return 'text-warning'
    return 'text-error'
  }

  const handleAppToggle = (packageName: string) => {
    lastLocalChangeRef.current = Date.now()

    setSelectedApps(prev => {
      const newSelected = prev.includes(packageName)
        ? prev.filter(pkg => pkg !== packageName)
        : [...prev, packageName]

      // Debounce: esperar 500ms antes de enviar, cancela envios anteriores
      if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current)
      sendTimeoutRef.current = setTimeout(() => {
        const finalApps = Array.from(new Set([...newSelected, ...groupPolicyApps])).filter(p => p !== MDM_PACKAGE)
        sendMessage({
          type: 'update_app_permissions',
          deviceId: device.deviceId,
          allowedApps: finalApps,
          individualApps: newSelected,
          isIndividual: true,
          timestamp: Date.now()
        })
      }, 500)

      return newSelected
    })
  }

  const handleSavePermissions = async () => {
    setIsSaving(true)
    try {
      // ✅ Apps individuais têm prioridade: mesclar com apps da política de grupo
      // Quando salvamos individualmente, mantemos os apps da política de grupo também
      // Mas os apps individuais não serão afetados quando a política de grupo for aplicada
      const finalApps = Array.from(new Set([...selectedApps, ...groupPolicyApps])).filter(p => p !== MDM_PACKAGE)
      
      // Enviar permissões via WebSocket
      // ✅ IMPORTANTE: Marcar como isIndividual=true e enviar selectedApps separadamente
      // para que o servidor possa marcar apenas esses como individuais
      sendMessage({
        type: 'update_app_permissions',
        deviceId: device.deviceId,
        allowedApps: finalApps, // Apps individuais (prioritários) + apps da política de grupo
        individualApps: selectedApps, // Lista separada de apps individuais (apenas os selecionados no modal)
        isIndividual: true, // Marcar como apps individuais para preservação
        timestamp: Date.now()
      })
      
      showAlert(`Permissões salvas com sucesso!\n\nApps individuais: ${selectedApps.length}\nApps de política de grupo: ${groupPolicyApps.length}\nTotal: ${finalApps.length}\n\nApps individuais têm prioridade e não serão afetados pela política de grupo.`)
    } catch (error) {
      console.error('Erro ao salvar permissões:', error)
      showAlert('Erro ao salvar permissões')
    } finally {
      setIsSaving(false)
    }
  }

  const isAppAllowed = (packageName: string) => {
    return selectedApps.includes(packageName)
  }

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      showAlert('Por favor, digite uma mensagem')
      return
    }

    setIsSendingMessage(true)
    try {
      const messageData = {
        type: 'send_test_notification',
        deviceId: device.deviceId,
        message: messageText.trim(),
        timestamp: Date.now()
      }
      
      console.log('📤 Enviando mensagem personalizada:', messageData)
      sendMessage(messageData)
      
      // Salvar mensagem no histórico
      saveMessageToHistory(messageText.trim())
      
      // Mostrar notificação local de confirmação
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('MDM Center', {
            body: `Mensagem enviada para ${device.name}`,
            icon: '/icon-192.png',
            tag: 'message-sent'
          })
        } catch (e) {
          console.error('❌ Erro ao exibir notificação local:', e)
        }
      }
      
      // Fechar modal e limpar texto
      setShowMessageModal(false)
      setMessageText('')
      showAlert('Mensagem enviada com sucesso!')
      
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      showAlert('Erro ao enviar mensagem')
    } finally {
      setIsSendingMessage(false)
    }
  }

  const handleOpenMessageModal = () => {
    setShowMessageModal(true)
    setMessageText('')
  }

  const handleCloseMessageModal = () => {
    setShowMessageModal(false)
    setMessageText('')
  }


  const loadMessageHistory = () => {
    try {
      const savedHistory = localStorage.getItem(`messageHistory_${device.deviceId}`)
      if (savedHistory) {
        const history = JSON.parse(savedHistory)
        setMessageHistory(history)
      }
    } catch (error) {
      console.error('Erro ao carregar histórico de mensagens:', error)
    }
  }

  const saveMessageToHistory = (message: string) => {
    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: message,
      timestamp: Date.now(),
      deviceId: device.deviceId,
      deviceName: device.name
    }
    
    const updatedHistory = [newMessage, ...messageHistory]
    setMessageHistory(updatedHistory)
    
    try {
      localStorage.setItem(`messageHistory_${device.deviceId}`, JSON.stringify(updatedHistory))
    } catch (error) {
      console.error('Erro ao salvar histórico de mensagens:', error)
    }
  }

  const handleOpenHistoryModal = () => {
    loadMessageHistory()
    setShowHistoryModal(true)
  }

  const handleCloseHistoryModal = () => {
    setShowHistoryModal(false)
  }

  const handleClearHistory = async () => {
    if (await showConfirm('Tem certeza que deseja limpar todo o histórico de mensagens? Esta ação não pode ser desfeita.')) {
      setMessageHistory([])
      try {
        localStorage.removeItem(`messageHistory_${device.deviceId}`)
        console.log('Histórico de mensagens limpo com sucesso')
      } catch (error) {
        console.error('Erro ao limpar histórico de mensagens:', error)
      }
    }
  }

  const formatMessageTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // Handler para Modo Perdido
  const handleLostMode = async (enabled: boolean) => {
    try {
      await fetch('/api/devices/lost-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.deviceId,
          enabled,
          message: lostModeMessage.trim()
        })
      })

      sendMessage({
        type: 'lost_mode',
        deviceId: device.deviceId,
        enabled,
        message: lostModeMessage.trim(),
        timestamp: Date.now()
      })

      showAlert(enabled ? 'Modo Perdido ativado com sucesso!' : 'Modo Perdido desativado.')
    } catch (error) {
      console.error('Erro ao alterar Modo Perdido:', error)
      showAlert('Erro ao alterar Modo Perdido')
    }
  }

  // Handler para Configuração WiFi
  const handleConfigureWifi = async () => {
    if (!wifiSSID.trim()) {
      showAlert('Por favor, informe o nome da rede (SSID)')
      return
    }
    if (wifiSecurity !== 'OPEN' && !wifiPassword.trim()) {
      showAlert('Por favor, informe a senha da rede')
      return
    }

    sendMessage({
      type: 'configure_wifi',
      deviceId: device.deviceId,
      ssid: wifiSSID.trim(),
      password: wifiPassword.trim(),
      security: wifiSecurity,
      timestamp: Date.now()
    })

    showAlert(`Configuração WiFi "${wifiSSID}" enviada para o dispositivo!`)
    setWifiSSID('')
    setWifiPassword('')
    setWifiSecurity('WPA')
  }

  // Handler para Wipe Seletivo
  const handleSelectiveWipe = async () => {
    sendMessage({
      type: 'selective_wipe',
      deviceId: device.deviceId,
      timestamp: Date.now()
    })

    setShowSelectiveWipeConfirm(false)
    showAlert('Comando de Wipe Seletivo enviado. Apenas os dados de aplicações serão removidos.')
  }

  const getFilteredApps = () => {
    if (!device.installedApps) return []
    
    let filtered = device.installedApps.filter(app => 
      app && app.packageName && app.appName && app.packageName !== MDM_PACKAGE
    )

    // Aplicar filtro de tipo
    switch (appFilter) {
      case 'system':
        filtered = filtered.filter(app => app.isSystemApp)
        break
      case 'user':
        filtered = filtered.filter(app => !app.isSystemApp)
        break
      case 'allowed':
        filtered = filtered.filter(app => selectedApps.includes(app.packageName))
        break
      default:
        // 'all' - não filtrar por tipo
        break
    }

    // Aplicar busca por texto
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(app => 
        app.appName.toLowerCase().includes(query) ||
        app.packageName.toLowerCase().includes(query)
      )
    }

    return filtered
  }

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: '📊' },
    { id: 'apps', label: 'Aplicações', icon: '📱' },
    { id: 'map', label: 'Localização', icon: '🗺️' },
    { id: 'reports', label: 'Relatórios', icon: '📈' },
    { id: 'network', label: 'Rede', icon: '🌐' },
    { id: 'info', label: 'Informações', icon: '📋' }
  ]

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Só fecha o modal principal se não houver modal interno aberto
        if (!showTermsModal && !showMessageModal && !showHistoryModal) {
          onClose()
        }
      }}
    >
      <div 
        className="bg-surface rounded-xl shadow-xl max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
                <span className="text-white text-2xl">📱</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-primary">
                  {device.assignedUserName ? `${device.name} • ${device.assignedUserName}` : device.name}
                </h2>
                <p className="text-[var(--text-primary)]">{device.model} • {device.manufacturer}</p>
                <div className="flex items-center gap-4 mt-2">
                  <div className={`status-dot ${
                    device.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
                  }`} />
                  <span className="text-sm text-[var(--text-primary)]">{device.status}</span>
                  <span className="text-sm text-[var(--text-primary)]">•</span>
                  <span className="text-sm text-[var(--text-primary)]">{formatLastSeen(device.lastSeen)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onUpdate && (
                <button
                  onClick={onUpdate}
                  className="btn btn-sm btn-success"
                  title="Atualizar APK do dispositivo"
                >
                  <span>📥</span>
                  Atualizar
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:text-primary transition-colors rounded-lg hover:bg-border-light"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--surface-elevated)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-success rounded-lg flex items-center justify-center">
                      <span className="text-white">🔋</span>
                    </div>
                    <div>
                      <div className="text-sm text-[var(--text-primary)]">Bateria</div>
                      {isDataLoading() ? (
                        <div className="text-xl font-bold text-[var(--text-secondary)]">
                          Carregando...
                        </div>
                      ) : (
                        <div className={`text-xl font-bold ${getBatteryColor(device.batteryLevel)}`}>
                          {device.batteryLevel}%
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-primary)]">
                    {isDataLoading() ? 'aguarde' : (device.isCharging ? 'Carregando' : device.batteryStatus)}
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <span className="text-white">💾</span>
                    </div>
                    <div>
                      <div className="text-sm text-[var(--text-primary)]">Armazenamento</div>
                      {isDataLoading() ? (
                        <div className="text-xl font-bold text-[var(--text-secondary)]">
                          Carregando...
                        </div>
                      ) : (
                        <div className="text-xl font-bold text-primary">
                          {Math.round((device.storageUsed / device.storageTotal) * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-primary)]">
                    {isDataLoading() ? 'aguarde' : `${formatStorage(device.storageUsed)} / ${formatStorage(device.storageTotal)}`}
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-warning rounded-lg flex items-center justify-center">
                      <span className="text-white">📱</span>
                    </div>
                    <div>
                      <div className="text-sm text-[var(--text-primary)]">Apps</div>
                      {isDataLoading() ? (
                        <div className="text-xl font-bold text-[var(--text-secondary)]">
                          Carregando...
                        </div>
                      ) : (
                        <div className="text-xl font-bold text-warning">
                          {device.installedAppsCount}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-primary)]">
                    {isDataLoading() ? 'aguarde' : 'Instalados'}
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-info rounded-lg flex items-center justify-center">
                      <span className="text-white">✅</span>
                    </div>
                    <div>
                      <div className="text-sm text-[var(--text-primary)]">Apps Permitidos</div>
                      <div className="text-xl font-bold text-info">
                        {device.allowedApps?.length || 0}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-primary)]">No Launcher</div>
                </div>
              </div>

              {/* Device Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-primary">Informações Básicas</h3>
                  <div className="space-y-3">
                    {assignedUser ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[var(--text-primary)] font-semibold">👤 Usuário</span>
                        </div>
                        <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg p-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[var(--text-primary)] font-semibold">{assignedUser.name}</span>
                            <span className="text-sm text-[var(--text-secondary)]">CPF: {assignedUser.cpf}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg p-3">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <span>👤</span>
                          <span className="text-sm">Nenhum usuário vinculado</span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Versão do App</span>
                      <span className="text-primary">{device.appVersion}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-primary">Status do Sistema</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Wi-Fi</span>
                      <span className={`badge ${device.isWifiEnabled ? 'badge-success' : 'badge-error'}`}>
                        {device.isWifiEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Bluetooth</span>
                      <span className={`badge ${device.isBluetoothEnabled ? 'badge-success' : 'badge-error'}`}>
                        {device.isBluetoothEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Localização</span>
                      <span className={`badge ${device.isLocationEnabled ? 'badge-success' : 'badge-error'}`}>
                        {device.isLocationEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modo Perdido */}
              <div className="p-4 bg-[var(--surface-elevated)] rounded-lg border border-[var(--border)]">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <span>🔍</span> Modo Perdido
                </h4>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  Ativa alarme sonoro, bloqueia o dispositivo e rastreia localização continuamente.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Mensagem na tela do dispositivo..."
                    value={lostModeMessage}
                    onChange={(e) => setLostModeMessage(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)]"
                  />
                  <button
                    onClick={() => handleLostMode(!device.lostMode)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${
                      device.lostMode
                        ? 'bg-red-500/150/150/20 text-red-400 border border-red-500/40 hover:bg-red-500/150/150/30'
                        : 'bg-[var(--primary)] text-[var(--text-primary)] hover:opacity-90'
                    }`}
                  >
                    {device.lostMode ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Informações do Sistema */}
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">Informações do Sistema</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card p-4">
                    <h4 className="font-semibold text-primary mb-3">Sistema Operacional</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">OS Type</span>
                        <span className="text-primary">{device.osType || 'Android'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Versão Android</span>
                        <span className="text-primary">{device.androidVersion}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">API Level</span>
                        <span className="text-primary">{device.apiLevel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Fabricante</span>
                        <span className="text-primary">{device.manufacturer}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Modelo</span>
                        <span className="text-primary">{device.model}</span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <h4 className="font-semibold text-primary mb-3">Identificadores</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between gap-2">
                        <span className="text-[var(--text-primary)] flex-shrink-0">Device ID</span>
                        <span className="font-mono text-xs text-primary truncate">{device.deviceId}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[var(--text-primary)] flex-shrink-0">IMEI</span>
                        <span className="font-mono text-xs text-primary truncate">{device.imei || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-[var(--text-primary)] flex-shrink-0">MEID</span>
                        <span className="font-mono text-xs text-primary truncate">{device.meid || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hardware */}
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">Especificações de Hardware</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card p-4">
                    <h4 className="font-semibold text-primary mb-3">Processador</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Arquitetura</span>
                        <span className="text-primary">{device.cpuArchitecture}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="card p-4">
                    <h4 className="font-semibold text-primary mb-3">Tela</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Resolução</span>
                        <span className="text-primary">{device.screenResolution}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Densidade</span>
                        <span className="text-primary">{device.screenDensity} DPI</span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <h4 className="font-semibold text-primary mb-3">Memória</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Total</span>
                        <span className="text-primary">{formatStorage(device.memoryTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Usada</span>
                        <span className="text-primary">{formatStorage(device.memoryUsed)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-primary)]">Livre</span>
                        <span className="text-primary">{formatStorage(device.memoryTotal - device.memoryUsed)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Segurança e Conformidade */}
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">Segurança e Conformidade</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card p-4">
                    <h4 className="font-semibold text-primary mb-3">Status de Conformidade</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--text-primary)]">Compliance Status</span>
                        <span className={`badge ${
                          device.complianceStatus === 'compliant' ? 'badge-success' : 
                          device.complianceStatus === 'non_compliant' ? 'badge-warning' : 
                          'badge-gray'
                        }`}>
                          {device.complianceStatus === 'compliant' ? 'Conforme' :
                           device.complianceStatus === 'non_compliant' ? 'Não Conforme' :
                           'Desconhecido'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <h4 className="font-semibold text-primary mb-3">Configurações do Sistema</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--text-primary)]">Fontes Desconhecidas</span>
                        <span className={`badge ${device.isUnknownSourcesEnabled ? 'badge-warning' : 'badge-gray'}`}>
                          {device.isUnknownSourcesEnabled ? 'Habilitado' : 'Desabilitado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-primary">Informações de Rede</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Conexão Atual</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Tipo de Rede</span>
                      <span className="text-primary">{device.networkType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Wi-Fi SSID</span>
                      <span className="text-primary">{device.wifiSSID || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">IP Address</span>
                      <span className="font-mono text-sm text-primary">{device.ipAddress}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">MAC Address</span>
                      <span className="font-mono text-sm text-primary">{device.macAddress}</span>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Configurações de Rede</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Wi-Fi</span>
                      <span className={`badge ${device.isWifiEnabled ? 'badge-success' : 'badge-error'}`}>
                        {device.isWifiEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Bluetooth</span>
                      <span className={`badge ${device.isBluetoothEnabled ? 'badge-success' : 'badge-error'}`}>
                        {device.isBluetoothEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-primary)]">Localização</span>
                      <span className={`badge ${device.isLocationEnabled ? 'badge-success' : 'badge-error'}`}>
                        {device.isLocationEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'apps' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-primary">Aplicações Instaladas</h3>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-[var(--text-primary)]">
                    Total: {isDataLoading() ? 'Carregando...' : `${device.installedApps?.length || 0} aplicações`}
                  </div>
                  <div className="text-sm text-primary">
                    Permitidas: {selectedApps.length}
                  </div>
                </div>
              </div>

              {isDataLoading() ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl animate-pulse">📱</span>
                  </div>
                  <h4 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">Carregando aplicações...</h4>
                  <p className="text-sm text-[var(--text-muted)]">
                    Aguarde enquanto coletamos as informações das aplicações instaladas
                  </p>
                </div>
              ) : !device.installedApps || device.installedApps.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📱</span>
                  </div>
                  <h4 className="text-lg font-semibold text-primary mb-2">Nenhuma aplicação encontrada</h4>
                  <p className="text-sm text-[var(--text-primary)]">
                    As aplicações instaladas serão exibidas aqui quando disponíveis
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Barra de busca */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar aplicações..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all duration-200"
                    />
                  </div>

                  {/* Filtros */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'Todas' },
                      { id: 'allowed', label: 'Permitidas' },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        onClick={() => setAppFilter(filter.id)}
                        className={`btn btn-sm ${
                          appFilter === filter.id ? 'btn-primary' : 'btn-ghost'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {/* Mensagem informativa para modo quiosque */}

                  {/* Lista de aplicações */}
                  <div className="space-y-2">
                    {getFilteredApps().length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-border-light rounded-full flex items-center justify-center mx-auto mb-3">
                          <span className="text-2xl">🔍</span>
                        </div>
                        <h4 className="text-lg font-semibold text-primary mb-1">Nenhuma aplicação encontrada</h4>
                        <p className="text-sm text-[var(--text-primary)]">
                          Tente ajustar os filtros ou termo de busca
                        </p>
                      </div>
                    ) : (
                      getFilteredApps().map((app, index) => {
                        const isInGroupPolicy = groupPolicyApps.includes(app.packageName)
                        const isIndividuallySelected = isAppAllowed(app.packageName)
                        return (
                        <div key={app.packageName} className={`card p-4 hover:shadow-lg transition-all duration-200 ${
                          isIndividuallySelected ? 'ring-2 ring-[var(--primary)] bg-[var(--primary)]/10' :
                          'hover:bg-[var(--surface-elevated)]'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <input
                                type="checkbox"
                                checked={isIndividuallySelected}
                                onChange={() => handleAppToggle(app.packageName)}
                                className="w-4 h-4 text-primary border-[var(--border)] rounded focus:ring-primary"
                                disabled={isInGroupPolicy}
                                title={isInGroupPolicy ? 'Este app já está sendo exibido por política de grupo' : ''}
                              />
                              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center overflow-hidden shadow-md">
                                {app.iconBase64 ? (
                                  <img 
                                    src={`data:image/png;base64,${app.iconBase64}`} 
                                    alt={app.appName}
                                    className="w-full h-full object-cover rounded-lg"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none'
                                      e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                    }}
                                  />
                                ) : null}
                                <div className={`w-full h-full flex items-center justify-center ${app.iconBase64 ? 'hidden' : ''}`}>
                                  <span className="text-white text-xl font-bold">
                                    {app.appName?.charAt(0)?.toUpperCase() || '📱'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-primary text-lg">{app.appName || 'Nome não disponível'}</h4>
                                </div>
                                <p className="text-sm text-[var(--text-secondary)] font-mono">{app.packageName || 'Package não disponível'}</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className="text-xs bg-[var(--surface-elevated)] text-[var(--text-secondary)] px-2 py-1 rounded">v{app.versionName || 'N/A'}</span>
                                  {app.isSystemApp && (
                                    <span className="text-xs bg-orange-500/150/20 text-orange-600 px-2 py-1 rounded">Sistema</span>
                                  )}
                                  {app.isEnabled === false && (
                                    <span className="text-xs bg-red-500/150/20 text-red-600 px-2 py-1 rounded">Desabilitado</span>
                                  )}
                                  {isAppAllowed(app.packageName) && (
                                    <span className="text-xs bg-green-500/150/20 text-green-600 px-2 py-1 rounded">Permitido</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button className="btn btn-sm btn-ghost">
                                <span>⚙️</span>
                              </button>
                              <button className="btn btn-sm btn-ghost">
                                <span>📊</span>
                              </button>
                            </div>
                          </div>
                        </div>
                        )
                      })
                    )}
                  </div>

                  {/* Botões de ação */}
                  <div className="flex justify-between items-center pt-4 border-t border-border">
                    <div className="text-sm text-[var(--text-primary)]">
                      {selectedApps.length} de {getFilteredApps().length} aplicações selecionadas
                      {getFilteredApps().length !== (device.installedApps?.length || 0) && (
                        <span className="text-[var(--text-primary)] ml-1">
                          (filtradas de {device.installedApps?.length || 0} total)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-secondary"
                        onClick={() => setSelectedApps([])}
                      >
                        Desmarcar Todas
                      </button>
                      <button 
                        className="btn btn-primary"
                        onClick={handleSavePermissions}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Salvando...' : 'Salvar Permissões'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'map' && (
            <LocationView device={device} sendMessage={sendMessage} />
          )}

          {activeTab === 'reports' && (
            <ReportsTab device={device} isActive={true} />
          )}
        </div>

        {/* Footer - Controles Rápidos */}
        <div className="border-t border-border p-4 bg-[var(--surface-elevated)]">
          <div className="flex flex-wrap gap-3 justify-center max-w-2xl mx-auto">
            <button 
              className="btn btn-warning flex-1 min-w-[140px]"
              onClick={async () => {
                setIsApplyingPolicies(true)
                try {
                  const res = await fetch('/api/devices/apply-policies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: device.deviceId })
                  })
                  const data = await res.json()
                  if (data.success) {
                    showAlert('Políticas aplicadas: bloqueio desativado, Settings bloqueado, Quick Settings restritos (WiFi, Bluetooth, claridade, som, lanterna)')
                  } else {
                    showAlert('Erro: ' + (data.error || 'Não foi possível aplicar'))
                  }
                } catch (e) {
                  showAlert('Erro ao conectar com o servidor')
                } finally {
                  setIsApplyingPolicies(false)
                }
              }}
              disabled={isApplyingPolicies}
              title="Desabilita bloqueio de tela, bloqueia configurações do celular e restringe Quick Settings a WiFi, Bluetooth, claridade, som e lanterna"
            >
              <span>{isApplyingPolicies ? '⏳' : '🔒'}</span>
              {isApplyingPolicies ? 'Aplicando...' : 'Aplicar Políticas'}
            </button>
            <button 
              className="btn btn-primary flex-1"
              onClick={handleOpenMessageModal}
            >
              <span>💬</span>
              Mandar Mensagem
            </button>
            <button 
              className="btn btn-secondary flex-1"
              onClick={handleOpenHistoryModal}
            >
              <span>📋</span>
              Histórico
            </button>
            <button 
              className="btn btn-success flex-1"
              onClick={() => setShowTermsModal(true)}
            >
              <span>📄</span>
              Termos
            </button>
            <button
              className="btn btn-danger flex-1"
              onClick={() => setShowSelectiveWipeConfirm(true)}
              title="Remove apenas dados de aplicações, sem resetar o dispositivo"
            >
              <span>🧹</span>
              Wipe Seletivo
            </button>
            {device.assignedUserId && onUnlinkUser && (
              <button
                className="btn btn-danger flex-1"
                onClick={onUnlinkUser}
              >
                <span>🔓</span>
                Desvincular
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Modal de Mensagem */}
      {showMessageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-surface rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-primary">Enviar Mensagem</h3>
              <button
                onClick={handleCloseMessageModal}
                className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:text-primary transition-colors rounded-lg hover:bg-border-light"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Mensagem para {device.name}
                </label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Digite sua mensagem aqui..."
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                  rows={4}
                  maxLength={500}
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-[var(--text-primary)]">
                    {messageText.length}/500 caracteres
                  </span>
                  <span className="text-xs text-[var(--text-primary)]">
                    {500 - messageText.length} restantes
                  </span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={handleCloseMessageModal}
                  className="btn btn-secondary flex-1"
                  disabled={isSendingMessage}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendMessage}
                  className="btn btn-primary flex-1"
                  disabled={isSendingMessage || !messageText.trim()}
                >
                  {isSendingMessage ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Mensagens */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-surface rounded-xl shadow-xl max-w-2xl w-full h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-primary">Histórico de Mensagens</h3>
              <button
                onClick={handleCloseHistoryModal}
                className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:text-primary transition-colors rounded-lg hover:bg-border-light"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {messageHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📋</span>
                  </div>
                  <h4 className="text-lg font-semibold text-primary mb-2">Nenhuma mensagem enviada</h4>
                  <p className="text-sm text-[var(--text-primary)]">
                    As mensagens enviadas para este dispositivo aparecerão aqui
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messageHistory.map((msg) => (
                    <div key={msg.id} className="card p-4 hover:shadow-lg transition-all duration-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">💬</span>
                          <span className="text-sm font-medium text-primary">
                            {msg.deviceName}
                          </span>
                        </div>
                        <span className="text-xs text-[var(--text-primary)]">
                          {formatMessageTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      <div className="bg-[var(--surface-elevated)] rounded-lg p-3">
                        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                          {msg.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-primary)]">
                  {messageHistory.length} mensagem{messageHistory.length !== 1 ? 's' : ''} enviada{messageHistory.length !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-3">
                  {messageHistory.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      className="btn btn-danger"
                    >
                      <span>🗑️</span>
                      Limpar Histórico
                    </button>
                  )}
                  <button
                    onClick={handleCloseHistoryModal}
                    className="btn btn-primary"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Termos */}
      {showTermsModal && (
        <TermsModal
          isOpen={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          device={device}
          assignedUser={assignedUser ? {
            name: assignedUser.name || '',
            cpf: assignedUser.cpf || ''
          } : null}
        />
      )}

      {/* Modal de Confirmação - Wipe Seletivo */}
      {showSelectiveWipeConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-surface rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-red-500">Wipe Seletivo</h3>
              <button
                onClick={() => setShowSelectiveWipeConfirm(false)}
                className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:text-primary transition-colors rounded-lg hover:bg-border-light"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-red-500/150/150/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-sm text-red-400">
                  <strong>Atenção:</strong> Esta ação irá remover todos os dados de aplicações do dispositivo <strong>{device.name}</strong>.
                </p>
                <p className="text-sm text-red-400/80 mt-2">
                  Diferente do Factory Reset, o Wipe Seletivo remove apenas os dados de apps sem restaurar o dispositivo para configurações de fábrica.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSelectiveWipeConfirm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSelectiveWipe}
                  className="btn btn-danger flex-1"
                >
                  Confirmar Wipe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}