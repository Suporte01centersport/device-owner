'use client'

import { useState, useEffect } from 'react'
import { DeviceGroup, Device, AppPolicy } from '../types/device'
import AppPolicyModal from '../components/AppPolicyModal'
import DeviceAssignmentModal from '../components/DeviceAssignmentModal'

export default function PoliciesPage() {
  const [groups, setGroups] = useState<DeviceGroup[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedGroup, setSelectedGroup] = useState<DeviceGroup | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAppPolicyModalOpen, setIsAppPolicyModalOpen] = useState(false)
  const [isDeviceAssignmentModalOpen, setIsDeviceAssignmentModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Estados para formulários
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    color: '#3B82F6'
  })
  
  const [newAppPolicy, setNewAppPolicy] = useState({
    packageName: '',
    appName: '',
    isAllowed: true,
    policyType: 'allow' as 'allow' | 'block' | 'require'
  })

  // Carregar dados iniciais
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Carregar grupos da API
      const groupsResponse = await fetch('/api/groups')
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json()
        if (groupsData.success) {
          setGroups(groupsData.data)
        }
      }
      
      // Dados mock para dispositivos - em produção seria uma chamada API
      const mockDevices: Device[] = [
        {
          id: '1',
          deviceId: 'DEV001',
          name: 'Samsung Galaxy S21',
          status: 'online',
          lastSeen: Date.now(),
          androidVersion: '11',
          model: 'SM-G991B',
          manufacturer: 'Samsung',
          apiLevel: 30,
          batteryLevel: 85,
          batteryStatus: 'Not charging',
          isCharging: false,
          storageTotal: 128000000000,
          storageUsed: 64000000000,
          memoryTotal: 8000000000,
          memoryUsed: 4000000000,
          cpuArchitecture: 'arm64-v8a',
          screenResolution: '1080x2400',
          screenDensity: 420,
          networkType: 'WiFi',
          isWifiEnabled: true,
          isBluetoothEnabled: true,
          isLocationEnabled: true,
          isDeveloperOptionsEnabled: false,
          isAdbEnabled: false,
          isUnknownSourcesEnabled: false,
          installedAppsCount: 25,
          isDeviceOwner: true,
          isProfileOwner: false,
          appVersion: '1.0.0',
          timezone: 'America/Sao_Paulo',
          language: 'pt',
          country: 'BR',
          restrictions: {
            wifiDisabled: false,
            bluetoothDisabled: false,
            cameraDisabled: false,
            statusBarDisabled: false,
            installAppsDisabled: false,
            uninstallAppsDisabled: false,
            settingsDisabled: false,
            systemNotificationsDisabled: false,
            screenCaptureDisabled: false,
            sharingDisabled: false,
            outgoingCallsDisabled: false,
            smsDisabled: false,
            userCreationDisabled: false,
            userRemovalDisabled: false
          }
        }
      ]

      setDevices(mockDevices)
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newGroup),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setGroups([...groups, result.data])
          setIsCreateModalOpen(false)
          setNewGroup({ name: '', description: '', color: '#3B82F6' })
        } else {
          alert('Erro ao criar grupo: ' + result.error)
        }
      } else {
        alert('Erro ao criar grupo')
      }
    } catch (error) {
      console.error('Erro ao criar grupo:', error)
      alert('Erro ao criar grupo')
    }
  }

  const handleEditGroup = (group: DeviceGroup) => {
    setSelectedGroup(group)
    setIsEditModalOpen(true)
  }

  const handleDeleteGroup = (groupId: string) => {
    if (window.confirm('Tem certeza que deseja deletar este grupo? Todos os dispositivos serão removidos do grupo.')) {
      setGroups(groups.filter(g => g.id !== groupId))
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

  const handleSaveAppPolicy = (policy: AppPolicy) => {
    if (!selectedGroup) return

    setGroups(groups.map(group => {
      if (group.id === selectedGroup.id) {
        const existingPolicyIndex = group.appPolicies.findIndex(p => p.id === policy.id)
        let updatedPolicies = [...group.appPolicies]
        
        if (existingPolicyIndex >= 0) {
          updatedPolicies[existingPolicyIndex] = policy
        } else {
          updatedPolicies.push(policy)
        }
        
        return {
          ...group,
          appPolicies: updatedPolicies,
          updatedAt: new Date().toISOString()
        }
      }
      return group
    }))
    
    setIsAppPolicyModalOpen(false)
  }

  const handleDeleteAppPolicy = (policyId: string) => {
    if (!selectedGroup) return

    setGroups(groups.map(group => {
      if (group.id === selectedGroup.id) {
        return {
          ...group,
          appPolicies: group.appPolicies.filter(p => p.id !== policyId),
          updatedAt: new Date().toISOString()
        }
      }
      return group
    }))
  }

  const handleAssignDevice = (deviceId: string, groupId: string) => {
    setGroups(groups.map(group => {
      if (group.id === groupId) {
        const device = devices.find(d => d.id === deviceId)
        if (device && !group.devices.find(d => d.id === deviceId)) {
          return {
            ...group,
            devices: [...group.devices, device],
            deviceCount: group.deviceCount + 1,
            updatedAt: new Date().toISOString()
          }
        }
      }
      return group
    }))
  }

  const handleRemoveDevice = (deviceId: string, groupId: string) => {
    setGroups(groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          devices: group.devices.filter(d => d.id !== deviceId),
          deviceCount: group.deviceCount - 1,
          updatedAt: new Date().toISOString()
        }
      }
      return group
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando políticas...</p>
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
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary"
        >
          <span>➕</span>
          Novo Grupo
        </button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl text-blue-600">📱</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Total de Grupos</p>
              <p className="text-2xl font-bold text-primary">{groups.length}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl text-green-600">🔗</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Dispositivos em Grupos</p>
              <p className="text-2xl font-bold text-primary">
                {groups.reduce((sum, group) => sum + group.deviceCount, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl text-yellow-600">📋</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Políticas de Apps</p>
              <p className="text-2xl font-bold text-primary">
                {groups.reduce((sum, group) => sum + group.appPolicies.length, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
              <span className="text-2xl text-purple-600">🎯</span>
            </div>
            <div>
              <p className="text-sm text-secondary">Dispositivos Livres</p>
              <p className="text-2xl font-bold text-primary">
                {devices.length - groups.reduce((sum, group) => sum + group.deviceCount, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Grupos */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div 
                  className="w-4 h-4 rounded-full mr-3"
                  style={{ backgroundColor: group.color }}
                ></div>
                <div>
                  <h3 className="text-lg font-semibold text-primary">{group.name}</h3>
                  <p className="text-sm text-secondary">{group.description}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleAssignDevices(group.id)}
                  className="btn btn-secondary btn-sm"
                >
                  <span>📱</span>
                  Dispositivos ({group.deviceCount})
                </button>
                <button 
                  onClick={() => handleAddAppPolicy(group.id)}
                  className="btn btn-secondary btn-sm"
                >
                  <span>📋</span>
                  Políticas ({group.appPolicies.length})
                </button>
                <button 
                  onClick={() => handleEditGroup(group)}
                  className="btn btn-secondary btn-sm"
                >
                  <span>✏️</span>
                  Editar
                </button>
                <button 
                  onClick={() => handleDeleteGroup(group.id)}
                  className="btn btn-error btn-sm"
                >
                  <span>🗑️</span>
                  Deletar
                </button>
              </div>
            </div>

            {/* Políticas de Aplicativos */}
            {group.appPolicies.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-secondary mb-2">Políticas de Aplicativos:</h4>
                <div className="flex flex-wrap gap-2">
                  {group.appPolicies.map((policy) => (
                    <span 
                      key={policy.id}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        policy.policyType === 'block' 
                          ? 'bg-red-100 text-red-800' 
                          : policy.policyType === 'require'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      <span className="mr-1">
                        {policy.policyType === 'block' ? '🚫' : policy.policyType === 'require' ? '✅' : '✓'}
                      </span>
                      {policy.appName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow">
              <span className="text-3xl">📋</span>
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Nenhum grupo criado</h3>
            <p className="text-secondary mb-6">
              Crie grupos para organizar seus dispositivos e definir políticas de aplicativos
            </p>
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="btn btn-primary btn-lg"
            >
              <span>➕</span>
              Criar Primeiro Grupo
            </button>
          </div>
        )}
      </div>

      {/* Modal de Criação de Grupo */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-primary mb-4">Criar Novo Grupo</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: Dispositivos Corporativos"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Descrição
                </label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={3}
                  placeholder="Descrição do grupo..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Cor do Grupo
                </label>
                <input
                  type="color"
                  value={newGroup.color}
                  onChange={(e) => setNewGroup({ ...newGroup, color: e.target.value })}
                  className="w-full h-10 border border-border rounded-lg"
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
