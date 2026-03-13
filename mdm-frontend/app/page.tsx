'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
import UnifiedLogsPage from './components/UnifiedLogsPage'
import DeviceMapPage from './components/DeviceMapPage'
import GeofencingPage from './components/GeofencingPage'
import OrganizationsPage from './components/OrganizationsPage'
import HelpPage from './components/HelpPage'
import LoginPage from './components/LoginPage'
import AboutPage from './components/AboutPage'
import { Device, AppInfo } from './types/device'
import { usePersistence } from './lib/persistence'
import { showAlert, showConfirm } from './lib/dialog'
import { playNotificationSound } from './lib/notification-sound'

// Interfaces Device e AppInfo importadas de './types/device'

export default function Home() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<{username: string, name: string, role: string} | null>(null)

  // Check for existing auth token on mount - validate against server
  useEffect(() => {
    const token = localStorage.getItem('mdm_auth_token')
    if (!token) return
    const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    fetch(`http://${wsHost}:3001/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.user) {
          setIsAuthenticated(true)
          setCurrentUser(data.user)
          localStorage.setItem('mdm_user', JSON.stringify(data.user))
        } else {
          // Token inválido ou expirado - forçar login
          localStorage.removeItem('mdm_auth_token')
          localStorage.removeItem('mdm_user')
          setIsAuthenticated(false)
        }
      })
      .catch(() => {
        // Servidor indisponível - aceitar token local temporariamente
        setIsAuthenticated(true)
        try {
          const savedUser = localStorage.getItem('mdm_user')
          if (savedUser) setCurrentUser(JSON.parse(savedUser))
        } catch {}
      })
  }, [])

  const handleLogin = (user?: {username: string, name: string, role: string}) => {
    setIsAuthenticated(true)
    if (user) setCurrentUser(user)
  }

  const handleLogout = () => {
    localStorage.removeItem('mdm_auth_token')
    localStorage.removeItem('mdm_user')
    setIsAuthenticated(false)
  }

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
  const [showAddDeviceMenu, setShowAddDeviceMenu] = useState(false)
  const [addDeviceProgress, setAddDeviceProgress] = useState<{ show: boolean; steps: string[]; status: 'loading' | 'success' | 'error'; message: string }>({ show: false, steps: [], status: 'loading', message: '' })
  const [isSearchingDevices, setIsSearchingDevices] = useState(false)
  const [justAddedDevice, setJustAddedDevice] = useState(false)
  const [showBackupConfirm, setShowBackupConfirm] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false)
  const [showFormatConfirm, setShowFormatConfirm] = useState(false)
  const [isFormattingDevice, setIsFormattingDevice] = useState(false)
  const [showSetPasswordConfirm, setShowSetPasswordConfirm] = useState(false)

  // Confirmation modal for dangerous actions
  const [confirmAction, setConfirmAction] = useState<{title: string, message: string, callback: () => void} | null>(null)
  const [confirmInput, setConfirmInput] = useState('')

  // Toast notifications
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null)

  const [alarmError, setAlarmError] = useState<{ deviceId: string } | null>(null)
  const [showInstallApkModal, setShowInstallApkModal] = useState(false)
  const [installApkDeviceId, setInstallApkDeviceId] = useState<string | null>(null)
  const [installApkUrl, setInstallApkUrl] = useState('')
  const [isInstallingApk, setIsInstallingApk] = useState(false)
  const [showProvisioningQrModal, setShowProvisioningQrModal] = useState(false)
  const [provWifiSsid, setProvWifiSsid] = useState('')
  const [provWifiPassword, setProvWifiPassword] = useState('')
  const [provWifiSecurity, setProvWifiSecurity] = useState('WPA')
  const [provQrImageUrl, setProvQrImageUrl] = useState<string | null>(null)
  const [provQrLoading, setProvQrLoading] = useState(false)
  const [showWipeQrModal, setShowWipeQrModal] = useState(false)
  const [wipeQrImageUrl, setWipeQrImageUrl] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<{ deviceId: string; deviceName: string; progress: number; status: string; startTime: number; startProgress: number; lastProgressTime: number } | null>(null)
  const updateAlertShownRef = useRef(false)
  const updateProgressRef = useRef(updateProgress)
  const [settingsWsUrl, setSettingsWsUrl] = useState('ws://localhost:3001')
  const [settingsHeartbeat, setSettingsHeartbeat] = useState('30')
  const [settingsAutoUpdate, setSettingsAutoUpdate] = useState(true)
  const [settingsLocationTracking, setSettingsLocationTracking] = useState(true)
  const [kioskEnabled, setKioskEnabled] = useState(false)
  const [kioskApps, setKioskApps] = useState<string[]>([])
  const [wallpaperUrl, setWallpaperUrl] = useState('')
  const [wallpaperPreview, setWallpaperPreview] = useState('')
  const [passwordPolicy, setPasswordPolicy] = useState({ minLength: '4', type: 'pin', changeDays: '0', maxAttempts: '10' })
  const [scheduledReports, setScheduledReports] = useState({ enabled: false, frequency: 'weekly', types: { devices: true, apps: false, alerts: true, compliance: false }, email: '' })
  const [lastBackupFile, setLastBackupFile] = useState<string | null>(typeof window !== 'undefined' ? localStorage.getItem('mdm_last_backup_file') : null)
  const settingsLoadedRef = useRef(false)

  // Configuration profiles
  const defaultProfiles = [
    { id: 'operador', name: 'Operador', description: 'Perfil restritivo para operadores de campo', icon: '👷', restrictions: { camera: false, bluetooth: false, developerOptions: false, installApps: false, statusBar: false }, apps: ['com.mdm.launcher', 'com.wms.mobile'] },
    { id: 'lider', name: 'Líder', description: 'Perfil com mais permissões para líderes', icon: '👔', restrictions: { camera: true, bluetooth: true, developerOptions: false, installApps: false, statusBar: true }, apps: ['com.mdm.launcher', 'com.wms.mobile', 'com.whatsapp', 'com.google.android.apps.maps'] },
    { id: 'externo', name: 'Externo', description: 'Perfil para dispositivos de uso externo', icon: '🌐', restrictions: { camera: true, bluetooth: true, developerOptions: false, installApps: true, statusBar: true }, apps: [] }
  ]
  const [profiles, setProfiles] = useState(defaultProfiles)
  const [applyingProfile, setApplyingProfile] = useState<string | null>(null)
  const [profileTargetDevice, setProfileTargetDevice] = useState('')

  // Admin users management
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [newAdminUser, setNewAdminUser] = useState({ username: '', password: '', name: '' })
  const [isAddingAdminUser, setIsAddingAdminUser] = useState(false)

  const loadAdminUsers = useCallback(async () => {
    const token = localStorage.getItem('mdm_auth_token')
    if (!token) return
    try {
      const res = await fetch('/api/auth/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setAdminUsers(data.users)
    } catch (e) {
      console.error('Erro ao carregar usuários admin:', e)
    }
  }, [])

  const handleAddAdminUser = async () => {
    if (!newAdminUser.username || !newAdminUser.password || !newAdminUser.name) {
      await showAlert('Preencha todos os campos.')
      return
    }
    setIsAddingAdminUser(true)
    const token = localStorage.getItem('mdm_auth_token')
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...newAdminUser, role: 'admin' })
      })
      const data = await res.json()
      if (data.success) {
        setNewAdminUser({ username: '', password: '', name: '' })
        loadAdminUsers()
      } else {
        await showAlert(data.error || 'Erro ao criar usuário.')
      }
    } catch (e) {
      await showAlert('Erro ao conectar com o servidor.')
    }
    setIsAddingAdminUser(false)
  }

  const handleDeleteAdminUser = async (userId: number, userName: string) => {
    const confirmed = await showConfirm(`Deseja realmente deletar o usuário "${userName}"?`)
    if (!confirmed) return
    const token = localStorage.getItem('mdm_auth_token')
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        loadAdminUsers()
      } else {
        await showAlert(data.error || 'Erro ao deletar usuário.')
      }
    } catch (e) {
      await showAlert('Erro ao conectar com o servidor.')
    }
  }

  // Device list search, filter, sort, pagination
  const [deviceSearch, setDeviceSearch] = useState('')
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [deviceSort, setDeviceSort] = useState('name-asc')
  const [devicePage, setDevicePage] = useState(1)
  const DEVICES_PER_PAGE = 12

  const filteredDevices = useMemo(() => {
    let result = [...devices]
    // search filter
    if (deviceSearch) {
      const s = deviceSearch.toLowerCase()
      result = result.filter(d =>
        d.name?.toLowerCase().includes(s) ||
        d.model?.toLowerCase().includes(s) ||
        d.deviceId?.toLowerCase().includes(s)
      )
    }
    // status filter
    if (deviceFilter === 'online') result = result.filter(d => d.status === 'online')
    if (deviceFilter === 'offline') result = result.filter(d => d.status !== 'online')
    // sort
    result.sort((a, b) => {
      switch (deviceSort) {
        case 'name-asc':
          return (a.name || '').localeCompare(b.name || '')
        case 'name-desc':
          return (b.name || '').localeCompare(a.name || '')
        case 'status':
          return (a.status === 'online' ? 0 : 1) - (b.status === 'online' ? 0 : 1)
        case 'battery':
          return (b.batteryLevel ?? 0) - (a.batteryLevel ?? 0)
        default:
          return 0
      }
    })
    return result
  }, [devices, deviceSearch, deviceFilter, deviceSort])

  const totalDevicePages = Math.max(1, Math.ceil(filteredDevices.length / DEVICES_PER_PAGE))
  const safePage = Math.min(devicePage, totalDevicePages)
  const paginatedDevices = filteredDevices.slice((safePage - 1) * DEVICES_PER_PAGE, safePage * DEVICES_PER_PAGE)

  // Reset page when filters change
  useEffect(() => {
    setDevicePage(1)
  }, [deviceSearch, deviceFilter, deviceSort])

  // Export devices to Excel (CSV)
  const exportDevicesToExcel = () => {
    const headers = ['Nome', 'Modelo', 'Status', 'Bateria', 'Usuário', 'Última Conexão', 'Latitude', 'Longitude']
    const csvRows = filteredDevices.map((d: Device) => [
      d.name || d.model || 'Sem nome',
      d.model || '-',
      d.status === 'online' ? 'Online' : 'Offline',
      d.batteryLevel ? `${d.batteryLevel}%` : '-',
      d.assignedUser?.name || d.assignedUserName || 'Não atribuído',
      d.lastSeen ? new Date(d.lastSeen).toLocaleString('pt-BR') : '-',
      d.latitude ? String(d.latitude) : '-',
      d.longitude ? String(d.longitude) : '-'
    ])
    let csv = '\uFEFF'
    csv += headers.join(';') + '\n'
    csvRows.forEach((row: string[]) => { csv += row.join(';') + '\n' })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dispositivos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Export devices to PDF (print)
  const exportDevicesToPDF = () => {
    const pw = window.open('', '_blank')
    if (!pw) return
    const tableRows = filteredDevices.map((d: Device) => `
      <tr>
        <td>${d.name || d.model || 'Sem nome'}</td>
        <td>${d.model || '-'}</td>
        <td style="color:${d.status === 'online' ? '#16a34a' : '#dc2626'};font-weight:600;">${d.status === 'online' ? 'Online' : 'Offline'}</td>
        <td>${d.batteryLevel ? d.batteryLevel + '%' : '-'}</td>
        <td>${d.assignedUser?.name || d.assignedUserName || 'N/A'}</td>
        <td>${d.lastSeen ? new Date(d.lastSeen).toLocaleString('pt-BR') : '-'}</td>
        <td style="font-size:11px;">${d.latitude ? `${d.latitude.toFixed(5)}, ${d.longitude?.toFixed(5)}` : '-'}</td>
      </tr>
    `).join('')
    pw.document.write(`
      <html>
      <head>
        <title>Relatório de Dispositivos - MDM Center</title>
        <style>
          @page { size: landscape; margin: 15mm; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 30px; color: #222; }
          h1 { font-size: 26px; color: #1e293b; margin: 0 0 6px 0; }
          .meta { color: #555; font-size: 14px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #1e293b; color: #fff; font-size: 14px; font-weight: 600; padding: 12px 14px; text-align: left; }
          td { border-bottom: 1px solid #e2e8f0; padding: 10px 14px; font-size: 13px; white-space: nowrap; }
          tr:nth-child(even) { background: #f8fafc; }
          tr:hover { background: #f1f5f9; }
          .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
          .tip { margin-top: 16px; padding: 10px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; font-size: 12px; color: #0369a1; }
        </style>
      </head>
      <body>
        <h1>Relatório de Dispositivos — MDM Center</h1>
        <div class="meta">Gerado em: ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; Total: ${filteredDevices.length} dispositivos</div>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Modelo</th>
              <th>Status</th>
              <th>Bateria</th>
              <th>Usuário</th>
              <th>Última Conexão</th>
              <th>Localização</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="tip">Para relatório individual com mapa de calor, acesse o Mapa, selecione o dispositivo e clique em "Exportar PDF com Mapa de Calor".</div>
        <div class="footer">MDM Center — Relatório gerado automaticamente</div>
      </body>
      </html>
    `)
    pw.document.close()
    pw.print()
  }

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

  // Fechar dropdown "Adicionar Dispositivo" ao clicar fora
  useEffect(() => {
    if (!showAddDeviceMenu) return
    const handleClick = () => setShowAddDeviceMenu(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showAddDeviceMenu])

  // Manter ref do updateProgress sincronizada
  useEffect(() => { updateProgressRef.current = updateProgress }, [updateProgress])

  // Timeout: se não receber progresso em 90s, assumir que o dispositivo atualizou e reconectou (auto-update mata o app)
  useEffect(() => {
    if (!updateProgress) return
    const timer = setInterval(() => {
      const up = updateProgressRef.current
      if (!up) { clearInterval(timer); return }
      const now = Date.now()
      const staleMs = now - up.lastProgressTime
      if (staleMs > 90000) {
        // Verificar se dispositivo voltou online (reconectou após auto-update)
        const dev = devices.find(d => d.deviceId === up.deviceId)
        if (dev && dev.status === 'online') {
          setUpdateProgress(null)
          showAlert(`✅ O dispositivo ${up.deviceName} está online novamente. A atualização provavelmente foi concluída com sucesso.`)
        } else {
          setUpdateProgress(prev => prev ? { ...prev, status: 'Sem resposta do dispositivo... A atualização pode ter sido concluída.' } : null)
        }
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [updateProgress?.deviceId, devices])

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentView, setCurrentView] = useState('dashboard')
  const [showPassword, setShowPassword] = useState<boolean>(false)

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

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
        const kioskSaved = localStorage.getItem('mdm_kiosk_config')
        if (kioskSaved) {
          const k = JSON.parse(kioskSaved)
          if (k.enabled != null) setKioskEnabled(k.enabled)
          if (Array.isArray(k.apps)) setKioskApps(k.apps)
        }
        // Carregar wallpaper do servidor (persistente) ou localStorage
        const wpSaved = localStorage.getItem('mdm_wallpaper_url')
        if (wpSaved) {
          setWallpaperUrl(wpSaved)
          setWallpaperPreview(wpSaved)
        }
        ;(async () => {
          try {
            const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
            const wpRes = await fetch(`http://${wsHost}:3001/api/config/wallpaper`)
            const wpData = await wpRes.json()
            if (wpData.success && wpData.url) {
              setWallpaperUrl(wpData.url)
              setWallpaperPreview(wpData.url)
              localStorage.setItem('mdm_wallpaper_url', wpData.url)
            }
          } catch {}
        })()
        const ppSaved = localStorage.getItem('mdm_password_policy')
        if (ppSaved) setPasswordPolicy(JSON.parse(ppSaved))
        const srSaved = localStorage.getItem('mdm_scheduled_reports')
        if (srSaved) setScheduledReports(JSON.parse(srSaved))
        const prSaved = localStorage.getItem('mdm_profiles')
        if (prSaved) setProfiles(JSON.parse(prSaved))
        settingsLoadedRef.current = true
      } catch (_) {}
    }
    if (currentView !== 'settings') settingsLoadedRef.current = false
    if (currentView === 'settings') loadAdminUsers()
  }, [currentView, loadAdminUsers])

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
        {
          const disconnectedDev = devices.find(d => d.deviceId === message.deviceId)
          const devName = disconnectedDev?.name || disconnectedDev?.model || message.deviceId
          // Desktop notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('MDM - Dispositivo Offline', {
              body: `${devName} ficou offline`,
              icon: '/logo.png',
              tag: `offline-${message.deviceId}`
            })
          }
          // Alert sound
          try {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = 440
            gain.gain.value = 0.1
            osc.start()
            osc.stop(ctx.currentTime + 0.2)
          } catch (_) {}
        }
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
            return { ...prev, progress: message.progress ?? 0, status: message.status || prev.status, lastProgressTime: Date.now() }
          }
          // Primeiro progresso recebido - criar estado se ainda não existe
          if (!prev) {
            const p = message.progress ?? 0
            return { deviceId: message.deviceId, deviceName, progress: p, status: message.status || 'Atualizando...', startTime: Date.now(), startProgress: p, lastProgressTime: Date.now() }
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
      setToast({ message: 'Backup baixado com sucesso!', type: 'success' })
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

  const executeFormatDevice = async () => {
    setIsFormattingDevice(true)
    try {
      const res = await fetch('/api/devices/format-device', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setToast({ message: data.message || 'Celular reiniciando no modo recovery.', type: 'success' })
      } else {
        showAlert(data.error || 'Falha ao formatar')
      }
    } catch (e) {
      showAlert('Erro: ' + (e instanceof Error ? e.message : 'Falha ao conectar'))
    } finally {
      setIsFormattingDevice(false)
    }
  }

  const handleFormatDevice = () => {
    setShowFormatConfirm(false)
    setConfirmAction({
      title: 'Formatar Dispositivo',
      message: 'Todos os dados serão apagados permanentemente. Esta ação é irreversível. Digite CONFIRMAR para prosseguir.',
      callback: executeFormatDevice
    })
  }

  const handleClearCache = async () => {
    setShowClearCacheConfirm(false)
    try {
      const wsHost = typeof window !== 'undefined' ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'localhost' : window.location.hostname) : 'localhost'
      const res = await fetch(`http://${wsHost}:3001/api/server/clear-cache`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        setToast({ message: 'Cache limpo com sucesso!', type: 'success' })
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
    const simulatedSteps = [
      'Detectando dispositivo USB...',
      'Desinstalando MDM anterior...',
      'Verificando APK...',
      'Instalando MDM no dispositivo...',
      'Instalando WMS...',
      'Configurando permissões...',
      'Definindo Device Owner...',
      'Configurando launcher padrão...',
      'Abrindo MDM no dispositivo...'
    ]
    setAddDeviceProgress({ show: true, steps: [simulatedSteps[0]], status: 'loading', message: '' })

    // Simular etapas enquanto aguarda resposta real
    let stepIndex = 0
    const interval = setInterval(() => {
      stepIndex++
      if (stepIndex < simulatedSteps.length) {
        setAddDeviceProgress(prev => ({ ...prev, steps: simulatedSteps.slice(0, stepIndex + 1) }))
      }
    }, 3000)

    try {
      const res = await fetch('/api/devices/add-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wmsVariant: 'pedidos' })
      })
      clearInterval(interval)
      const data = await res.json()
      const realSteps = (data.steps || []) as string[]
      if (data.success) {
        setAddDeviceProgress({ show: true, steps: realSteps, status: 'success', message: 'Dispositivo configurado com sucesso!' })
        setJustAddedDevice(true)
        setTimeout(() => setJustAddedDevice(false), 45000)
        pollForDevicesAfterAdd()
      } else {
        setAddDeviceProgress({ show: true, steps: realSteps, status: 'error', message: data.error || 'Falha ao configurar' })
      }
    } catch (e) {
      clearInterval(interval)
      setAddDeviceProgress(prev => ({ ...prev, status: 'error', message: e instanceof Error ? e.message : 'Falha ao conectar' }))
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

  const executeDeleteDevice = useCallback(async (deviceId: string) => {
    if (!deviceId || deviceId === 'null' || deviceId === 'undefined') {
      showAlert('Erro: ID do dispositivo inválido.')
      return
    }

    // Tentar deletar via API (banco de dados)
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!result.success) {
        console.log('Dispositivo não encontrado no banco, deletando via WebSocket')
      }
    } catch (e) {
      console.log('API indisponível, deletando via WebSocket')
    }

    // Sempre enviar via WebSocket (remove da memória do servidor)
    sendMessage({
      type: 'delete_device',
      deviceId: deviceId,
      timestamp: Date.now()
    })

    // Sempre remover da UI local
    updateDevices(prev => prev.filter(d => d.deviceId !== deviceId))
    setIsModalOpen(false)
    setSelectedDevice(null)
    setToast({ message: 'Dispositivo deletado com sucesso', type: 'success' })
  }, [sendMessage, updateDevices])

  const handleDeleteDevice = useCallback((deviceId: string) => {
    if (currentUser?.role === 'viewer') {
      showAlert('Sem permissão para deletar dispositivos.')
      return
    }
    executeDeleteDevice(deviceId)
  }, [currentUser?.role, executeDeleteDevice])

  const handleUpdateApp = useCallback((apkUrl: string, version: string, device?: Device) => {
    const dev = device || updateDevice
    if (!dev) return

    const deviceName = dev.name
    const deviceId = dev.deviceId

    // Mostrar barra de progresso IMEDIATAMENTE ao clicar
    setUpdateProgress({ deviceId, deviceName, progress: 0, status: 'Enviando comando ao dispositivo...', startTime: Date.now(), startProgress: 0, lastProgressTime: Date.now() })

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
      // compliance removido
      case 'map':
        return <DeviceMapPage devices={devices} />
      case 'geofencing':
        return <GeofencingPage devices={devices} sendMessage={sendMessage} />
      case 'audit-logs':
        return <UnifiedLogsPage devices={devices} sendMessage={sendMessage} />
      case 'organizations':
        return <OrganizationsPage />
      case 'help':
        return <HelpPage />
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
                  className="btn btn-secondary"
                  onClick={() => setIsBulkUpdateModalOpen(true)}
                  disabled={devices.length === 0}
                >
                  <span>📥</span>
                  Atualização em Massa
                </button>
                <div className="relative">
                  <button
                    className="btn btn-primary"
                    onClick={(e) => { e.stopPropagation(); setShowAddDeviceMenu(prev => !prev) }}
                    title="Adicionar novo dispositivo"
                  >
                    <span>➕</span>
                    Adicionar Dispositivo
                    <span className="ml-1 text-[10px]">▼</span>
                  </button>
                  {showAddDeviceMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-surface border border-white/20 rounded-lg shadow-xl z-50 min-w-[220px] overflow-hidden">
                      <button
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                        onClick={() => { setShowAddDeviceMenu(false); handleAddDevice() }}
                        disabled={isAddingDevice}
                      >
                        <span>🔌</span>
                        {isAddingDevice ? 'Instalando...' : 'Via USB (ADB)'}
                      </button>
                      <button
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2 border-t border-white/10 transition-colors"
                        onClick={() => {
                          setShowAddDeviceMenu(false)
                          setProvQrImageUrl(null)
                          setShowProvisioningQrModal(true)
                          fetch(`http://${window.location.hostname}:3001/api/temp-allow-browser`, { method: 'POST' }).catch(() => {})
                        }}
                      >
                        <span>📱</span>
                        Via QR Code MDM
                      </button>
                    </div>
                  )}
                </div>
                {currentUser?.role !== 'viewer' && (
                  <button
                    className="btn btn-warning"
                    onClick={() => setShowWipeQrModal(true)}
                    title="Formatar celular via USB"
                  >
                    <span>🔄</span>
                    Formatar
                  </button>
                )}
                <button onClick={exportDevicesToExcel} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700" disabled={filteredDevices.length === 0}>
                  Exportar Excel
                </button>
                <button onClick={exportDevicesToPDF} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700" disabled={filteredDevices.length === 0}>
                  Exportar PDF
                </button>
              </div>
            </div>

            {/* Search, Filter, Sort Bar */}
            {devices.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                {/* Search */}
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Buscar dispositivos..."
                    value={deviceSearch}
                    onChange={e => setDeviceSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-surface border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
                {/* Filter buttons */}
                <div className="flex gap-1 bg-surface border border-white/10 rounded-lg p-1">
                  {([['all', 'Todos'], ['online', 'Online'], ['offline', 'Offline']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setDeviceFilter(value)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        deviceFilter === value
                          ? 'bg-primary text-white'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Sort dropdown */}
                <select
                  value={deviceSort}
                  onChange={e => setDeviceSort(e.target.value)}
                  className="px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="name-asc">Nome A-Z</option>
                  <option value="name-desc">Nome Z-A</option>
                  <option value="status">Status</option>
                  <option value="battery">Bateria</option>
                </select>
              </div>
            )}

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
                {currentUser?.role !== 'viewer' && (
                  <button
                    className="btn btn-warning btn-lg mt-4"
                    onClick={() => setShowWipeQrModal(true)}
                    title="Formatar celular via USB"
                  >
                    <span>🔄</span>
                    Formatar
                  </button>
                )}
              </div>
            ) : (
              <>
                {paginatedDevices.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-white/60">Nenhum dispositivo encontrado para os filtros selecionados.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedDevices.map((device) => (
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
                        onRevert={() => sendMessage({ type: 'revert_device', deviceId: device.deviceId, timestamp: Date.now() })}
                        onSupportCountUpdate={supportCountUpdateTrigger}
                      />
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {filteredDevices.length > DEVICES_PER_PAGE && (
                  <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-3">
                    <span className="text-sm text-white/60">
                      Mostrando {(safePage - 1) * DEVICES_PER_PAGE + 1}-{Math.min(safePage * DEVICES_PER_PAGE, filteredDevices.length)} de {filteredDevices.length} dispositivos
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDevicePage(p => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface border border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      {Array.from({ length: totalDevicePages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setDevicePage(page)}
                          className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                            page === safePage
                              ? 'bg-primary text-white'
                              : 'bg-surface border border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => setDevicePage(p => Math.min(totalDevicePages, p + 1))}
                        disabled={safePage >= totalDevicePages}
                        className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface border border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Próximo
                      </button>
                    </div>
                  </div>
                )}
              </>
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
                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
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

                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
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
                        <div className="w-11 h-6 bg-[var(--border)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--surface)] after:border-[var(--border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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
                        <div className="w-11 h-6 bg-[var(--border)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--surface)] after:border-[var(--border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Senha de Administrador</h3>
                  
                  {/* Senha Atual */}
                <div className="mb-6 p-4 bg-[var(--surface)]/5 border border-white/20 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <div className="text-sm font-medium text-white">Senha Atual:</div>
                            <div className="text-lg font-mono text-white">
                                {currentAdminPassword ? (showPassword ? currentAdminPassword : '••••••••') : 'Não definida'}
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
                    <div className="bg-white border border-red-300 rounded-lg p-3">
                      <div className="text-xs">
                        <span className="font-bold text-red-600">📋 Instruções:</span>
                        <ul className="mt-1 list-disc list-inside space-y-1 text-red-600 font-bold">
                          <li>A senha será salva no servidor e enviada para todos os dispositivos</li>
                          <li>Será necessária para alterar o nome do dispositivo</li>
                          <li>O líder usa esta senha (4 dígitos) para desbloquear o celular na tela de cadeado</li>
                          <li>Dispositivos offline receberão a senha automaticamente quando se conectarem</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Modo Kiosk - Sempre Ativo (enviado automaticamente) */}
                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white" style={{display:'none'}}>
                  <h3 className="text-lg font-semibold text-white mb-4">Modo Kiosk</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Modo Kiosk</div>
                        <div className="text-xs text-white/80">Dispositivos restritos a apenas apps permitidos</div>
                      </div>
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full border border-green-500/30">Sempre Ativo</span>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Adicionar App Permitido (nome do pacote)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          id="kioskAppInput"
                          placeholder="com.example.app"
                          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const input = e.target as HTMLInputElement
                              const pkg = input.value.trim()
                              if (pkg && !kioskApps.includes(pkg)) {
                                setKioskApps([...kioskApps, pkg])
                                input.value = ''
                              }
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            const input = document.getElementById('kioskAppInput') as HTMLInputElement
                            const pkg = input?.value.trim()
                            if (pkg && !kioskApps.includes(pkg)) {
                              setKioskApps([...kioskApps, pkg])
                              input.value = ''
                            }
                          }}
                          className="btn btn-secondary !text-white border-white/30"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>

                    {kioskApps.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-white mb-2">Apps Permitidos:</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {kioskApps.map((app, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-[var(--surface)]/20 px-3 py-1.5 rounded-lg">
                              <span className="text-sm font-mono text-white">{app}</span>
                              <button
                                onClick={() => setKioskApps(kioskApps.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-300 text-sm ml-2"
                                title="Remover"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        const config = { enabled: true, apps: kioskApps }
                        localStorage.setItem('mdm_kiosk_config', JSON.stringify(config))
                        sendMessage({
                          type: 'set_kiosk_mode',
                          enabled: true,
                          allowedApps: kioskApps,
                          timestamp: Date.now()
                        })
                        showAlert('Configuração de Kiosk aplicada!')
                      }}
                      className="btn btn-primary w-full text-white"
                    >
                      <span>📱</span>
                      Aplicar Kiosk
                    </button>
                  </div>
                </div>

                {/* Papel de Parede */}
                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Papel de Parede</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        URL da Imagem
                      </label>
                      <input
                        type="text"
                        value={wallpaperUrl}
                        onChange={(e) => setWallpaperUrl(e.target.value)}
                        placeholder="https://exemplo.com/wallpaper.jpg"
                        className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </div>

                    {wallpaperUrl && (
                      <div>
                        <div className="text-sm font-medium text-white mb-2">Preview:</div>
                        <div className="border border-white/20 rounded-lg overflow-hidden inline-block">
                          <img
                            src={wallpaperUrl}
                            alt="Wallpaper preview"
                            className="max-w-[200px] max-h-[120px] object-cover"
                            onLoad={() => setWallpaperPreview(wallpaperUrl)}
                            onError={() => setWallpaperPreview('')}
                          />
                        </div>
                        {!wallpaperPreview && wallpaperUrl && (
                          <p className="text-xs text-red-400 mt-1">Não foi possível carregar a imagem</p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={async () => {
                        if (!wallpaperUrl.trim()) {
                          showAlert('Insira uma URL de imagem válida.')
                          return
                        }
                        localStorage.setItem('mdm_wallpaper_url', wallpaperUrl)
                        // Salvar no servidor para persistência
                        try {
                          const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
                          await fetch(`http://${wsHost}:3001/api/config/wallpaper`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: wallpaperUrl })
                          })
                        } catch {}
                        sendMessage({
                          type: 'set_wallpaper',
                          url: wallpaperUrl,
                          timestamp: Date.now()
                        })
                        showAlert('Papel de parede salvo e aplicado! Não mudará até você alterar.')
                      }}
                      className="btn btn-primary w-full text-white"
                    >
                      <span>🖼️</span>
                      Salvar e Aplicar
                    </button>
                  </div>
                </div>

                {/* Info: Dispositivos sem senha */}
                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Tela do Dispositivo</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Bloqueio de tela</div>
                        <div className="text-xs text-white/80">Dispositivos não possuem senha de bloqueio</div>
                      </div>
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full border border-green-500/30">Destravado</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">App inicial</div>
                        <div className="text-xs text-white/80">Ao ligar, o dispositivo abre direto no MDM Center</div>
                      </div>
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/30">MDM</span>
                    </div>
                    <div className="px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)]">
                      O dispositivo inicia sempre no MDM Center. A partir dele o usuário pode abrir os apps permitidos pelo Modo Kiosk.
                    </div>
                  </div>
                </div>

                {/* Backup */}
                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Backup</h3>
                  <div className="space-y-4">
                    <p className="text-sm text-white/70">Gera um backup completo das configurações e salva uma cópia no servidor automaticamente.</p>
                    {lastBackupFile && (
                      <div className="px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-xs text-green-400">
                        Último backup: <span className="font-mono">{lastBackupFile}</span>
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        const backup: Record<string, any> = {}
                        for (let i = 0; i < localStorage.length; i++) {
                          const key = localStorage.key(i)
                          if (key && key.startsWith('mdm_')) {
                            try { backup[key] = JSON.parse(localStorage.getItem(key)!) } catch { backup[key] = localStorage.getItem(key) }
                          }
                        }
                        const now = new Date()
                        const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
                        const filename = `mdm-backup-${dateStr}.json`
                        const jsonStr = JSON.stringify(backup, null, 2)

                        // Salvar cópia no servidor
                        try {
                          const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
                          await fetch(`http://${wsHost}:3001/api/backup`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename, data: backup })
                          })
                        } catch {}

                        // Download local
                        const blob = new Blob([jsonStr], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = filename
                        a.click()
                        URL.revokeObjectURL(url)

                        setLastBackupFile(filename)
                        localStorage.setItem('mdm_last_backup_file', filename)
                        showAlert(`Backup gerado: ${filename}\nCópia salva no servidor.`)
                      }}
                      className="btn btn-primary w-full text-white"
                    >
                      <span>💾</span>
                      Gerar Backup
                    </button>
                  </div>
                </div>
                {/* Perfis de Configuração removido - configurações são aplicadas globalmente */}
              </div>

              {/* Sidebar de Informações - texto branco */}
              <div className="space-y-6">
                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
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

                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Ações Rápidas</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowRestartConfirm(true)}
                      disabled={isRestarting}
                      className="btn w-full !bg-[var(--surface)]/20 !border-white/30 !text-white hover:!bg-[var(--surface)]/30 disabled:opacity-70"
                    >
                      <span>{isRestarting ? '⏳' : '🔄'}</span>
                      {isRestarting ? 'Reiniciando...' : 'Reiniciar Servidor'}
                    </button>
                    <button
                      onClick={() => setShowBackupConfirm(true)}
                      className="btn w-full !bg-[var(--surface)]/20 !border-white/30 !text-white hover:!bg-[var(--surface)]/30"
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

                <div className="card p-6 bg-[var(--surface)]/10 border border-white/20 text-white">
                  <h3 className="text-lg font-semibold text-white mb-4">Usuários do Sistema</h3>
                  <div className="space-y-3">
                    {adminUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)]/20 border border-white/10">
                        <div>
                          <p className="text-sm font-medium text-white">{user.name}</p>
                          <p className="text-xs text-white/60">{user.username} - {user.role}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteAdminUser(user.id, user.name)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                          title="Deletar usuário"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {adminUsers.length === 0 && (
                      <p className="text-xs text-white/50 text-center py-2">Nenhum usuário encontrado</p>
                    )}
                    <div className="border-t border-white/10 pt-3 mt-3 space-y-2">
                      <input
                        type="text"
                        placeholder="Usuário"
                        value={newAdminUser.username}
                        onChange={(e) => setNewAdminUser({ ...newAdminUser, username: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-white/20 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                      <input
                        type="text"
                        placeholder="Nome completo"
                        value={newAdminUser.name}
                        onChange={(e) => setNewAdminUser({ ...newAdminUser, name: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-white/20 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                      <input
                        type="password"
                        placeholder="Senha"
                        value={newAdminUser.password}
                        onChange={(e) => setNewAdminUser({ ...newAdminUser, password: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-white/20 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                      <button
                        onClick={handleAddAdminUser}
                        disabled={isAddingAdminUser}
                        className="btn w-full !bg-[var(--primary)] !text-white hover:!opacity-90 disabled:opacity-60"
                      >
                        {isAddingAdminUser ? 'Adicionando...' : 'Adicionar Usuário'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      case 'about':
        return <AboutPage devices={devices} wsConnected={isConnected} />
      default:
        return <Dashboard devices={devices} isConnected={isConnected} onViewChange={setCurrentView} />
    }
  }

  // If not authenticated, show login page
  if (!isAuthenticated) {
    return <LoginPage onLogin={(user) => handleLogin(user)} />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentView={currentView}
        onViewChange={setCurrentView}
        userName={currentUser?.name || currentUser?.username || 'Admin'}
        userRole={currentUser?.role || 'admin'}
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
          onLogout={handleLogout}
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
          userRole={currentUser?.role || 'admin'}
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

      {/* Install APK Modal */}
      {showInstallApkModal && installApkDeviceId && (() => {
        const isBulk = installApkDeviceId === '__bulk__'
        const installDevice = isBulk ? null : devices.find(d => d.deviceId === installApkDeviceId)
        const onlineDevices = devices.filter(d => d.status === 'online')
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6 max-w-md w-full mx-4 relative">
              <button
                type="button"
                onClick={() => {
                  setShowInstallApkModal(false)
                  setInstallApkDeviceId(null)
                  setInstallApkUrl('')
                }}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] transition-colors"
                title="Fechar"
              >
                ✕
              </button>
              <h3 className="text-lg font-semibold text-primary mb-1 pr-8">
                {isBulk ? 'Instalar App em Todos os Dispositivos' : 'Instalar Aplicativo Remotamente'}
              </h3>
              <p className="text-sm text-secondary mb-4">
                {isBulk
                  ? <>{onlineDevices.length} dispositivo{onlineDevices.length !== 1 ? 's' : ''} online receberão a instalação</>
                  : <>Dispositivo: <strong>{installDevice?.name || installApkDeviceId}</strong></>
                }
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">URL do APK</label>
                <input
                  type="text"
                  value={installApkUrl}
                  onChange={(e) => setInstallApkUrl(e.target.value)}
                  placeholder="URL do APK ou selecione abaixo"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isInstallingApk}
                />
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">Ações rápidas:</p>
                <div className="flex gap-2">
                  <button
                    className="btn btn-sm flex-1 !bg-blue-600/30 !border-blue-400/30 !text-white hover:!bg-blue-600/50"
                    onClick={() => setInstallApkUrl('/api/download-apk')}
                    disabled={isInstallingApk}
                  >
                    MDM Agent (Atualizar)
                  </button>
                  <button
                    className="btn btn-sm flex-1 !bg-green-600/30 !border-green-400/30 !text-white hover:!bg-green-600/50"
                    onClick={() => setInstallApkUrl('/api/download-wms')}
                    disabled={isInstallingApk}
                  >
                    WMS App
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn flex-1 !bg-[var(--surface-elevated)] !border-[var(--border)] !text-[var(--text-primary)] hover:!bg-[var(--border)]"
                  onClick={() => {
                    setShowInstallApkModal(false)
                    setInstallApkDeviceId(null)
                    setInstallApkUrl('')
                  }}
                  disabled={isInstallingApk}
                >
                  Cancelar
                </button>
                <button
                  className="btn flex-1 !bg-primary !border-primary !text-white hover:!bg-primary/80 disabled:opacity-50"
                  disabled={!installApkUrl.trim() || isInstallingApk}
                  onClick={async () => {
                    setIsInstallingApk(true)
                    try {
                      const res = await fetch('/api/update-app', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deviceIds: isBulk ? onlineDevices.map(d => d.deviceId) : [installApkDeviceId], apkUrl: installApkUrl, version: 'latest' })
                      })
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}))
                        throw new Error(data.error || 'Erro ao instalar aplicativo')
                      }
                      // Ativar barra de progresso na web
                      const targetId = isBulk ? (onlineDevices[0]?.deviceId || '__bulk__') : installApkDeviceId!
                      const targetDevice = devices.find(d => d.deviceId === targetId)
                      const targetName = isBulk ? `${onlineDevices.length} dispositivo(s)` : (targetDevice?.name || targetId)
                      setUpdateProgress({
                        deviceId: targetId,
                        deviceName: targetName,
                        progress: 0,
                        status: 'Enviando comando ao dispositivo...',
                        startTime: Date.now(),
                        startProgress: 0,
                        lastProgressTime: Date.now()
                      })
                      setShowInstallApkModal(false)
                      setInstallApkDeviceId(null)
                      setInstallApkUrl('')
                    } catch (err: any) {
                      showAlert(err.message || 'Erro ao instalar aplicativo')
                    } finally {
                      setIsInstallingApk(false)
                    }
                  }}
                >
                  {isInstallingApk ? 'Instalando...' : 'Instalar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* Confirmation modal for dangerous actions (requires typing CONFIRMAR) */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
          <div className="bg-[var(--surface)] rounded-xl p-6 w-full max-w-md border border-[var(--border)]">
            <div className="text-center mb-4">
              <span className="text-4xl">&#9888;&#65039;</span>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mt-2">{confirmAction.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{confirmAction.message}</p>
            </div>
            <input
              type="text"
              placeholder='Digite "CONFIRMAR"'
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className="w-full px-4 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setConfirmAction(null); setConfirmInput('') }} className="flex-1 px-4 py-2 bg-[var(--surface-elevated)] text-[var(--text-secondary)] rounded-lg">Cancelar</button>
              <button
                onClick={() => { if (confirmInput === 'CONFIRMAR') { confirmAction.callback(); setConfirmAction(null); setConfirmInput('') }}}
                disabled={confirmInput !== 'CONFIRMAR'}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${confirmInput === 'CONFIRMAR' ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
              >Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Formatar via USB */}
      {showWipeQrModal && (
        <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl shadow-2xl w-[460px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white">Formatar via USB</h2>
                <button onClick={() => setShowWipeQrModal(false)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
              </div>

              <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-xs mb-4">
                <p className="font-bold">ATENCAO: Esta acao apaga TODOS os dados do celular!</p>
              </div>

              <p className="text-xs text-gray-400 mb-4">Conecte o celular via cabo USB com depuracao USB ativada. Util quando o celular esta em boot loop ou sem rede.</p>

              <button
                onClick={async () => {
                  const wsHost = window.location.hostname || 'localhost'
                  try {
                    const checkRes = await fetch(`http://${wsHost}:3001/api/usb-devices`)
                    const checkData = await checkRes.json()
                    if (!checkData.devices || checkData.devices.length === 0) {
                      setToast({ message: 'Nenhum dispositivo USB detectado. Conecte o celular e ative depuracao USB.', type: 'error' })
                      return
                    }
                    const deviceInfo = checkData.devices.map((d: { serial: string; model: string }) => `${d.model} (${d.serial})`).join(', ')
                    if (!confirm(`Dispositivo(s) encontrado(s):\n${deviceInfo}\n\nTem certeza que deseja FORMATAR? Todos os dados serao apagados!`)) return

                    const res = await fetch(`http://${wsHost}:3001/api/usb-wipe`, { method: 'POST' })
                    const data = await res.json()
                    if (data.success) {
                      setToast({ message: data.message, type: 'success' })
                    } else {
                      setToast({ message: data.error || 'Falha ao formatar via USB', type: 'error' })
                    }
                  } catch (e) {
                    setToast({ message: 'Erro ao conectar com servidor. Verifique se o backend esta rodando.', type: 'error' })
                  }
                }}
                className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors mb-4"
              >
                Formatar via USB
              </button>

              <div className="p-3 rounded-lg bg-[#0d0d1a] border border-[#2a2a4a] text-xs text-gray-500 space-y-1">
                <p className="font-semibold text-gray-400">Requisitos:</p>
                <p>- Cabo USB conectado ao computador</p>
                <p>- Depuracao USB ativada no celular</p>
                <p>- ADB instalado no computador</p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal Progresso USB */}
      {addDeviceProgress.show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-2xl p-6 w-full max-w-md mx-4 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">
                {addDeviceProgress.status === 'loading' ? 'Instalando via USB...' : addDeviceProgress.status === 'success' ? 'Instalado!' : 'Erro'}
              </h2>
              {addDeviceProgress.status !== 'loading' && (
                <button onClick={() => setAddDeviceProgress(prev => ({ ...prev, show: false }))} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
              )}
            </div>
            {addDeviceProgress.status === 'loading' && (
              <div className="w-full bg-white/10 rounded-full h-2 mb-4 overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: `${Math.min(95, (addDeviceProgress.steps.length / 9) * 100)}%`, transition: 'width 0.5s ease' }} />
              </div>
            )}
            {addDeviceProgress.status === 'success' && (
              <div className="w-full bg-green-500/20 rounded-full h-2 mb-4">
                <div className="h-full bg-green-500 rounded-full w-full" />
              </div>
            )}
            {addDeviceProgress.status === 'error' && (
              <div className="w-full bg-red-500/20 rounded-full h-2 mb-4">
                <div className="h-full bg-red-500 rounded-full w-full" />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto space-y-1 mb-3">
              {addDeviceProgress.steps.map((step, i) => (
                <div key={i} className={`text-xs flex items-start gap-2 ${step.startsWith('OK:') || step.startsWith('✅') ? 'text-green-400' : step.startsWith('ERRO:') || step.startsWith('❌') ? 'text-red-400' : step.startsWith('AVISO:') ? 'text-yellow-400' : 'text-white/70'}`}>
                  <span className="mt-0.5 shrink-0">{step.startsWith('OK:') || step.startsWith('✅') ? '✅' : step.startsWith('ERRO:') || step.startsWith('❌') ? '❌' : step.startsWith('AVISO:') ? '⚠️' : i === addDeviceProgress.steps.length - 1 && addDeviceProgress.status === 'loading' ? '⏳' : '✔️'}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            {addDeviceProgress.message && (
              <p className={`text-sm font-medium ${addDeviceProgress.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {addDeviceProgress.status === 'success' ? '✅' : '❌'} {addDeviceProgress.message}
              </p>
            )}
            {addDeviceProgress.status === 'success' && (
              <p className="text-xs text-white/50 mt-2">O dispositivo aparecerá automaticamente na lista em alguns segundos.</p>
            )}
          </div>
        </div>
      )}

      {/* Modal QR Code MDM */}
      {showProvisioningQrModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center">
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl shadow-2xl w-[500px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white">QR Code MDM - Device Owner</h2>
                <button onClick={() => { setShowProvisioningQrModal(false); setProvQrImageUrl(null) }} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
              </div>

              <div className="p-3 rounded-lg bg-green-900/30 border border-green-500/30 text-green-400 text-xs mb-4">
                <p className="font-bold">Instala MDM + Device Owner automaticamente</p>
                <p className="mt-1 text-green-300/70">Controle total. Play Protect nao interfere.</p>
              </div>

              {/* WiFi config */}
              {(!provQrImageUrl || provQrImageUrl === 'loading') && (
                <div className="space-y-2 mb-4">
                  <label className="text-xs text-gray-400 font-medium">WiFi para o celular conectar durante o setup</label>
                  <input type="text" placeholder="Nome da rede WiFi (SSID)" id="prov-wifi-ssid"
                    className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg text-white text-sm placeholder-gray-500 focus:border-green-500 focus:outline-none" />
                  <input type="password" placeholder="Senha do WiFi" id="prov-wifi-password"
                    className="w-full px-3 py-2 bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg text-white text-sm placeholder-gray-500 focus:border-green-500 focus:outline-none" />
                  <button
                    onClick={() => {
                      const ssid = (document.getElementById('prov-wifi-ssid') as HTMLInputElement)?.value || ''
                      const password = (document.getElementById('prov-wifi-password') as HTMLInputElement)?.value || ''
                      if (!ssid) { setToast({ message: 'Informe o nome da rede WiFi!', type: 'error' }); return }
                      const wsHost = window.location.hostname || 'localhost'
                      const params = new URLSearchParams({ wifi_ssid: ssid, wifi_password: password, wifi_security: 'WPA', use_local: 'true' })
                      setProvQrImageUrl(`http://${wsHost}:3001/api/provisioning-qr-image?${params.toString()}&_t=${Date.now()}`)
                    }}
                    className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Gerar QR Code
                  </button>
                </div>
              )}

              {/* QR gerado */}
              {provQrImageUrl && provQrImageUrl !== 'loading' && (
                <div className="flex flex-col items-center">
                  <div className="bg-white p-4 rounded-xl">
                    <img src={provQrImageUrl} alt="QR Device Owner" style={{ width: 300, height: 300 }} />
                  </div>
                  <div className="mt-3 p-3 rounded-lg bg-[#0d0d1a] border border-[#2a2a4a] text-xs text-gray-400 space-y-1 w-full">
                    <p className="font-semibold text-white">Como usar:</p>
                    <p>1. Factory reset no celular</p>
                    <p>2. Na tela de boas-vindas, <span className="text-yellow-400 font-bold">toque 6 vezes rapido</span></p>
                    <p>3. O leitor QR abre - escaneie este codigo</p>
                    <p>4. Pronto! MDM instala e configura sozinho</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        const w = window.open('', '_blank', 'width=500,height=600')
                        if (w) {
                          w.document.write(`<html><head><title>QR Device Owner</title></head><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Arial,sans-serif;background:#fff;"><h2 style="margin:0 0 8px 0;">MDM Center - Device Owner</h2><p style="color:#666;margin:0 0 16px 0;font-size:13px;">6 toques na tela de boas-vindas</p><img src="${provQrImageUrl}" width="380" height="380" style="border-radius:10px;"/><div style="margin-top:12px;font-size:12px;color:#555;line-height:1.8;"><b>1.</b> Factory reset | <b>2.</b> 6 toques | <b>3.</b> Escaneie</div><button onclick="window.print()" style="margin-top:12px;padding:8px 24px;border:none;background:#16a34a;color:white;border-radius:8px;cursor:pointer;">Imprimir</button></body></html>`)
                          w.document.close()
                        }
                      }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                    >
                      Imprimir
                    </button>
                    <button onClick={() => setProvQrImageUrl(null)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                    >
                      Outro WiFi
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-2xl z-[200] flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`} style={{ animation: 'slideInFromBottom 0.3s ease-out' }}>
          <span>{toast.type === 'success' ? '\u2705' : '\u274C'}</span>
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  )
}