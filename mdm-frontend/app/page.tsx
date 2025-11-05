'use client'

import { useState, useEffect, useCallback } from 'react'
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
import PoliciesPage from './policies/page'
import UEMPage from './uem/page'
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
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateDevice, setUpdateDevice] = useState<Device | null>(null)
  const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false)
  const [isUserSelectionModalOpen, setIsUserSelectionModalOpen] = useState(false)
  const [deviceForUserAssignment, setDeviceForUserAssignment] = useState<Device | null>(null)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [usersCount, setUsersCount] = useState(0)
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  
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
        // Detectar automaticamente o host correto
        // Se acessando de localhost/127.0.0.1, usar localhost
        // Caso contrário, usar o mesmo host da página web
        const hostname = window.location.hostname
        const wsHost = (hostname === 'localhost' || hostname === '127.0.0.1') 
          ? 'localhost' 
          : hostname
        
        const wsUrl = `ws://${wsHost}:3002`
        console.log('🔌 Conectando ao WebSocket:', wsUrl)
        
        const websocket = new WebSocket(wsUrl)
        
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
          alert(`Erro ao deletar dispositivo: ${message.error}`)
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
    // Se já tem usuário vinculado, abrir direto o modal do dispositivo
    if (device.assignedUserId) {
      setSelectedDevice(device)
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
          setIsModalOpen(true)
        }
      } else {
        // Outros erros (não relacionados a conflito)
        alert('❌ Erro ao vincular usuário: ' + (result.message || result.error))
      }
    } catch (error) {
      console.error('❌ Erro ao vincular usuário:', error)
      alert('❌ Erro ao conectar com o servidor')
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
    
    if (confirm(`Desvincular usuário de ${selectedDevice.name}?`)) {
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
          alert('❌ Erro ao desvincular usuário: ' + result.error)
        }
      } catch (error) {
        console.error('❌ Erro ao desvincular usuário:', error)
        alert('❌ Erro ao conectar com o servidor')
      }
    }
  }

  const handleSaveConfig = (users: Array<{ id: string; name: string; cpf: string }>) => {
    // Atualizar contagem de usuários
    setUsersCount(users.length)
    console.log('✅ Usuários salvos no banco:', users.length)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedDevice(null)
  }

  const handleDeleteDevice = useCallback((deviceId: string) => {
    // Validar se deviceId é válido
    if (!deviceId || deviceId === 'null' || deviceId === 'undefined') {
      console.error('❌ DeviceId inválido para deleção:', deviceId)
      alert('Erro: ID do dispositivo inválido. Não é possível deletar este dispositivo.')
      return
    }
    
    if (window.confirm('Tem certeza que deseja deletar este dispositivo permanentemente? Esta ação não pode ser desfeita.')) {
      console.log('🗑️ Enviando requisição de deleção:', deviceId)
      sendMessage({
        type: 'delete_device',
        deviceId: deviceId,
        timestamp: Date.now()
      })
    }
  }, [sendMessage])

  const handleUpdateApp = useCallback(async (apkUrl: string, version: string) => {
    if (!updateDevice) return

    try {
      console.log('📥 Iniciando atualização de app:', {
        deviceId: updateDevice.deviceId,
        apkUrl,
        version
      })

      const response = await fetch('/api/devices/update-app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceIds: [updateDevice.deviceId],
          apkUrl,
          version
        })
      })

      const result = await response.json()

      if (result.success) {
        alert(`✅ Atualização iniciada para ${updateDevice.name}!\n\nO dispositivo começará a baixar e instalar o APK automaticamente.\n\nAcompanhe o progresso nos logs do dispositivo.`)
        setIsUpdateModalOpen(false)
        setUpdateDevice(null)
      } else {
        alert(`❌ Erro ao enviar comando de atualização:\n${result.error || 'Erro desconhecido'}`)
      }
    } catch (error) {
      console.error('Erro ao atualizar app:', error)
      alert('❌ Erro ao enviar comando de atualização. Verifique o console para mais detalhes.')
    }
  }, [updateDevice])

  const handleBulkUpdateApp = useCallback(async (deviceIds: string[], apkUrl: string, version: string) => {
    try {
      console.log('📥 Iniciando atualização em massa:', {
        deviceCount: deviceIds.length,
        deviceIds,
        apkUrl,
        version
      })

      const response = await fetch('/api/devices/update-app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceIds,
          apkUrl,
          version
        })
      })

      const result = await response.json()

      if (result.success) {
        alert(`✅ Atualização iniciada para ${deviceIds.length} dispositivo(s)!\n\nOs dispositivos começarão a baixar e instalar o APK automaticamente.\n\nAcompanhe o progresso nos logs dos dispositivos.`)
        setIsBulkUpdateModalOpen(false)
      } else {
        alert(`❌ Erro ao enviar comando de atualização:\n${result.error || 'Erro desconhecido'}`)
      }
    } catch (error) {
      console.error('Erro ao atualizar apps em massa:', error)
      alert('❌ Erro ao enviar comando de atualização. Verifique o console para mais detalhes.')
    }
  }, [])

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
    updateDevices(prevDevices => prevDevices.filter(device => device.deviceId !== deviceId))
  }, [updateDevices])

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
      case 'policies':
        return <PoliciesPage />
      case 'uem':
        return <UEMPage />
      case 'devices':
        return (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-primary">Dispositivos</h1>
                <p className="text-secondary mt-1">Gerencie todos os dispositivos conectados</p>
              </div>
              <div className="flex gap-3">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setIsConfigModalOpen(true)}
                >
                  <span>👥</span>
                  Usuários
                  {usersCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                      {usersCount}
                    </span>
                  )}
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => setIsBulkUpdateModalOpen(true)}
                  disabled={devices.length === 0}
                >
                  <span>📥</span>
                  Atualização em Massa
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
                    onUpdate={() => {
                      setUpdateDevice(device)
                      setIsUpdateModalOpen(true)
                    }}
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
          onUnlinkUser={handleUnlinkUser}
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

      {/* Update App Modal */}
      {isUpdateModalOpen && updateDevice && (
        <UpdateAppModal
          device={updateDevice}
          isOpen={isUpdateModalOpen}
          onClose={() => {
            setIsUpdateModalOpen(false)
            setUpdateDevice(null)
          }}
          onConfirm={handleUpdateApp}
        />
      )}

      {/* Bulk Update Modal */}
      {isBulkUpdateModalOpen && (
        <BulkUpdateModal
          devices={devices}
          isOpen={isBulkUpdateModalOpen}
          onClose={() => setIsBulkUpdateModalOpen(false)}
          onConfirm={handleBulkUpdateApp}
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
    </div>
  )
}