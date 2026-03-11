'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import DeviceCard from './components/DeviceCard'
import DeviceModal from './components/DeviceModal'
import SupportMessagesModal from './components/SupportMessagesModal'
import UpdateAppModal from './components/UpdateAppModal'
import BulkUpdateModal from './components/BulkUpdateModal'
import UserSelectionModal from './components/UserSelectionModal'
import UserConflictModal from './components/UserConflictModal'
import ConfigModal from './components/ConfigModal'
import ConfirmModal from './components/ConfirmModal'
import PoliciesPage from './policies/page'
import UEMPage from './uem/page'
import AllowedAppsPage from './components/AllowedAppsPage'
import AlertsPage from './components/AlertsPage'
import ScheduledCommandsPage from './components/ScheduledCommandsPage'
import CompliancePage from './components/CompliancePage'
import { Device, AppInfo } from './types/device'
import { usePersistence } from './lib/persistence'
import { showAlert, showConfirm } from './lib/dialog'
import { playNotificationSound } from './lib/notification-sound'

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
  const [deviceModalInitialTab, setDeviceModalInitialTab] = useState<string>('overview')
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)
  const [supportDevice, setSupportDevice] = useState<Device | null>(null)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateDevice, setUpdateDevice] = useState<Device | null>(null)
  const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false)
  const [isUserSelectionModalOpen, setIsUserSelectionModalOpen] = useState(false)
  const [deviceForUserAssignment, setDeviceForUserAssignment] = useState<Device | null>(null)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [usersCount, setUsersCount] = useState(0)
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [isAddingDevice, setIsAddingDevice] = useState(false)
  const [isSearchingDevices, setIsSearchingDevices] = useState(false)
  const [justAddedDevice, setJustAddedDevice] = useState(false)
  const [showBackupConfirm, setShowBackupConfirm] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false)
  const [showFormatConfirm, setShowFormatConfirm] = useState(false)
  const [isFormattingDevice, setIsFormattingDevice] = useState(false)
  const [showSetPasswordConfirm, setShowSetPasswordConfirm] = useState(false)
  const [alarmError, setAlarmError] = useState<{ deviceId: string } | null>(null)
  const [updateProgress, setUpdateProgress] = useState<{ deviceId: string; deviceName: string; progress: number; status: string; startTime: number; startProgress: number } | null>(null)
  const updateAlertShownRef = useRef(false)
  const [settingsWsUrl, setSettingsWsUrl] = useState('ws://localhost:3001')
  const [settingsHeartbeat, setSettingsHeartbeat] = useState('30')
  const [settingsAutoUpdate, setSettingsAutoUpdate] = useState(true)
  const [settingsLocationTracking, setSettingsLocationTracking] = useState(true)
  const settingsLoadedRef = useRef(false)
  
  // Carregar contagem de usuários
  useEffect(() => {
    const loadUsersCount = async () => {
      try {
        const response = await fetch('/api/device-users?active=true')
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const result = await response.json()
        if (result.success) {
          // Contar usuários na lista retornada
          const usersList = result.users || result.data || []
          setUsersCount(usersList.length)
        }
      } catch (e) {
        console.error('Erro ao carregar contagem de usuários:', e)
      }
    }
    loadUsersCount()
  }, [isConfigModalOpen])
  
  // Debug: Monitorar mudanças no estado devices
  useEffect(() => {
    console.log('🔄 Estado devices alterado:', devices.map(d => ({ id: d.deviceId, name: d.name })))
  }, [devices])
  const [supportNotifications, setSupportNotifications] = useState<any[]>([])
  const [unreadSupportCount, setUnreadSupportCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [reconnectTrigger, setReconnectTrigger] = useState(0)
  useEffect(() => { wsRef.current = ws }, [ws])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentView, setCurrentView] = useState('dashboard')
  const [showPassword, setShowPassword] = useState<boolean>(false)


  // Solicitar permissão de notificação
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Carregar configurações salvas ao abrir a tela de configurações
  useEffect(() => {
    if (currentView === 'settings' && !settingsLoadedRef.current) {
      try {
        const saved = localStorage.getItem('mdm_settings')
        if (saved) {
          const s = JSON.parse(saved)
          if (s.wsUrl) setSettingsWsUrl(s.wsUrl)
          if (s.heartbeatInterval != null) setSettingsHeartbeat(String(s.heartbeatInterval))
          if (s.autoUpdateStatus != null) setSettingsAutoUpdate(s.autoUpdateStatus)
          if (s.locationTracking != null) setSettingsLocationTracking(s.locationTracking)
        }
        settingsLoadedRef.current = true
      } catch (_) {}
    }
    if (currentView !== 'settings') settingsLoadedRef.current = false
  }, [currentView])

  // WebSocket connection
  useEffect(() => {
    let websocket: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let isMounted = true

    const resolveWsUrl = async (): Promise<string> => {
      try {
        const saved = localStorage.getItem('mdm_settings')
        if (saved) {
          const s = JSON.parse(saved)
          if (s?.wsUrl && typeof s.wsUrl === 'string' && s.wsUrl.startsWith('ws')) {
            let url = s.wsUrl
            if (url.includes(':3002')) {
              url = url.replace(':3002', ':3001')
              try {
                const updated = { ...s, wsUrl: url }
                localStorage.setItem('mdm_settings', JSON.stringify(updated))
              } catch (_) {}
            }
            return url
          }
        }
      } catch (_) {}
      const hostname = window.location.hostname
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'ws://localhost:3001'
      }
      // Acessando de outra rede – buscar URL do servidor (celular e PC em redes diferentes)
      try {
        const res = await fetch('/api/websocket-url')
        const data = await res.json()
        if (data.success && data.url) {
          console.log('📡 URL do WebSocket obtida do servidor:', data.url)
          return data.url
        }
      } catch (e) {
        console.warn('Não foi possível obter URL do servidor, usando hostname:', e)
      }
      return `ws://${hostname}:3001`
    }

    const connectWebSocket = async () => {
      // Evitar múltiplas conexões
      if (websocket && (websocket.readyState === WebSocket.CONNECTING || websocket.readyState === WebSocket.OPEN)) {
        return
      }

      try {
        const wsUrl = await resolveWsUrl()
        if (!isMounted) return
        console.log('🔌 Conectando ao WebSocket:', wsUrl)
        
        websocket = new WebSocket(wsUrl)
        
        websocket.onopen = () => {
          if (!isMounted) {
            websocket?.close()
            return
          }
          console.log('✅ WebSocket conectado para UEM')
          setIsConnected(true)
          setWs(websocket)
          
          // Send web client identification
          websocket.send(JSON.stringify({
            type: 'web_client',
            timestamp: Date.now()
          }))
          
          // Solicitar lista 1x imediato + 1 fallback em 3s (evitar múltiplos re-renders que piscam a tela)
          const requestList = () => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              websocket.send(JSON.stringify({ type: 'request_devices_list', timestamp: Date.now() }))
            }
          }
          requestList()
          setTimeout(requestList, 3000)
          
          // Aguardar um pouco antes de solicitar a senha
          setTimeout(() => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
            // Solicitar senha de administrador atual
            websocket.send(JSON.stringify({
              type: 'get_admin_password',
              timestamp: Date.now()
            }))
            }
          }, 500)
        }

        websocket.onmessage = (event) => {
          if (!isMounted) return
          try {
            const message = JSON.parse(event.data)
            handleWebSocketMessage(message)
          } catch (error) {
            console.error('Erro ao processar mensagem WebSocket:', error)
          }
        }

        websocket.onclose = (event) => {
          if (!isMounted) return
          console.log('WebSocket desconectado', event.code, event.reason)
          setIsConnected(false)
          setWs(null)
          
          // Limpar timeout anterior se existir
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout)
          }
          
          // Tentar reconectar após 3 segundos apenas se não foi fechado intencionalmente
          if (event.code !== 1000 && isMounted) {
            reconnectTimeout = setTimeout(() => {
              if (isMounted) {
                connectWebSocket()
              }
            }, 3000)
          }
        }

        websocket.onerror = (error) => {
          if (!isMounted) return
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
      isMounted = false
      
      // Limpar timeout de reconexão
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      
      // Fechar WebSocket se estiver aberto
      if (websocket) {
        // Remover listeners para evitar chamadas após desmontagem
        websocket.onopen = null
        websocket.onmessage = null
        websocket.onerror = null
        websocket.onclose = null
        
        // Fechar conexão
        if (websocket.readyState === WebSocket.CONNECTING || websocket.readyState === WebSocket.OPEN) {
          websocket.close(1000, 'Component unmounting')
      }
        websocket = null
      }
      
      setWs(null)
      setIsConnected(false)
    }
  }, [reconnectTrigger])

  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'devices_list':
        console.log('Lista de dispositivos recebida:', message.devices)
        const newDevices = message.devices || []
        
        // Filtrar apenas dispositivos móveis (Android) - excluir computadores
        const mobileDevices = newDevices.filter((d: Device) => 
          d.deviceType !== 'computer' && 
          d.osType !== 'Windows' && 
          d.osType !== 'Linux' && 
          d.osType !== 'macOS'
        )
        
        // Debug: verificar dados específicos
        if (mobileDevices.length > 0) {
          const firstDevice = mobileDevices[0]
          console.log('Primeiro dispositivo da lista:', {
            deviceId: firstDevice.deviceId,
            name: firstDevice.name,
            batteryLevel: firstDevice.batteryLevel,
            installedAppsCount: firstDevice.installedAppsCount,
            allowedAppsCount: firstDevice.allowedApps?.length || 0,
            storageTotal: firstDevice.storageTotal,
            storageUsed: firstDevice.storageUsed
          })
        }
        
        syncWithServer(mobileDevices, message.adminPassword)
        break
      case 'devices_status':
        console.log('Status dos dispositivos atualizado:', message.devices)
        const updatedDevices = message.devices || []
        
        // Filtrar apenas dispositivos móveis (Android) - excluir computadores
        const mobileUpdatedDevices = updatedDevices.filter((d: Device) => 
          d.deviceType !== 'computer' && 
          d.osType !== 'Windows' && 
          d.osType !== 'Linux' && 
          d.osType !== 'macOS'
        )
        
        // Debug: verificar dados específicos
        if (mobileUpdatedDevices.length > 0) {
          const firstDevice = mobileUpdatedDevices[0]
          console.log('Primeiro dispositivo do status:', {
            deviceId: firstDevice.deviceId,
            name: firstDevice.name,
            batteryLevel: firstDevice.batteryLevel,
            installedAppsCount: firstDevice.installedAppsCount,
            allowedAppsCount: firstDevice.allowedApps?.length || 0,
            storageTotal: firstDevice.storageTotal,
            storageUsed: firstDevice.storageUsed
          })
        }
        
        syncWithServer(mobileUpdatedDevices)
        break
      case 'device_status':
        console.log('Status do dispositivo atualizado:', message.device)
        
        // Ignorar computadores - apenas processar dispositivos móveis
        if (message.device && (
          message.device.deviceType === 'computer' ||
          message.device.osType === 'Windows' ||
          message.device.osType === 'Linux' ||
          message.device.osType === 'macOS'
        )) {
          console.log('💻 Computador ignorado na página de dispositivos:', message.device.deviceId)
          break
        }
        
        // Debug: verificar dados específicos
        if (message.device) {
          console.log('Dados do dispositivo status recebidos:', {
            deviceId: message.device.deviceId,
            name: message.device.name,
            batteryLevel: message.device.batteryLevel,
            installedAppsCount: message.device.installedAppsCount,
            allowedAppsCount: message.device.allowedApps?.length || 0,
            storageTotal: message.device.storageTotal,
            storageUsed: message.device.storageUsed
          })
        }
        
        updateDevices(prevDevices => {
          const existingIndex = prevDevices.findIndex(d => d.deviceId === message.device.deviceId)
          if (existingIndex >= 0) {
            const updated = [...prevDevices]
            const oldDevice = updated[existingIndex]
            updated[existingIndex] = { ...updated[existingIndex], ...message.device }
            
            // Log para verificar se o nome mudou
            if (oldDevice.name !== message.device.name) {
              console.log('📝 Nome do dispositivo mudou no status:', {
                deviceId: message.device.deviceId,
                oldName: oldDevice.name,
                newName: message.device.name
              })
            }
            
            console.log('Dispositivo status atualizado:', updated[existingIndex])
            return updated
          } else {
            console.log('Novo dispositivo status adicionado:', message.device)
            return [...prevDevices, message.device]
          }
        })
        break
      case 'device_connected':
        console.log('🔌 === MENSAGEM DEVICE_CONNECTED RECEBIDA ===')
        
        // Ignorar computadores - apenas processar dispositivos móveis
        if (message.device && (
          message.device.deviceType === 'computer' ||
          message.device.osType === 'Windows' ||
          message.device.osType === 'Linux' ||
          message.device.osType === 'macOS'
        )) {
          console.log('💻 Computador ignorado na página de dispositivos:', message.device.deviceId)
          break
        }
        
        // Debug: verificar dados específicos
        if (message.device) {
          console.log('   Dados do dispositivo:', {
            deviceId: message.device.deviceId,
            name: message.device.name,
            batteryLevel: message.device.batteryLevel,
            installedAppsCount: message.device.installedAppsCount,
            allowedAppsCount: message.device.allowedApps?.length || 0,
            storageTotal: message.device.storageTotal,
            storageUsed: message.device.storageUsed
          })
        }
        console.log('================================================')
        
        updateDevices(prevDevices => {
          const existingIndex = prevDevices.findIndex(d => d.deviceId === message.device.deviceId)
          if (existingIndex >= 0) {
            const updated = [...prevDevices]
            const oldDevice = updated[existingIndex]
            updated[existingIndex] = { ...updated[existingIndex], ...message.device }
            
            // Log para verificar se o nome mudou
            if (oldDevice.name !== message.device.name) {
              console.log('📝 NOME MUDOU NO DEVICE_CONNECTED!', {
                deviceId: message.device.deviceId,
                oldName: oldDevice.name,
                newName: message.device.name
              })
            }
            
            console.log('✅ Dispositivo conectado atualizado:', {
              deviceId: updated[existingIndex].deviceId,
              name: updated[existingIndex].name
            })
            return updated
          } else {
            console.log('🆕 Novo dispositivo conectado adicionado:', message.device)
            return [...prevDevices, message.device]
          }
        })
        break
      case 'device_deleted':
        // Remover dispositivo da lista (vínculo já foi removido no banco pelo servidor)
        console.log(`🗑️ Dispositivo ${message.deviceId} deletado - vínculo de usuário removido`)
        updateDevices(prevDevices => 
          prevDevices.filter(device => device.deviceId !== message.deviceId)
        )
        break
      case 'delete_device_response':
        // Tratar resposta de deleção
        if (message.success) {
          console.log(`✅ Dispositivo ${message.deviceId} deletado com sucesso`)
          // O dispositivo já foi removido da lista pela mensagem device_deleted
          // Mas se por algum motivo não foi, remover agora
          updateDevices(prevDevices => 
            prevDevices.filter(device => device.deviceId !== message.deviceId)
          )
        } else {
          console.error(`❌ Erro ao deletar dispositivo:`, message.error)
          showAlert(`❌ Erro ao deletar dispositivo: ${message.error}`)
        }
        break
      case 'device_disconnected':
        console.log('Dispositivo desconectado:', message.deviceId, message.reason)
        updateDevices(prevDevices => 
          prevDevices.map(device => {
            if (device.deviceId === message.deviceId) {
              return { 
                ...device, 
                status: 'offline',
                lastSeen: message.timestamp || Date.now()
              }
            }
            return device
          })
        )
        break
      case 'device_status_update':
        console.log('Status do dispositivo atualizado:', message.deviceId, message.status, message.reason)
        updateDevices(prevDevices => 
          prevDevices.map(device => {
            if (device.deviceId === message.deviceId) {
              return { 
                ...device, 
                status: message.status,
                lastSeen: message.lastSeen || Date.now()
              }
            }
            return device
          })
        )
        break
      case 'app_usage_update':
      case 'app_usage_updated':
        console.log('📊 === DADOS DE USO DO APP ATUALIZADOS ===')
        console.log('📊 Mensagem recebida:', message)
        console.log('📊 DeviceId:', message.deviceId)
        console.log('📊 UsageData:', message.usageData)
        console.log('📊 Accessed Apps:', message.usageData?.accessed_apps)
        console.log('📊 === FIM PROCESSAMENTO FRONTEND ===')
        
        updateDevices(prevDevices => {
          const existingIndex = prevDevices.findIndex(d => d.deviceId === message.deviceId)
          if (existingIndex >= 0) {
            const updated = [...prevDevices]
            updated[existingIndex] = { 
              ...updated[existingIndex], 
              appUsageData: message.usageData,
              lastUsageUpdate: message.timestamp
            }
            console.log('✅ Dispositivo atualizado com dados de uso:', {
              deviceId: updated[existingIndex].deviceId,
              name: updated[existingIndex].name,
              appUsageData: updated[existingIndex].appUsageData,
              accessedAppsCount: updated[existingIndex].appUsageData?.accessed_apps?.length || 0
            })
            return updated
          }
          console.log('⚠️ Dispositivo não encontrado para atualização de uso:', message.deviceId)
          return prevDevices
        })
        break
      case 'device_name_changed':
        console.log('📝 === MENSAGEM DEVICE_NAME_CHANGED RECEBIDA ===')
        console.log('   DeviceId:', message.deviceId)
        console.log('   Nome anterior:', message.oldName)
        console.log('   Nome novo:', message.newName)
        console.log('   Tem device completo?', !!message.device)
        if (message.device) {
          console.log('   Nome no device completo:', message.device.name)
        }
        console.log('================================================')
        
        updateDevices(prevDevices => {
          const updated = prevDevices.map(device => {
            if (device.deviceId === message.deviceId) {
              const updatedDevice = { 
                ...device, 
                ...message.device  // Atualizar com todos os dados novos
              }
              console.log('✅ Dispositivo atualizado na lista:', {
                deviceId: updatedDevice.deviceId,
                oldName: device.name,
                newName: updatedDevice.name
              })
              return updatedDevice
            }
            return device
          })
          
          console.log('📋 Lista de dispositivos após atualização:', updated.map(d => ({ id: d.deviceId, name: d.name })))
          return updated
        })
        
        // Mostrar notificação de sucesso
        if (message.newName && message.oldName !== message.newName) {
          console.log(`✅ Nome do dispositivo atualizado com sucesso: "${message.oldName}" → "${message.newName}"`)
        }
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
                isLocationEnabled: true,
                ...(message.location.address != null && { address: message.location.address })
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
          // Dispositivo que enviou está conectado - buscar lista atualizada para exibir na tela
          const w = wsRef.current
          if (w && w.readyState === WebSocket.OPEN) {
            w.send(JSON.stringify({ type: 'request_devices_list', timestamp: Date.now() }))
          }
          fetch('/api/devices')
            .then(res => res.json())
            .then(json => {
              if (json.success && Array.isArray(json.data)) {
                const mobile = json.data.filter((d: any) =>
                  d.deviceType !== 'computer' && d.osType !== 'Windows' && d.osType !== 'Linux' && d.osType !== 'macOS'
                )
                const formatted = mobile.map((d: any) => ({
                  ...d,
                  lastSeen: typeof d.lastSeen === 'string' ? new Date(d.lastSeen).getTime() : (d.lastSeen || Date.now()),
                  status: d.status || 'offline'
                }))
                syncWithServer(formatted)
              }
            })
            .catch(() => {})
        }
        break
      case 'user_conflict_warning':
        // ✅ Tratar aviso de conflito de usuário do WebSocket
        console.log('⚠️ Aviso de conflito de usuário recebido:', message.conflict)
        if (message.conflict) {
          setConflictInfo({
            ...message.conflict,
            currentDeviceName: message.deviceName
          })
          setIsConflictModalOpen(true)
          
          // Atualizar dispositivos que tiveram vínculo removido
          updateDevices((prevDevices: Device[]) => 
            prevDevices.map(d => {
              if (message.conflict.otherDevices.some((other: any) => other.deviceId === d.deviceId)) {
                return {
                  ...d,
                  assignedDeviceUserId: null,
                  assignedUserId: null,
                  assignedUserName: null
                }
              }
              return d
            })
          )
        }
        break
      case 'computer_status_update':
        // Mensagens de atualização de computadores são tratadas em /uem/page.tsx
        // Ignorar silenciosamente aqui
        break
      case 'lock_device_result':
        if (message.success) {
          showAlert('✅ ' + (message.message || 'Comando de travar enviado ao dispositivo'))
        } else {
          showAlert('❌ ' + (message.message || 'Falha ao enviar comando. Verifique se o dispositivo está online.'))
        }
        break
      case 'reboot_device_result':
        if (message.success) {
          showAlert('✅ ' + (message.message || 'Dispositivo reiniciando...'))
        } else {
          showAlert('❌ ' + (message.message || 'Falha ao reiniciar. Verifique se o dispositivo está online e é Device Owner.'))
        }
        break
      case 'wake_device_result':
        if (message.success) {
          // Confirmação silenciosa - tela acordada
        } else {
          showAlert('❌ ' + (message.message || 'Falha ao acordar. Verifique se o dispositivo está online.'))
        }
        break
      case 'alarm_device_result':
        if (message.success) {
          if (message.action === 'start') {
            // Alarme iniciou no dispositivo - confirmação silenciosa (usuário já viu "Alarme iniciado")
          } else {
            // Alarme parou no dispositivo
          }
        } else {
          showAlert('❌ ' + (message.message || 'Falha no alarme. Verifique se o dispositivo está online e na mesma rede.'))
          setAlarmError({ deviceId: message.deviceId })
        }
        break
      case 'update_app_progress':
        setUpdateProgress(prev => {
          const device = devices.find(d => d.deviceId === message.deviceId)
          const deviceName = device?.name || message.deviceId
          if (prev?.deviceId === message.deviceId) {
            return { ...prev, progress: message.progress ?? 0, status: message.status || prev.status }
          }
          // Primeiro progresso recebido - criar estado se ainda não existe
          if (!prev) {
            const p = message.progress ?? 0
            return { deviceId: message.deviceId, deviceName, progress: p, status: message.status || 'Atualizando...', startTime: Date.now(), startProgress: p }
          }
          return prev
        })
        break
      case 'update_app_complete':
        setUpdateProgress(prev => {
          if (prev?.deviceId === message.deviceId && !updateAlertShownRef.current) {
            updateAlertShownRef.current = true
            const name = prev.deviceName
            setTimeout(() => {
              showAlert(`✅ Atualização concluída com sucesso! O dispositivo ${name} foi atualizado.`)
              syncWithServer()
              updateAlertShownRef.current = false
            }, 300)
            return null
          }
          return prev
        })
        break
      case 'update_app_error':
        setUpdateProgress(prev => {
          if (prev?.deviceId === message.deviceId && !updateAlertShownRef.current) {
            updateAlertShownRef.current = true
            const name = prev.deviceName
            const err = message.error || 'Erro desconhecido'
            setTimeout(() => {
              showAlert(`❌ Erro na atualização do dispositivo ${name}:\n${err}`)
              updateAlertShownRef.current = false
            }, 300)
            return null
          }
          return prev
        })
        break
      default:
        // Ignorar mensagens desconhecidas silenciosamente (evitar spam de logs)
        // console.log('Mensagem WebSocket não reconhecida:', message)
        break
    }
  }, [updateDevices, updateAdminPassword, syncWithServer, devices])

  const sendMessage = useCallback(async (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
      return true
    }
    const deviceId = message.deviceId
    if (deviceId && (message.type === 'lock_device' || message.type === 'unlock_device')) {
      try {
        const action = message.type === 'lock_device' ? 'lock' : 'unlock'
        const res = await fetch(`/api/devices/${deviceId}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId })
        })
        const data = await res.json().catch(() => ({}))
        return !!data.success
      } catch (e) {
        console.error('Erro no fallback HTTP:', e)
        return false
      }
    }
    if (deviceId && (message.type === 'wake_device' || message.type === 'reboot_device')) {
      try {
        const action = message.type === 'wake_device' ? 'wake-device' : 'reboot'
        const res = await fetch(`/api/devices/${deviceId}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId })
        })
        const data = await res.json().catch(() => ({}))
        return !!data.success
      } catch (e) {
        console.error('Erro no fallback HTTP ligar/desligar:', e)
        return false
      }
    }
    console.warn('WebSocket não conectado')
    return false
  }, [ws])

  const handleDeviceClick = (device: Device) => {
    // Se já tem usuário vinculado, abrir direto o modal do dispositivo
    if (device.assignedUserId) {
      setSelectedDevice(device)
      setDeviceModalInitialTab('overview')
      setIsModalOpen(true)
    } else {
      // Se não tem usuário, abrir modal de seleção de usuário
      setDeviceForUserAssignment(device)
      setIsUserSelectionModalOpen(true)
    }
  }
  
  const handleUserSelected = async (userUuid: string, userId: string, userName: string) => {
    if (!deviceForUserAssignment) return
    
    console.log('🔗 === VINCULANDO USUÁRIO ===')
    console.log('Dispositivo:', deviceForUserAssignment.deviceId, '-', deviceForUserAssignment.name)
    console.log('Usuário UUID:', userUuid)
    console.log('Usuário ID:', userId)
    console.log('Usuário Nome:', userName)
    
    try {
      // Vincular via API
      const response = await fetch('/api/devices/assign-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: deviceForUserAssignment.deviceId,
          deviceUserId: userUuid || null
        })
      })

      const result = await response.json()

      // ✅ TRATAR ERRO DE CONFLITO (409 - Usuário já vinculado)
      if (!result.success && result.conflict && response.status === 409) {
        console.log('⚠️ Conflito detectado - vinculação IMPEDIDA:', result.conflict)
        setConflictInfo({
          ...result.conflict,
          currentDeviceName: deviceForUserAssignment.name
        })
        setIsConflictModalOpen(true)
        // Não atualizar dispositivos - a vinculação foi bloqueada
        return
      }

      if (result.success) {
        console.log('✅ Vínculo salvo no banco de dados com sucesso!')
        
        // Atualização normal (sem conflito)
        const updatedDevices = devices.map(d => 
          d.deviceId === deviceForUserAssignment.deviceId
            ? { 
                ...d, 
                assignedDeviceUserId: userUuid || null,
                assignedUserId: userId || null, 
                assignedUserName: userName || null 
              }
            : d
        )
        
        updateDevices(updatedDevices)
        
        const finalDevice = updatedDevices.find(d => d.deviceId === deviceForUserAssignment.deviceId)
        if (finalDevice) {
          setSelectedDevice(finalDevice)
          setDeviceModalInitialTab('overview')
          setIsModalOpen(true)
        }
      } else {
        // Outros erros (não relacionados a conflito)
        showAlert('❌ Erro ao vincular usuário: ' + (result.message || result.error))
      }
    } catch (error) {
      console.error('❌ Erro ao vincular usuário:', error)
      showAlert('❌ Erro ao conectar com o servidor')
    } finally {
      setIsUserSelectionModalOpen(false)
      setDeviceForUserAssignment(null)
    }
  }

  const handleUnlinkUser = async () => {
    if (!selectedDevice) return
    
    console.log('🔓 === DESVINCULANDO USUÁRIO ===')
    console.log('Dispositivo:', selectedDevice.deviceId, '-', selectedDevice.name)
    console.log('Usuário atual:', {
      assignedDeviceUserId: selectedDevice.assignedDeviceUserId,
      assignedUserId: selectedDevice.assignedUserId,
      assignedUserName: selectedDevice.assignedUserName
    })
    
    if (await showConfirm(`Desvincular usuário de ${selectedDevice.name}?`)) {
      try {
        // Desvincular via API
        const response = await fetch('/api/devices/assign-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: selectedDevice.deviceId,
            deviceUserId: null
          })
        })

        const result = await response.json()

        if (result.success) {
          console.log('✅ Usuário desvinculado no banco de dados com sucesso!')
          
          // Atualizar dispositivo localmente
          const updatedDevices = devices.map(d => 
            d.deviceId === selectedDevice.deviceId
              ? { ...d, assignedDeviceUserId: null, assignedUserId: null, assignedUserName: null }
              : d
          )
          
          console.log('📝 Dispositivo atualizado localmente - vínculo removido')
          
          updateDevices(updatedDevices)
          
          // Atualizar o dispositivo selecionado no modal
          const updatedDevice = updatedDevices.find(d => d.deviceId === selectedDevice.deviceId)
          if (updatedDevice) {
            setSelectedDevice(updatedDevice)
          }
        } else {
          showAlert('❌ Erro ao desvincular usuário: ' + result.error)
        }
      } catch (error) {
        console.error('❌ Erro ao desvincular usuário:', error)
        showAlert('❌ Erro ao conectar com o servidor')
      }
    }
  }

  const handleSaveConfig = (users: Array<{ id: string; name: string; cpf: string }>) => {
    // Atualizar contagem de usuários
    setUsersCount(users.length)
    console.log('✅ Usuários salvos no banco:', users.length)
  }

  const handleBackup = async () => {
    setShowBackupConfirm(false)
    try {
      const res = await fetch('/api/config/backup')
      if (!res.ok) throw new Error('Falha ao gerar backup')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mdm-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showAlert('✅ Backup baixado com sucesso!')
    } catch (e) {
      console.error('Erro no backup:', e)
      showAlert('❌ Erro ao gerar backup. Verifique se o servidor está conectado ao banco.')
    }
  }

  const handleRestart = async () => {
    if (isRestarting) return
    setIsRestarting(true)
    setShowRestartConfirm(false)
    try {
      const wsHost = typeof window !== 'undefined' ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'localhost' : window.location.hostname) : 'localhost'
      const res = await fetch(`http://${wsHost}:3001/api/server/restart`, { method: 'POST' })
      if (res.ok) {
        showAlert('✅ Reinício solicitado. O servidor irá reconectar em alguns segundos.')
      } else {
        throw new Error('Falha ao reiniciar')
      }
    } catch (e) {
      console.error('Erro ao reiniciar:', e)
      showAlert('❌ Erro ao reiniciar o servidor. Verifique se o servidor WebSocket está rodando na porta 3001.')
    } finally {
      setIsRestarting(false)
    }
  }

  const handleFormatDevice = async () => {
    setShowFormatConfirm(false)
    setIsFormattingDevice(true)
    try {
      const res = await fetch('/api/devices/format-device', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        showAlert('✅ ' + (data.message || 'Celular reiniciando no modo recovery. Use as teclas de volume para navegar e Power para confirmar. Selecione "Wipe data/factory reset".'))
      } else {
        showAlert('❌ ' + (data.error || 'Falha ao formatar'))
      }
    } catch (e) {
      showAlert('❌ Erro: ' + (e instanceof Error ? e.message : 'Falha ao conectar'))
    } finally {
      setIsFormattingDevice(false)
    }
  }

  const handleClearCache = async () => {
    setShowClearCacheConfirm(false)
    try {
      const wsHost = typeof window !== 'undefined' ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'localhost' : window.location.hostname) : 'localhost'
      const res = await fetch(`http://${wsHost}:3001/api/server/clear-cache`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        showAlert('✅ Cache limpo com sucesso!')
      } else {
        throw new Error(data.error || 'Falha ao limpar cache')
      }
    } catch (e) {
      console.error('Erro ao limpar cache:', e)
      showAlert('❌ Erro ao limpar o cache. Verifique se o servidor WebSocket está rodando na porta 3001.')
    }
  }

  const handleSaveSettings = () => {
    try {
      const settings = {
        wsUrl: settingsWsUrl,
        heartbeatInterval: parseInt(settingsHeartbeat, 10) || 30,
        autoUpdateStatus: settingsAutoUpdate,
        locationTracking: settingsLocationTracking
      }
      localStorage.setItem('mdm_settings', JSON.stringify(settings))
    } catch (e) {
      console.error('Erro ao salvar configurações:', e)
    }
  }

  /** Polling para buscar dispositivos após add-device (WebSocket + API como fallback) */
  const pollForDevicesAfterAdd = useCallback(() => {
    setIsSearchingDevices(true)
    const requestViaWs = () => {
      const w = wsRef.current
      if (w && w.readyState === WebSocket.OPEN) {
        w.send(JSON.stringify({ type: 'request_devices_list', timestamp: Date.now() }))
      }
    }
    const requestViaApi = async () => {
      try {
        const res = await fetch('/api/devices')
        const json = await res.json()
        const mobile = (json.success && Array.isArray(json.data) ? json.data : []).filter((d: any) =>
          d.deviceType !== 'computer' && d.osType !== 'Windows' && d.osType !== 'Linux' && d.osType !== 'macOS'
        )
        const formatted = mobile.map((d: any) => ({
          ...d,
          lastSeen: typeof d.lastSeen === 'string' ? new Date(d.lastSeen).getTime() : (d.lastSeen || Date.now()),
          status: d.status || 'offline'
        }))
        syncWithServer(formatted)
      } catch (_) {}
    }
    requestViaWs()
    requestViaApi()
    // Polling mais agressivo: 1s, 2s, 3s... até 15s, depois a cada 2s até 40s
    ;[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40].forEach(s => {
      setTimeout(() => { requestViaWs(); requestViaApi() }, s * 1000)
    })
    setTimeout(() => setIsSearchingDevices(false), 3000)
  }, [syncWithServer])

  const handleAddDevice = useCallback(async () => {
    setIsAddingDevice(true)
    try {
      const res = await fetch('/api/devices/add-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wmsVariant: 'pedidos' })
      })
      const data = await res.json()
      if (data.success) {
        setJustAddedDevice(true)
        setTimeout(() => setJustAddedDevice(false), 45000)
        showAlert('✅ Dispositivo configurado! Aguarde até 40 segundos – o celular aparecerá automaticamente.')
        pollForDevicesAfterAdd()
      } else {
        showAlert('❌ Erro: ' + (data.error || 'Falha ao configurar'))
      }
    } catch (e) {
      showAlert('❌ Erro: ' + (e instanceof Error ? e.message : 'Falha ao conectar'))
    } finally {
      setIsAddingDevice(false)
    }
  }, [pollForDevicesAfterAdd])

  const handleApplySettings = () => {
    try {
      const settings = {
        wsUrl: settingsWsUrl,
        heartbeatInterval: parseInt(settingsHeartbeat, 10) || 30,
        autoUpdateStatus: settingsAutoUpdate,
        locationTracking: settingsLocationTracking
      }
      localStorage.setItem('mdm_settings', JSON.stringify(settings))
      ws?.close(1001, 'Aplicando novas configurações')
    } catch (e) {
      console.error('Erro ao aplicar mudanças:', e)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedDevice(null)
  }

  const handleDeleteDevice = useCallback(async (deviceId: string) => {
    // Validar se deviceId é válido
    if (!deviceId || deviceId === 'null' || deviceId === 'undefined') {
      console.error('❌ DeviceId inválido para deleção:', deviceId)
      showAlert('❌ Erro: ID do dispositivo inválido. Não é possível deletar este dispositivo.')
      return
    }
    console.log('🗑️ Enviando requisição de deleção:', deviceId)

    try {
      // Usar API como método principal (confiável)
      const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
      const result = await response.json()
      if (result.success) {
        updateDevices(prev => prev.filter(d => d.deviceId !== deviceId))
        // Também notificar via WebSocket para outros clientes
        sendMessage({
          type: 'delete_device',
          deviceId: deviceId,
          timestamp: Date.now()
        })
        setIsModalOpen(false)
        setSelectedDevice(null)
        console.log('✅ Dispositivo deletado')
      } else {
        showAlert(`❌ Erro ao deletar: ${result.error || result.detail || 'Erro desconhecido'}`)
      }
    } catch (e) {
      console.error('Erro ao deletar via API:', e)
      showAlert('❌ Erro ao deletar dispositivo. Verifique se o servidor está rodando.')
    }
  }, [sendMessage, updateDevices])

  const handleUpdateApp = useCallback((apkUrl: string, version: string, device?: Device) => {
    const dev = device || updateDevice
    if (!dev) return

    const deviceName = dev.name
    const deviceId = dev.deviceId

    // Mostrar barra de progresso IMEDIATAMENTE ao clicar
    setUpdateProgress({ deviceId, deviceName, progress: 0, status: 'Enviando comando ao dispositivo...', startTime: Date.now(), startProgress: 0 })

    // Fechar modal
    setIsUpdateModalOpen(false)
    setUpdateDevice(null)

    // Sempre usa update-app (não rebuild): a URL já aponta para o APK pronto no servidor
    fetch('/api/devices/update-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceIds: [deviceId], apkUrl, version })
    })
      .then(res => res.json())
      .then(result => {
        if (!result.success) {
          setUpdateProgress(null)
          showAlert(`❌ Erro ao enviar atualização para ${deviceName}:\n${result.error || 'Erro desconhecido'}`)
        } else {
          // Dispositivo enviará progresso via WebSocket
          setUpdateProgress(prev => prev ? { ...prev, status: 'Aguardando resposta do dispositivo...' } : null)
        }
      })
      .catch(err => {
        console.error('Erro ao atualizar app:', err)
        setUpdateProgress(null)
        showAlert(`❌ Erro ao enviar atualização. Verifique se o servidor está rodando na porta 3001.`)
      })
  }, [updateDevice, syncWithServer])

  const handleBulkUpdateMdm = useCallback(async (deviceIds: string[], onProgress?: (progress: any) => void, cancelRef?: React.MutableRefObject<boolean>) => {
    if (!deviceIds || deviceIds.length === 0) return
    try {
      // Etapa 1: Compilando (0-30%)
      if (cancelRef?.current) return
      
      onProgress?.({
        currentDevice: 0,
        totalDevices: deviceIds.length,
        percentage: 5,
        stage: 'compilation',
        message: 'Preparando o build do MDM...'
      })

      await new Promise(resolve => setTimeout(resolve, 1000))
      if (cancelRef?.current) return

      onProgress?.({
        currentDevice: 0,
        totalDevices: deviceIds.length,
        percentage: 15,
        stage: 'compilation',
        message: 'Compilando o APK...'
      })

      await new Promise(resolve => setTimeout(resolve, 2000))
      if (cancelRef?.current) return

      const response = await fetch('/api/devices/bulk-update-mdm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds })
      })
      const result = await response.json()

      if (result.success && !cancelRef?.current) {
        // Etapa 2: Enviando (30-50%)
        onProgress?.({
          currentDevice: 0,
          totalDevices: deviceIds.length,
          percentage: 30,
          stage: 'sending',
          message: 'Enviando para dispositivos via WiFi...'
        })

        await new Promise(resolve => setTimeout(resolve, 1500))
        if (cancelRef?.current) return

        // Etapa 3: Baixando (50-70%)
        onProgress?.({
          currentDevice: 0,
          totalDevices: deviceIds.length,
          percentage: 50,
          stage: 'downloading',
          message: 'Dispositivos baixando atualização...'
        })

        await new Promise(resolve => setTimeout(resolve, 3000))
        if (cancelRef?.current) return

        // Etapa 4: Instalando (70-95%)
        onProgress?.({
          currentDevice: 0,
          totalDevices: deviceIds.length,
          percentage: 75,
          stage: 'installing',
          message: 'Instalando MDM atualizado nos dispositivos...'
        })

        await new Promise(resolve => setTimeout(resolve, 2000))
        if (cancelRef?.current) return

        // Conclusão (100%)
        onProgress?.({
          currentDevice: deviceIds.length,
          totalDevices: deviceIds.length,
          percentage: 100,
          stage: 'complete',
          message: 'Atualização concluída com sucesso!'
        })

        await new Promise(resolve => setTimeout(resolve, 1000))

        if (!cancelRef?.current) {
          showAlert(`✅ Build concluído e atualização enviada via WiFi para ${deviceIds.length} dispositivo(s)!\n\nOs dispositivos baixarão e instalarão o MDM automaticamente.`)
          syncWithServer()
        }
      } else if (cancelRef?.current) {
        showAlert('⚠️ Atualização cancelada pelo usuário.')
      } else {
        showAlert(`❌ Erro: ${result.error || 'Falha ao enviar atualização'}`)
      }
    } catch (error) {
      if (!cancelRef?.current) {
        console.error('Erro ao atualizar MDM em massa:', error)
        showAlert('❌ Erro ao enviar atualização. Verifique se o servidor está rodando na porta 3001.')
      }
    }
  }, [syncWithServer])

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
    // Tocar som de notificação estilo iPhone
    playNotificationSound()
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
    updateDevices(prevDevices => prevDevices.filter(device => device.deviceId !== deviceId))
  }, [updateDevices])

  const handleSetPasswordClick = useCallback(() => {
    const passwordInput = document.getElementById('adminPassword') as HTMLInputElement
    const confirmInput = document.getElementById('adminPasswordConfirm') as HTMLInputElement
    
    if (!passwordInput || !confirmInput) {
      showAlert('❌ Erro: Campos de senha não encontrados')
      return
    }

    const password = passwordInput.value.trim()
    const confirmPassword = confirmInput.value.trim()

    if (!password) {
      showAlert('Por favor, digite uma senha')
      passwordInput.focus()
      return
    }

    if (password.length !== 4) {
      showAlert('A senha deve ter exatamente 4 dígitos (para desbloqueio na tela de cadeado)')
      passwordInput.focus()
      return
    }

    if (password !== confirmPassword) {
      showAlert('As senhas não coincidem')
      confirmInput.focus()
      return
    }

    setShowSetPasswordConfirm(true)
  }, [])

  const handleSetPasswordConfirm = useCallback(() => {
    setShowSetPasswordConfirm(false)
    const passwordInput = document.getElementById('adminPassword') as HTMLInputElement
    const confirmInput = document.getElementById('adminPasswordConfirm') as HTMLInputElement
    
    if (!passwordInput || !confirmInput) return

    const password = passwordInput.value.trim()
    if (!password || password.length < 4) return

    const onlineDevices = devices.filter(d => d.status === 'online')

    sendMessage({
      type: 'set_admin_password',
      data: { password },
      timestamp: Date.now()
    })
    
    updateAdminPassword(password)
    
    if (onlineDevices.length > 0) {
      showAlert(`✅ Senha de administrador definida e enviada para ${onlineDevices.length} dispositivos online!`)
    } else {
      showAlert('✅ Senha de administrador definida! Dispositivos receberão a senha quando se conectarem.')
    }
    
    passwordInput.value = ''
    confirmInput.value = ''
  }, [sendMessage, devices, updateAdminPassword])

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard devices={devices} isConnected={isConnected} onMessage={handleWebSocketMessage} onViewChange={setCurrentView} />
      case 'policies':
        return <PoliciesPage />
      case 'allowed-apps':
        return (
          <AllowedAppsPage
            devices={devices}
            sendMessage={sendMessage}
          />
        )
      case 'uem':
        return <UEMPage />
      case 'alerts':
        return <AlertsPage />
      case 'scheduled':
        return <ScheduledCommandsPage />
      case 'compliance':
        return <CompliancePage />
      case 'devices':
        return (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-primary">Dispositivos</h1>
                <p className="text-white mt-1">Gerencie todos os dispositivos conectados</p>
              </div>
              <div className="flex gap-3">
                <button 
                  className="btn btn-primary"
                  onClick={handleAddDevice}
                  disabled={isAddingDevice}
                >
                  <span>{isAddingDevice ? '⏳' : '📱'}</span>
                  {isAddingDevice ? 'Instalando...' : 'Adicionar Dispositivo'}
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setIsBulkUpdateModalOpen(true)}
                  disabled={devices.length === 0}
                >
                  <span>📥</span>
                  Atualização em Massa
                </button>
                <button 
                  className="btn btn-warning"
                  onClick={() => setShowFormatConfirm(true)}
                  disabled={isFormattingDevice}
                  title="Formata o celular conectado via USB (factory reset). Use quando o dispositivo está em boot loop."
                >
                  <span>{isFormattingDevice ? '⏳' : '🔄'}</span>
                  {isFormattingDevice ? 'Formatando...' : 'Formatar Celular'}
                </button>
              </div>
            </div>

            {devices.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow">
                  <span className="text-3xl">📱</span>
                </div>
                <h3 className="text-lg font-semibold text-primary mb-2">
                  {justAddedDevice ? 'Aguardando dispositivo...' : 'Nenhum dispositivo conectado'}
                </h3>
                <p className="text-white mb-6">
                  {justAddedDevice
                    ? 'Buscando celular no servidor (até 40 segundos). Se não aparecer, verifique se o celular está na mesma rede WiFi que o PC e com o MDM aberto.'
                    : 'Conecte o celular via USB, habilite depuração e clique para instalar MDM + WMS'}
                </p>
                {justAddedDevice && (
                  <p className="text-sm text-white/80 mb-4 animate-pulse">Buscando a cada 2 segundos...</p>
                )}
                {!justAddedDevice && (
                  <button
                    type="button"
                    onClick={pollForDevicesAfterAdd}
                    disabled={isSearchingDevices}
                    className="btn btn-secondary mb-4 !text-white disabled:opacity-70 disabled:cursor-wait"
                  >
                    {isSearchingDevices ? '⏳ Buscando...' : '🔄 Buscar dispositivos novamente'}
                  </button>
                )}
                <button 
                  className="btn btn-primary btn-lg"
                  onClick={handleAddDevice}
                  disabled={isAddingDevice}
                >
                  <span>{isAddingDevice ? '⏳' : '📱'}</span>
                  {isAddingDevice ? 'Instalando MDM e WMS...' : 'Adicionar Dispositivo'}
                </button>
                <button 
                  className="btn btn-warning btn-lg mt-4"
                  onClick={() => setShowFormatConfirm(true)}
                  disabled={isFormattingDevice}
                  title="Formata o celular via USB (factory reset). Use quando está em boot loop."
                >
                  <span>{isFormattingDevice ? '⏳' : '🔄'}</span>
                  {isFormattingDevice ? 'Formatando...' : 'Formatar Celular (recovery)'}
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
                    onUpdate={() => {
                      setUpdateDevice(device)
                      setIsUpdateModalOpen(true)
                    }}
                    onLigar={() => sendMessage({ type: 'wake_device', deviceId: device.deviceId, timestamp: Date.now() })}
                    onDesligar={() => sendMessage({ type: 'reboot_device', deviceId: device.deviceId, timestamp: Date.now() })}
                    onSupportCountUpdate={supportCountUpdateTrigger}
                  />
                ))}
              </div>
            )}
          </div>
        )
      case 'users':
        return (
          <div className="p-6">
            <ConfigModal
              isOpen={true}
              onClose={() => setCurrentView('dashboard')}
              onSave={handleSaveConfig}
              asPage
            />
          </div>
        )
      case 'settings':
        return (
          <div className="p-6 text-white">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Configurações</h1>
                <p className="text-white mt-1">Gerencie as configurações do sistema MDM</p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveSettings} className="btn btn-secondary !text-white border-white/30">
                  <span>💾</span>
                  Salvar Configurações
                </button>
                <button onClick={handleApplySettings} className="btn btn-primary text-white">
                  <span>🔄</span>
                  Aplicar Mudanças
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Configurações do Servidor - texto branco */}
              <div className="lg:col-span-2 space-y-6">
                <div className="card p-6 bg-white/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Configurações do Servidor</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Endereço do Servidor WebSocket
                      </label>
                      <input
                        type="text"
                        value={settingsWsUrl}
                        onChange={(e) => setSettingsWsUrl(e.target.value)}
                        className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Intervalo de Heartbeat (segundos)
                      </label>
                      <input
                        type="number"
                        value={settingsHeartbeat}
                        onChange={(e) => setSettingsHeartbeat(e.target.value)}
                        className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="card p-6 bg-white/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Configurações de Dispositivo</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Atualização Automática de Status</div>
                        <div className="text-xs text-white/80">Atualizar status dos dispositivos automaticamente</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsAutoUpdate}
                          onChange={(e) => setSettingsAutoUpdate(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Rastreamento de Localização</div>
                        <div className="text-xs text-white/80">Permitir rastreamento de localização dos dispositivos</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsLocationTracking}
                          onChange={(e) => setSettingsLocationTracking(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="card p-6 bg-white/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Senha de Administrador</h3>
                  
                  {/* Senha Atual */}
                <div className="mb-6 p-4 bg-white/5 border border-white/20 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <div className="text-sm font-medium text-white">Senha Atual:</div>
                            <div className="text-lg font-mono text-white">
                                {currentAdminPassword ? (showPassword ? currentAdminPassword : '••••••••') : 'Não definida'}
                            </div>
                            <div className="text-xs text-white/80 mt-1">
                                Debug: {currentAdminPassword ? `Tamanho: ${currentAdminPassword.length}` : 'Vazia'}
                            </div>
                        </div>
                        {currentAdminPassword && (
                            <button
                                onClick={() => setShowPassword(!showPassword)}
                                className="ml-3 p-2 text-white hover:text-white/80 transition-colors"
                                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        )}
                    </div>
                </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Nova Senha de Administrador
                      </label>
                      <input
                        type="password"
                        id="adminPassword"
                        placeholder="Digite a nova senha (4 dígitos para desbloqueio local)"
                        className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Confirmar Senha
                      </label>
                      <input
                        type="password"
                        id="adminPasswordConfirm"
                        placeholder="Confirme a nova senha"
                        className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={handleSetPasswordClick}
                        className="btn btn-primary flex-1 text-white"
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
                        className="btn btn-secondary text-white"
                        title="Limpar os campos de nova senha"
                      >
                        <span>🗑️</span>
                        Limpar
                      </button>
                    </div>
                    <div className="bg-white border border-white/30 rounded-lg p-3">
                      <div className="text-xs font-bold text-red-600">
                        <span className="font-bold text-red-600">📋 Instruções:</span>
                        <ul className="mt-1 list-disc list-inside space-y-1 font-bold text-red-600">
                          <li>A senha será salva no servidor e enviada para todos os dispositivos</li>
                          <li>Será necessária para alterar o nome do dispositivo</li>
                          <li>O líder usa esta senha (4 dígitos) para desbloquear o celular na tela de cadeado</li>
                          <li>Dispositivos offline receberão a senha automaticamente quando se conectarem</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar de Informações - texto branco */}
              <div className="space-y-6">
                <div className="card p-6 bg-white/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Status do Sistema</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">Servidor WebSocket</span>
                      <span className={`badge ${isConnected ? 'badge-success' : 'badge-error'}`}>
                        {isConnected ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">Dispositivos Conectados</span>
                      <span className="text-sm font-medium text-white">
                        {devices.filter(d => d.status === 'online').length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">Total de Dispositivos</span>
                      <span className="text-sm font-medium text-white">{devices.length}</span>
                    </div>
                  </div>
                </div>

                <div className="card p-6 bg-white/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Ações Rápidas</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowRestartConfirm(true)}
                      disabled={isRestarting}
                      className="btn w-full !bg-white/20 !border-white/30 !text-white hover:!bg-white/30 disabled:opacity-70"
                    >
                      <span>{isRestarting ? '⏳' : '🔄'}</span>
                      {isRestarting ? 'Reiniciando...' : 'Reiniciar Servidor'}
                    </button>
                    <button
                      onClick={() => setShowBackupConfirm(true)}
                      className="btn w-full !bg-white/20 !border-white/30 !text-white hover:!bg-white/30"
                    >
                      <span>💾</span>
                      Backup de Configurações
                    </button>
                    <button
                      onClick={() => setShowClearCacheConfirm(true)}
                      className="btn btn-warning w-full !text-white"
                    >
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
        return <Dashboard devices={devices} isConnected={isConnected} onViewChange={setCurrentView} />
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
          onRefreshDevices={() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'request_devices_list', timestamp: Date.now() }))
            }
          }}
          onReconnect={() => {
            const w = wsRef.current
            if (w && (w.readyState === WebSocket.CONNECTING || w.readyState === WebSocket.OPEN)) {
              w.close(1000, 'Reconectando')
            }
            setWs(null)
            setIsConnected(false)
            setReconnectTrigger(prev => prev + 1)
          }}
          supportNotifications={supportNotifications}
          unreadSupportCount={unreadSupportCount}
          onSupportNotificationClick={(deviceId, deviceName) => {
            let device = devices.find(d => d.deviceId === deviceId)
            if (!device) {
              device = {
                id: deviceId,
                deviceId,
                name: deviceName || 'Dispositivo',
                status: 'offline',
                model: '',
                manufacturer: '',
                apiLevel: 0,
                batteryLevel: 0,
                batteryStatus: '',
                isCharging: false,
                storageTotal: 0,
                storageUsed: 0,
                memoryTotal: 0,
                memoryUsed: 0,
                cpuArchitecture: '',
                screenResolution: '',
                screenDensity: 0,
                networkType: '',
                isWifiEnabled: false,
                isBluetoothEnabled: false,
                isLocationEnabled: false,
                isDeveloperOptionsEnabled: false,
                isAdbEnabled: false,
                isUnknownSourcesEnabled: false,
                installedAppsCount: 0,
                isDeviceOwner: false,
                isProfileOwner: false,
                appVersion: '',
                timezone: '',
                language: '',
                country: '',
                lastSeen: Date.now(),
                restrictions: {} as any,
                installedApps: [],
                allowedApps: []
              } as Device
            }
            handleSupportClick(device)
          }}
          onViewChange={setCurrentView}
        />

        {/* Content */}
        <main className="animate-fade-in">
          {!isDataLoaded ? (
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4"></div>
                <p className="text-[var(--text-secondary)]">Carregando dados salvos...</p>
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
          onClose={() => {
            handleCloseModal()
            setDeviceModalInitialTab('overview')
          }}
          onDelete={() => handleDeleteDevice(selectedDevice.deviceId)}
          onUpdate={() => {
            setUpdateDevice(selectedDevice)
            setIsUpdateModalOpen(true)
          }}
          sendMessage={sendMessage}
          onUnlinkUser={handleUnlinkUser}
          initialTab={deviceModalInitialTab}
        />
      )}

      {/* Support Messages Modal */}
      {isSupportModalOpen && supportDevice && (
        <SupportMessagesModal
          device={devices.find(d => d.deviceId === supportDevice.deviceId) ?? supportDevice}
          isOpen={isSupportModalOpen}
          onClose={handleSupportModalClose}
          onMessageStatusUpdate={handleSupportCountUpdate}
          sendMessage={sendMessage}
          alarmError={alarmError?.deviceId === supportDevice.deviceId ? alarmError : null}
          onAlarmErrorHandled={() => setAlarmError(null)}
        />
      )}

      {/* Barra de progresso da atualização por dispositivo */}
      {updateProgress && (() => {
        const elapsed = (Date.now() - updateProgress.startTime) / 1000 // segundos
        const done = updateProgress.progress - updateProgress.startProgress
        const remaining = 100 - updateProgress.progress
        let etaText = ''
        if (done > 2 && elapsed > 3) {
          const rate = done / elapsed // % por segundo
          const etaSec = remaining / rate
          if (etaSec < 60) etaText = `~${Math.ceil(etaSec)}s restantes`
          else if (etaSec < 3600) etaText = `~${Math.ceil(etaSec / 60)}min restantes`
          else etaText = `~${Math.ceil(etaSec / 3600)}h restantes`
        } else if (updateProgress.progress < 5) {
          etaText = 'Calculando tempo...'
        }
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6 max-w-md w-full mx-4 relative">
              <button
                type="button"
                onClick={() => setUpdateProgress(null)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] transition-colors"
                title="Fechar (a atualização continua no dispositivo)"
              >
                ✕
              </button>
              <h3 className="text-lg font-semibold text-primary mb-1 pr-8">
                📥 Atualizando {updateProgress.deviceName}
              </h3>
              <p className="text-sm text-secondary mb-3">{updateProgress.status}</p>
              <div className="w-full bg-[var(--surface-elevated)] rounded-full h-4 overflow-hidden mb-3">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${updateProgress.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-primary">{updateProgress.progress}%</span>
                {etaText && (
                  <span className="text-sm font-medium text-secondary bg-[var(--surface-elevated)] px-3 py-1 rounded-full">
                    ⏱ {etaText}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Update App Modal */}
      {isUpdateModalOpen && updateDevice && (
        <UpdateAppModal
          device={updateDevice}
          isOpen={isUpdateModalOpen}
          onClose={() => {
            setIsUpdateModalOpen(false)
            setUpdateDevice(null)
          }}
          onConfirm={(apkUrl: string, version: string) => handleUpdateApp(apkUrl, version, updateDevice!)}
        />
      )}

      {/* Bulk Update Modal */}
      {isBulkUpdateModalOpen && (
        <BulkUpdateModal
          devices={devices}
          isOpen={isBulkUpdateModalOpen}
          onClose={() => setIsBulkUpdateModalOpen(false)}
          onBulkUpdateMdm={handleBulkUpdateMdm}
        />
      )}

      {/* User Selection Modal */}
      {isUserSelectionModalOpen && deviceForUserAssignment && (
        <UserSelectionModal
          isOpen={isUserSelectionModalOpen}
          onClose={() => {
            setIsUserSelectionModalOpen(false)
            setDeviceForUserAssignment(null)
          }}
          onSelectUser={handleUserSelected}
          currentUserId={deviceForUserAssignment.assignedUserId || null}
        />
      )}

      {isConflictModalOpen && conflictInfo && (
        <UserConflictModal
          isOpen={isConflictModalOpen}
          onClose={() => {
            setIsConflictModalOpen(false)
            setConflictInfo(null)
            // Abrir modal do dispositivo após fechar o modal de conflito
            if (selectedDevice) {
              setIsModalOpen(true)
            }
          }}
          conflict={conflictInfo}
        />
      )}

      {/* Config Modal - Usuários */}
      {isConfigModalOpen && (
        <ConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          onSave={handleSaveConfig}
        />
      )}

      {/* Modal de confirmação - Backup */}
      <ConfirmModal
        isOpen={showBackupConfirm}
        onClose={() => setShowBackupConfirm(false)}
        onConfirm={handleBackup}
        title="Backup de Configurações"
        message="Deseja fazer o backup das configurações? Um arquivo JSON será baixado."
        confirmLabel="Sim"
        cancelLabel="Não"
      />

      {/* Modal de confirmação - Reiniciar Servidor */}
      <ConfirmModal
        isOpen={showRestartConfirm}
        onClose={() => setShowRestartConfirm(false)}
        onConfirm={handleRestart}
        title="Reiniciar Servidor"
        message="Deseja reiniciar o servidor? A conexão será interrompida temporariamente."
        confirmLabel="Sim"
        cancelLabel="Não"
        variant="warning"
      />

      {/* Modal de confirmação - Formatar Celular */}
      <ConfirmModal
        isOpen={showFormatConfirm}
        onClose={() => setShowFormatConfirm(false)}
        onConfirm={handleFormatDevice}
        title="Formatar Celular"
        message="O celular conectado via USB será reiniciado no modo recovery. Você precisará usar as teclas de volume para navegar e Power para confirmar. Selecione 'Wipe data/factory reset'. Isso apagará todos os dados do dispositivo. Continuar?"
        confirmLabel="Sim, formatar"
        cancelLabel="Cancelar"
        variant="danger"
      />

      {/* Modal de confirmação - Limpar Cache */}
      <ConfirmModal
        isOpen={showClearCacheConfirm}
        onClose={() => setShowClearCacheConfirm(false)}
        onConfirm={handleClearCache}
        title="Limpar Cache"
        message="Deseja limpar o cache de localização? Os dados serão recarregados na próxima atualização."
        confirmLabel="Sim"
        cancelLabel="Não"
        variant="warning"
      />

      {/* Modal de confirmação - Definir Senha */}
      <ConfirmModal
        isOpen={showSetPasswordConfirm}
        onClose={() => setShowSetPasswordConfirm(false)}
        onConfirm={handleSetPasswordConfirm}
        title="Definir Senha"
        message="Tem certeza que deseja definir esta senha de administrador para todos os dispositivos?"
        confirmLabel="Sim"
        cancelLabel="Não"
        variant="primary"
      />
    </div>
  )
}