'use client'

import { useState, useEffect } from 'react'
import { DeviceGroup, Device, AppPolicy } from '../types/device'
import AppPolicyModal from '../components/AppPolicyModal'
import DeviceAssignmentModal from '../components/DeviceAssignmentModal'
import GroupModal from '../components/GroupModal'
import FreeDevicesModal from '../components/FreeDevicesModal'
import PoliciesOverviewModal from '../components/PoliciesOverviewModal'
import { showAlert, showConfirm } from '../lib/dialog'

export default function PoliciesPage() {
  const [groups, setGroups] = useState<DeviceGroup[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedGroup, setSelectedGroup] = useState<DeviceGroup | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAppPolicyModalOpen, setIsAppPolicyModalOpen] = useState(false)
  const [isDeviceAssignmentModalOpen, setIsDeviceAssignmentModalOpen] = useState(false)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [isFreeDevicesModalOpen, setIsFreeDevicesModalOpen] = useState(false)
  const [isPoliciesOverviewModalOpen, setIsPoliciesOverviewModalOpen] = useState(false)
  const [freeDevices, setFreeDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [groupStats, setGroupStats] = useState<Record<string, any>>({})
  const [filterGroupId, setFilterGroupId] = useState<string>('')

  // Estados para formulários
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    color: '#3B82F6'
  })
  const [createGroupError, setCreateGroupError] = useState<string | null>(null)
  
  const [newAppPolicy, setNewAppPolicy] = useState({
    packageName: '',
    appName: '',
    isAllowed: true,
    policyType: 'allow' as 'allow' | 'block' | 'require'
  })

  // Estado de restrições por grupo
  const [restrictionsGroupId, setRestrictionsGroupId] = useState<string>('')
  const [deviceRestrictions, setDeviceRestrictions] = useState({
    lockScreen: true,
    statusBarDisabled: false,
    wifiDisabled: false,
    bluetoothDisabled: false,
    cameraDisabled: false,
    screenshotDisabled: false,
    installAppsDisabled: true,
    uninstallAppsDisabled: true,
    settingsDisabled: true,
    factoryResetDisabled: true,
    usbDisabled: false,
    nfcDisabled: false,
    hotspotDisabled: false,
    locationDisabled: false,
    developerOptionsDisabled: true,
    autoTimeRequired: true,
  })
  const [isSavingRestrictions, setIsSavingRestrictions] = useState(false)

  // Carregar dados iniciais
  useEffect(() => {
    loadData()
  }, [])

  // Limpar erro ao abrir modal de criar grupo
  useEffect(() => {
    if (isCreateModalOpen) setCreateGroupError(null)
  }, [isCreateModalOpen])

  // Carregar dispositivos livres ao abrir modal
  useEffect(() => {
    if (isFreeDevicesModalOpen) {
      fetch('/api/devices/free')
        .then((r) => r.json())
        .then((res) => res.success && Array.isArray(res.data) && setFreeDevices(res.data))
        .catch(() => setFreeDevices([]))
    }
  }, [isFreeDevicesModalOpen])

  // Mapeamento de ícones por nome do grupo
  const getGroupIcon = (name: string) => {
    const n = (name || '').toLowerCase()
    if (n.includes('full')) return <span className="text-blue-500">⚡</span>
    if (n.includes('separação') || n.includes('pedidos')) return '📦'
    if (n.includes('estoque')) return '📱'
    return '📋'
  }

  const loadData = async () => {
    try {
      setLoading(true)

      // Carregar grupos da API
      const groupsResponse = await fetch('/api/groups')
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json()
        if (groupsData.success) {
          setGroups(groupsData.data)
          // Buscar estatísticas por grupo em paralelo
          const statsEntries = await Promise.all(
            (groupsData.data as DeviceGroup[]).map(async (g: any) => {
              try {
                const res = await fetch(`/api/groups/${g.id}/stats`)
                if (!res.ok) return [g.id, null]
                const json = await res.json()
                return [g.id, json.data]
              } catch {
                return [g.id, null]
              }
            })
          )
          setGroupStats(Object.fromEntries(statsEntries))
        }
      }
      
      // Carregar dispositivos: tenta API (PostgreSQL) primeiro, fallback para WebSocket (memória)
      let devicesList: Device[] = []
      const devicesResponse = await fetch('/api/devices')
      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json()
        if (devicesData.success && Array.isArray(devicesData.data)) {
          devicesList = devicesData.data
        }
      }
      // Fallback: se API falhou (ex: PostgreSQL), buscar do WebSocket (dispositivos conectados)
      if (devicesList.length === 0) {
        try {
          const wsHost = typeof window !== 'undefined' ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'localhost' : window.location.hostname) : 'localhost'
          const realtimeRes = await fetch(`http://${wsHost}:3001/api/devices/status`)
          if (realtimeRes.ok) {
            const json = await realtimeRes.json()
            if (json.devices && Array.isArray(json.devices)) {
              devicesList = json.devices.map((d: any) => ({
                id: d.deviceId,
                deviceId: d.deviceId,
                name: d.name || d.model || 'Dispositivo',
                status: d.status || 'offline',
                lastSeen: d.lastSeen || Date.now(),
                model: d.model || '',
                manufacturer: d.manufacturer || '',
                batteryLevel: d.batteryLevel || 0,
                restrictions: d.restrictions || {},
                ...d
              }))
            }
          }
        } catch (e) {
          console.warn('Fallback WebSocket para dispositivos falhou:', e)
        }
      }
      setDevices(devicesList)
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    setCreateGroupError(null)
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newGroup),
      })

      const result = await response.json().catch(() => ({}))
      if (response.ok && result.success) {
        setGroups([...groups, result.data])
        setIsCreateModalOpen(false)
        setNewGroup({ name: '', description: '', color: '#3B82F6' })
        setCreateGroupError(null)
      } else {
        let msg = result.detail || result.error || 'Erro ao criar grupo'
        if (msg.includes('autentica') && msg.includes('senha')) {
          msg = 'Erro de conexão com o banco. Verifique DB_USER e DB_PASSWORD no arquivo .env.development (ou .env.local).'
        }
        setCreateGroupError(msg)
      }
    } catch (error) {
      console.error('Erro ao criar grupo:', error)
      setCreateGroupError('Erro ao conectar. Verifique se o servidor está rodando.')
    }
  }

  const handleEditGroup = (group: DeviceGroup) => {
    setSelectedGroup(group)
    setIsEditModalOpen(true)
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!await showConfirm('Tem certeza que deseja deletar este grupo? Todos os dispositivos serão removidos do grupo.')) return
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showAlert(`Erro ao deletar grupo${data?.detail ? `: ${data.detail}` : ''}`)
        return
      }
      setGroups(groups.filter(g => g.id !== groupId))
    } catch (e) {
      console.error('Erro ao deletar grupo:', e)
      showAlert('Erro ao deletar grupo')
    }
  }

  const handleAddAppPolicy = (groupId: string) => {
    setSelectedGroup(groups.find(g => g.id === groupId) || null)
    setIsAppPolicyModalOpen(true)
  }

  const handleAssignDevices = (groupId: string) => {
    setSelectedGroup(groups.find(g => g.id === groupId) || null)
    setIsDeviceAssignmentModalOpen(true)
  }

  const handleSaveAppPolicy = async (policy: AppPolicy) => {
    if (!selectedGroup) return

    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageName: policy.packageName,
          appName: policy.appName,
          policyType: policy.policyType || 'allow'
        })
      })
      const result = await res.json()
      if (!res.ok) {
        showAlert(result.detail || result.error || 'Erro ao salvar política')
        return
      }
      const saved = result.data
      setGroups(groups.map(group => {
        if (group.id === selectedGroup.id) {
          const existing = group.appPolicies.findIndex(p => p.packageName === policy.packageName)
          const updatedPolicies = existing >= 0
            ? group.appPolicies.map((p, i) => i === existing ? { ...policy, id: saved.id?.toString?.() || saved.id } : p)
            : [...group.appPolicies, { ...policy, id: saved.id?.toString?.() || saved.id }]
          return { ...group, appPolicies: updatedPolicies, updatedAt: new Date().toISOString() }
        }
        return group
      }))
      setIsAppPolicyModalOpen(false)
    } catch (e) {
      console.error('Erro ao salvar política:', e)
      showAlert('Erro ao salvar política. Verifique a conexão.')
    }
  }

  const handleDeleteAppPolicy = async (policyId: string) => {
    if (!selectedGroup) return
    const policy = selectedGroup.appPolicies.find(p => p.id === policyId || p.packageName === policyId)
    const packageName = policy?.packageName || policyId
    if (!packageName) return

    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/policies?packageName=${encodeURIComponent(packageName)}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        showAlert(result.detail || result.error || 'Erro ao remover política')
        return
      }
      setGroups(groups.map(group => {
        if (group.id === selectedGroup.id) {
          return {
            ...group,
            appPolicies: group.appPolicies.filter(p => p.packageName !== packageName),
            updatedAt: new Date().toISOString()
          }
        }
        return group
      }))
    } catch (e) {
      console.error('Erro ao remover política:', e)
      showAlert('Erro ao remover política. Verifique a conexão.')
    }
  }

  const handleAssignDevice = async (deviceId: string, groupId: string) => {
    try {
      const device = devices.find(d => d.id === deviceId || d.deviceId === deviceId)
      if (!device) {
        showAlert('Dispositivo não encontrado')
        return
      }
      const response = await fetch(`/api/groups/${groupId}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.deviceId })
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        showAlert(`Erro ao adicionar dispositivo: ${errData?.error || errData?.detail || 'Verifique se o PostgreSQL está configurado em .env.development'}`)
        return
      }
      // sucesso: atualizar estado local
      const updatedGroups = groups.map(group => {
        if (group.id === groupId) {
          if (!group.devices.find(d => (d as any).id === deviceId || (d as any).deviceId === deviceId)) {
            const updated = {
              ...group,
              devices: [...group.devices, device],
              deviceCount: group.deviceCount + 1,
              updatedAt: new Date().toISOString()
            }
            if (selectedGroup?.id === groupId) setSelectedGroup(updated)
            return updated
          }
        }
        return group
      })
      setGroups(updatedGroups)
    } catch (e) {
      console.error('Erro ao atribuir dispositivo ao grupo:', e)
    }
  }

  const handleRemoveDevice = async (deviceId: string, groupId: string) => {
    try {
      const device = devices.find(d => d.id === deviceId || d.deviceId === deviceId)
      if (!device) return
      const response = await fetch(`/api/groups/${groupId}/devices?deviceId=${encodeURIComponent(device.deviceId)}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        showAlert(`Erro ao remover dispositivo: ${errData?.error || errData?.detail || 'Verifique o PostgreSQL'}`)
        return
      }
      // sucesso: atualizar estado local
      const updatedGroups = groups.map(group => {
        if (group.id === groupId) {
          const updated = {
            ...group,
            devices: group.devices.filter(d => (d as any).id !== deviceId && (d as any).deviceId !== device.deviceId),
            deviceCount: group.deviceCount - 1,
            updatedAt: new Date().toISOString()
          }
          if (selectedGroup?.id === groupId) setSelectedGroup(updated)
          return updated
        }
        return group
      })
      setGroups(updatedGroups)
    } catch (e) {
      console.error('Erro ao remover dispositivo do grupo:', e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4"></div>
          <p className="text-secondary">Carregando políticas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">Políticas e Grupos</h1>
          <p className="text-secondary mt-1">Gerencie grupos de dispositivos e suas políticas de aplicativos</p>
        </div>
        <div className="flex gap-3 items-center">
          <select
            value={filterGroupId}
            onChange={(e) => setFilterGroupId(e.target.value)}
            className="px-4 py-2 border border-primary rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-primary text-white min-w-[200px] font-medium"
            title="Filtrar por grupo"
          >
            <option value="">Todos os grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {getGroupIcon(g.name)} {g.name}
              </option>
            ))}
          </select>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary"
          >
            <span>➕</span>
            Novo Grupo
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl">📱</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Total de Grupos</p>
              <p className="text-2xl font-bold text-primary">{groups.length}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl">🔗</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Dispositivos em Grupos</p>
              <p className="text-2xl font-bold text-primary">
                {groups.reduce((sum, group) => sum + group.deviceCount, 0)}
              </p>
            </div>
          </div>
        </div>

        <div
          className="card p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setIsPoliciesOverviewModalOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setIsPoliciesOverviewModalOpen(true)}
        >
          <div className="flex items-center">
            <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl">📋</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Políticas de Apps</p>
              <p className="text-2xl font-bold text-primary">
                {groups.reduce((sum, group) => sum + (group.appPolicies?.length || 0), 0)}
              </p>
              <p className="text-xs text-secondary mt-1">Clique para gerenciar</p>
            </div>
          </div>
        </div>

        <div
          className="card p-6 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setIsFreeDevicesModalOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setIsFreeDevicesModalOpen(true)}
        >
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl">🎯</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Dispositivos Livres</p>
              <p className="text-2xl font-bold text-primary">
                {devices.length - groups.reduce((sum, group) => sum + group.deviceCount, 0)}
              </p>
              <p className="text-xs text-secondary mt-1">Clique para atribuir</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Grupos - layout em cubos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {(filterGroupId ? groups.filter((g) => g.id === filterGroupId) : groups).map((group) => (
          <div
            key={group.id}
            className="card p-6 aspect-square flex flex-col justify-between hover:shadow-lg cursor-pointer !bg-primary border-primary text-white"
            onClick={() => { setSelectedGroup(group); setIsGroupModalOpen(true) }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start">
                <div 
                  className="w-12 h-12 rounded-xl mr-3 flex items-center justify-center text-2xl bg-white/20 border-2 border-white/50"
                >
                  {getGroupIcon(group.name)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{group.name}</h3>
                  <p className="text-sm text-white/90">{group.description}</p>
                </div>
              </div>
              <div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id) }}
                  className="btn btn-error btn-sm"
                >
                  <span>🗑️</span>
                  Deletar
                </button>
              </div>
            </div>

            {/* Info do grupo */}
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded bg-white/20">
                <div className="text-white/90">Dispositivos</div>
                <div className="text-lg font-semibold text-white">{group.deviceCount}</div>
              </div>
              <div className="p-3 rounded bg-white/20">
                <div className="text-white/90">Políticas</div>
                <div className="text-lg font-semibold text-white">{group.appPolicies.length}</div>
              </div>
              <div className="p-3 rounded bg-white/20">
                <div className="text-white/90">Média Bateria</div>
                <div className="text-lg font-semibold text-white">{Math.round(Number(groupStats[group.id]?.avg_battery_level || 0))}%</div>
              </div>
              <div className="p-3 rounded bg-white/20">
                <div className="text-white/90">Total / Online</div>
                <div className="text-lg font-semibold text-white">
                  {Number(groupStats[group.id]?.total_devices || group.deviceCount)} / {Number(groupStats[group.id]?.online_devices || 0)}
                </div>
              </div>
            </div>
          </div>
        ))}

        {filterGroupId && groups.filter((g) => g.id === filterGroupId).length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className="text-secondary">Nenhum grupo encontrado com o filtro selecionado.</p>
            <button
              onClick={() => setFilterGroupId('')}
              className="btn btn-secondary mt-4"
            >
              Limpar filtro
            </button>
          </div>
        )}
      </div>

      {/* Seção de Restrições de Dispositivo */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-primary">Restrições de Dispositivo</h2>
              <p className="text-sm text-secondary mt-1">Controle as funcionalidades bloqueadas nos dispositivos conectados.</p>
            </div>
            {groups.length > 0 && (
              <select
                value={restrictionsGroupId}
                onChange={(e) => setRestrictionsGroupId(e.target.value)}
                className="px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--surface-elevated)] text-[var(--text-primary)] min-w-[240px] font-medium focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              >
                <option value="">Todos os dispositivos</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.deviceCount})
                  </option>
                ))}
              </select>
            )}
          </div>

            <div className="card p-6 space-y-6">
              {/* Segurança */}
              <div>
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>🛡️</span> Segurança
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'lockScreen', label: 'Tela de Bloqueio', desc: 'Habilitar bloqueio remoto do dispositivo', icon: '🔒' },
                    { key: 'screenshotDisabled', label: 'Bloquear Screenshots', desc: 'Impedir capturas e gravações de tela', icon: '📸' },
                    { key: 'factoryResetDisabled', label: 'Bloquear Reset de Fábrica', desc: 'Impedir restauração de fábrica', icon: '🏭' },
                    { key: 'developerOptionsDisabled', label: 'Bloquear Opções de Dev', desc: 'Impedir acesso às opções de desenvolvedor', icon: '🛠️' },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xl flex-shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
                          <div className="text-xs text-[var(--text-muted)] truncate">{item.desc}</div>
                        </div>
                      </div>
                      <div className="relative flex-shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={(deviceRestrictions as any)[item.key]}
                          onChange={(e) => setDeviceRestrictions({ ...deviceRestrictions, [item.key]: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/20 rounded-full peer peer-checked:bg-[var(--primary)] transition-colors"></div>
                        <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Conectividade */}
              <div>
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>📡</span> Conectividade
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'wifiDisabled', label: 'Bloquear Config. WiFi', desc: 'Impedir alteração de redes WiFi', icon: '📶' },
                    { key: 'bluetoothDisabled', label: 'Bloquear Bluetooth', desc: 'Impedir pareamento Bluetooth', icon: '🔵' },
                    { key: 'hotspotDisabled', label: 'Bloquear Hotspot', desc: 'Impedir compartilhamento de internet', icon: '📡' },
                    { key: 'nfcDisabled', label: 'Bloquear NFC', desc: 'Desativar comunicação por NFC', icon: '📲' },
                    { key: 'usbDisabled', label: 'Bloquear USB', desc: 'Impedir transferência de dados via USB', icon: '🔌' },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xl flex-shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
                          <div className="text-xs text-[var(--text-muted)] truncate">{item.desc}</div>
                        </div>
                      </div>
                      <div className="relative flex-shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={(deviceRestrictions as any)[item.key]}
                          onChange={(e) => setDeviceRestrictions({ ...deviceRestrictions, [item.key]: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/20 rounded-full peer peer-checked:bg-[var(--primary)] transition-colors"></div>
                        <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Sistema */}
              <div>
                <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>⚙️</span> Sistema
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'statusBarDisabled', label: 'Bloquear Barra de Status', desc: 'Impedir acesso ao painel de notificações', icon: '📊' },
                    { key: 'settingsDisabled', label: 'Bloquear Configurações', desc: 'Impedir acesso ao app de Configurações', icon: '⚙️' },
                    { key: 'installAppsDisabled', label: 'Bloquear Instalação de Apps', desc: 'Impedir instalar novos aplicativos', icon: '📦' },
                    { key: 'uninstallAppsDisabled', label: 'Bloquear Desinstalação', desc: 'Impedir remover aplicativos', icon: '🗑️' },
                    { key: 'cameraDisabled', label: 'Bloquear Câmera', desc: 'Desativar câmera do dispositivo', icon: '📷' },
                    { key: 'locationDisabled', label: 'Bloquear Config. Localização', desc: 'Impedir alteração de configuração GPS', icon: '📍' },
                    { key: 'autoTimeRequired', label: 'Forçar Hora Automática', desc: 'Impedir alteração manual de data/hora', icon: '🕐' },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xl flex-shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
                          <div className="text-xs text-[var(--text-muted)] truncate">{item.desc}</div>
                        </div>
                      </div>
                      <div className="relative flex-shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={(deviceRestrictions as any)[item.key]}
                          onChange={(e) => setDeviceRestrictions({ ...deviceRestrictions, [item.key]: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/20 rounded-full peer peer-checked:bg-[var(--primary)] transition-colors"></div>
                        <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Botão Aplicar */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
                <button
                  onClick={async () => {
                    setIsSavingRestrictions(true)
                    try {
                      const wsHost = typeof window !== 'undefined' ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'localhost' : window.location.hostname) : 'localhost'
                      let url: string
                      let targetName: string
                      if (restrictionsGroupId) {
                        const group = groups.find(g => g.id === restrictionsGroupId)
                        url = `http://${wsHost}:3001/api/groups/${restrictionsGroupId}/send-restrictions`
                        targetName = group?.name || 'grupo'
                      } else {
                        url = `http://${wsHost}:3001/api/devices/send-restrictions`
                        targetName = 'todos os dispositivos'
                      }
                      const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ restrictions: deviceRestrictions })
                      })
                      if (res.ok) {
                        const result = await res.json()
                        showAlert(`Restrições aplicadas a ${result.sent || 0} dispositivo(s) de "${targetName}"`)
                      } else {
                        showAlert('Erro ao aplicar restrições. Verifique se o servidor WebSocket está rodando.')
                      }
                    } catch (error) {
                      console.error('Erro ao salvar restrições:', error)
                      showAlert('Erro ao conectar com o servidor.')
                    } finally {
                      setIsSavingRestrictions(false)
                    }
                  }}
                  disabled={isSavingRestrictions}
                  className="px-6 py-2.5 bg-[var(--primary)] text-black font-semibold rounded-lg hover:opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSavingRestrictions ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                      Aplicando...
                    </>
                  ) : (
                    <>
                      Aplicar {restrictionsGroupId ? `ao grupo "${groups.find(g => g.id === restrictionsGroupId)?.name}"` : 'a todos os dispositivos'}
                    </>
                  )}
                </button>
              </div>
            </div>
        </div>

      {/* Modal do Grupo */}
      <GroupModal
        group={selectedGroup}
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        onAddDevices={() => setIsDeviceAssignmentModalOpen(true)}
        onAddPolicy={() => setIsAppPolicyModalOpen(true)}
      />

      {/* Modal de Criação de Grupo */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Criar Novo Grupo</h3>
              <button
                onClick={() => { setIsCreateModalOpen(false); setCreateGroupError(null) }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none"
              >
                ✕
              </button>
            </div>
            {createGroupError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex justify-between items-start gap-2">
                <p className="text-sm text-red-400 flex-1">{createGroupError}</p>
                <button
                  onClick={() => setCreateGroupError(null)}
                  className="text-red-400 hover:text-red-300 shrink-0"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  placeholder="Ex: Dispositivos Corporativos"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Descrição
                </label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  rows={3}
                  placeholder="Descrição do grupo..."
                  spellCheck="false"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Cor do Grupo
                </label>
                <input
                  type="color"
                  value={newGroup.color}
                  onChange={(e) => setNewGroup({ ...newGroup, color: e.target.value })}
                  className="w-full h-10 border border-[var(--border)] rounded-lg bg-[var(--surface-elevated)]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateGroup}
                className="btn btn-primary flex-1"
                disabled={!newGroup.name.trim()}
              >
                <span>➕</span>
                Criar Grupo
              </button>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Políticas de Aplicativos */}
      <AppPolicyModal
        group={selectedGroup}
        isOpen={isAppPolicyModalOpen}
        onClose={() => setIsAppPolicyModalOpen(false)}
        onSave={handleSaveAppPolicy}
        onDelete={handleDeleteAppPolicy}
      />

      {/* Modal de Atribuição de Dispositivos */}
      <DeviceAssignmentModal
        group={selectedGroup}
        devices={devices}
        isOpen={isDeviceAssignmentModalOpen}
        onClose={() => setIsDeviceAssignmentModalOpen(false)}
        onAssignDevice={handleAssignDevice}
        onRemoveDevice={handleRemoveDevice}
      />
    </div>
  )
}
