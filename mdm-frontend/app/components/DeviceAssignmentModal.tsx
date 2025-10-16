'use client'

import { useState, useEffect } from 'react'
import { DeviceGroup, Device } from '../types/device'

interface DeviceAssignmentModalProps {
  group: DeviceGroup | null
  devices: Device[]
  isOpen: boolean
  onClose: () => void
  onAssignDevice: (deviceId: string, groupId: string) => void
  onRemoveDevice: (deviceId: string, groupId: string) => void
}

export default function DeviceAssignmentModal({ 
  group, 
  devices, 
  isOpen, 
  onClose, 
  onAssignDevice, 
  onRemoveDevice 
}: DeviceAssignmentModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all')
  const [assignedDevices, setAssignedDevices] = useState<string[]>([])

  // Carregar dispositivos já atribuídos ao grupo
  useEffect(() => {
    if (group && isOpen) {
      const assigned = group.devices.map(device => device.id)
      setAssignedDevices(assigned)
    }
  }, [group, isOpen])

  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.deviceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.model.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'online' && device.status === 'online') ||
                         (filterStatus === 'offline' && device.status === 'offline')
    
    return matchesSearch && matchesStatus
  })

  const handleToggleDevice = (deviceId: string) => {
    if (assignedDevices.includes(deviceId)) {
      setAssignedDevices(assignedDevices.filter(id => id !== deviceId))
      onRemoveDevice(deviceId, group!.id)
    } else {
      setAssignedDevices([...assignedDevices, deviceId])
      onAssignDevice(deviceId, group!.id)
    }
  }

  const handleSelectAll = () => {
    const allDeviceIds = filteredDevices.map(device => device.id)
    const allSelected = allDeviceIds.every(id => assignedDevices.includes(id))
    
    if (allSelected) {
      // Desmarcar todos
      filteredDevices.forEach(device => {
        if (assignedDevices.includes(device.id)) {
          onRemoveDevice(device.id, group!.id)
        }
      })
      setAssignedDevices(assignedDevices.filter(id => !allDeviceIds.includes(id)))
    } else {
      // Marcar todos
      filteredDevices.forEach(device => {
        if (!assignedDevices.includes(device.id)) {
          onAssignDevice(device.id, group!.id)
        }
      })
      setAssignedDevices([...assignedDevices, ...allDeviceIds.filter(id => !assignedDevices.includes(id))])
    }
  }

  if (!isOpen || !group) return null

  const selectedCount = filteredDevices.filter(device => assignedDevices.includes(device.id)).length
  const totalCount = filteredDevices.length
  const allSelected = totalCount > 0 && selectedCount === totalCount

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold text-primary">
              Dispositivos do Grupo: {group.name}
            </h3>
            <p className="text-sm text-secondary">
              Gerencie quais dispositivos pertencem a este grupo
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar dispositivos por nome, ID ou modelo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="all">Todos os Status</option>
            <option value="online">Apenas Online</option>
            <option value="offline">Apenas Offline</option>
          </select>
        </div>

        {/* Seleção em massa */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  allSelected 
                    ? 'bg-primary text-white' 
                    : 'bg-white border border-border text-secondary hover:bg-gray-50'
                }`}
              >
                {allSelected ? 'Desmarcar Todos' : 'Marcar Todos'}
              </button>
              <span className="text-sm text-secondary">
                {selectedCount} de {totalCount} dispositivos selecionados
              </span>
            </div>
            <div className="text-sm text-secondary">
              {group.deviceCount} dispositivos no grupo
            </div>
          </div>
        )}

        {/* Lista de Dispositivos */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredDevices.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl mb-2 block">📱</span>
              <h4 className="text-lg font-medium text-primary mb-2">
                {searchTerm ? 'Nenhum dispositivo encontrado' : 'Nenhum dispositivo disponível'}
              </h4>
              <p className="text-secondary">
                {searchTerm 
                  ? 'Tente ajustar os filtros de busca' 
                  : 'Todos os dispositivos já estão em grupos'
                }
              </p>
            </div>
          ) : (
            filteredDevices.map((device) => (
              <div 
                key={device.id}
                className={`p-4 border rounded-lg transition-colors ${
                  assignedDevices.includes(device.id)
                    ? 'border-primary bg-blue-50'
                    : 'border-border bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={assignedDevices.includes(device.id)}
                      onChange={() => handleToggleDevice(device.id)}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">📱</span>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="font-medium text-primary">{device.name}</h5>
                        <span className={`badge ${
                          device.status === 'online' ? 'badge-success' : 'badge-error'
                        }`}>
                          {device.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="text-sm text-secondary space-y-1">
                        <p><strong>ID:</strong> {device.deviceId}</p>
                        <p><strong>Modelo:</strong> {device.model} - {device.manufacturer}</p>
                        <p><strong>Android:</strong> {device.androidVersion} (API {device.apiLevel})</p>
                        <p><strong>Bateria:</strong> {device.batteryLevel}% - {device.batteryStatus}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right text-sm text-secondary">
                    <div className="flex items-center gap-1 mb-1">
                      <span>📱</span>
                      <span>{device.installedAppsCount} apps</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>💾</span>
                      <span>{Math.round(device.storageUsed / device.storageTotal * 100)}% usado</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumo */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-primary">Total de Dispositivos:</span>
              <span className="ml-2 text-secondary">{devices.length}</span>
            </div>
            <div>
              <span className="font-medium text-primary">No Grupo:</span>
              <span className="ml-2 text-secondary">{group.deviceCount}</span>
            </div>
            <div>
              <span className="font-medium text-primary">Disponíveis:</span>
              <span className="ml-2 text-secondary">{devices.length - group.deviceCount}</span>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-3 mt-6">
          <button 
            onClick={onClose}
            className="btn btn-primary flex-1"
          >
            <span>✅</span>
            Concluir
          </button>
          <button 
            onClick={() => {
              setSearchTerm('')
              setFilterStatus('all')
            }}
            className="btn btn-secondary"
          >
            <span>🔄</span>
            Limpar Filtros
          </button>
        </div>
      </div>
    </div>
  )
}

