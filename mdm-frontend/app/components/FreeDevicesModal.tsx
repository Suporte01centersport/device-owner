'use client'

import { useState } from 'react'
import { Device, DeviceGroup } from '../types/device'

interface FreeDevicesModalProps {
  freeDevices: Device[]
  groups: DeviceGroup[]
  isOpen: boolean
  onClose: () => void
  onAssignDevice: (deviceId: string, groupId: string) => Promise<void>
}

export default function FreeDevicesModal({
  freeDevices,
  groups,
  isOpen,
  onClose,
  onAssignDevice
}: FreeDevicesModalProps) {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [assigning, setAssigning] = useState(false)

  const handleAssign = async () => {
    if (!selectedDevice || !selectedGroupId) return
    setAssigning(true)
    try {
      await onAssignDevice(selectedDevice.deviceId || selectedDevice.id, selectedGroupId)
      setSelectedDevice(null)
      setSelectedGroupId('')
    } catch (e) {
      console.error(e)
    } finally {
      setAssigning(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold text-primary">Dispositivos Livres</h3>
            <p className="text-sm text-secondary">
              Dispositivos que não estão em nenhum grupo. Atribua a um grupo para aplicar políticas.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl">
            ✕
          </button>
        </div>

        {freeDevices.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-4xl mb-2 block">✅</span>
            <p className="text-secondary">Todos os dispositivos já estão em grupos.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {freeDevices.map((device) => (
              <div
                key={device.deviceId || device.id}
                className={`p-4 border rounded-lg flex items-center justify-between ${
                  selectedDevice?.deviceId === device.deviceId ? 'border-primary bg-blue-500/150/15' : 'border-border hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-primary">{device.name}</span>
                    <span className={`badge ${device.status === 'online' ? 'badge-success' : 'badge-error'}`}>
                      {device.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <p className="text-sm text-secondary">{device.model} • {device.deviceId}</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedDevice?.deviceId === device.deviceId ? selectedGroupId : ''}
                    onChange={(e) => {
                      setSelectedDevice(device)
                      setSelectedGroupId(e.target.value)
                    }}
                    className="px-3 py-2 border border-border rounded-lg text-sm"
                  >
                    <option value="">Atribuir ao grupo...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  {selectedDevice?.deviceId === device.deviceId && selectedGroupId && (
                    <button
                      onClick={handleAssign}
                      disabled={assigning}
                      className="btn btn-primary btn-sm"
                    >
                      {assigning ? '...' : 'Atribuir'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
