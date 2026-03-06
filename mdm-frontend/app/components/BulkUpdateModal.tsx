'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'

interface BulkUpdateModalProps {
  devices: Device[]
  isOpen: boolean
  onClose: () => void
  onBulkUpdateMdm: (deviceIds: string[]) => Promise<void>
}

export default function BulkUpdateModal({ devices, isOpen, onClose, onBulkUpdateMdm }: BulkUpdateModalProps) {
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Filtrar apenas dispositivos online
  const onlineDevices = devices.filter(d => d.status === 'online')
  const offlineDevices = devices.filter(d => d.status !== 'online')

  useEffect(() => {
    if (isOpen) {
      setSelectedDevices(new Set())
      setSelectAll(false)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, isLoading, onClose])

  if (!isOpen) return null

  const handleToggleDevice = (deviceId: string) => {
    const newSelected = new Set(selectedDevices)
    if (newSelected.has(deviceId)) newSelected.delete(deviceId)
    else newSelected.add(deviceId)
    setSelectedDevices(newSelected)
    setSelectAll(newSelected.size === onlineDevices.length)
  }

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedDevices(new Set())
      setSelectAll(false)
    } else {
      setSelectedDevices(new Set(onlineDevices.map(d => d.deviceId)))
      setSelectAll(true)
    }
  }

  const handleUpdateMdm = async () => {
    if (selectedDevices.size === 0) {
      alert('⚠️ Selecione pelo menos um dispositivo.')
      return
    }
    setIsLoading(true)
    try {
      await onBulkUpdateMdm(Array.from(selectedDevices))
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📥 Atualização em Massa</h2>
          <button onClick={onClose} className="modal-close" disabled={isLoading}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-md font-semibold text-gray-900 mb-2">📶 Atualização via WiFi</h3>
            <p className="text-sm text-gray-700">
              O MDM será compilado e enviado para os dispositivos selecionados pela rede. Não é necessário conectar via USB.
            </p>
          </div>

          {/* Device Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold text-gray-900">
                📱 Selecionar Dispositivos ({selectedDevices.size} de {onlineDevices.length} selecionados)
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading || onlineDevices.length === 0}
                />
                <span className="text-sm font-medium text-gray-800">Selecionar Todos</span>
              </label>
            </div>

            {/* Online Devices List */}
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white">
              {onlineDevices.length === 0 ? (
                <div className="text-center py-8 text-gray-700">
                  <p className="text-lg mb-2 font-medium">🔴 Nenhum dispositivo online</p>
                  <p className="text-sm">Aguarde dispositivos se conectarem</p>
                </div>
              ) : (
                onlineDevices.map((device) => (
                  <label
                    key={device.deviceId}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedDevices.has(device.deviceId)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDevices.has(device.deviceId)}
                      onChange={() => handleToggleDevice(device.deviceId)}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{device.name}</span>
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                          🟢 Online
                        </span>
                        {device.isDeviceOwner && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                            Device Owner
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700 mt-1">
                        {device.model} • Android {device.androidVersion} • Bateria: {device.batteryLevel}%
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Offline Devices Info */}
            {offlineDevices.length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>ℹ️ {offlineDevices.length} dispositivo(s) offline:</strong>
                  <span className="ml-2 text-xs text-gray-700">
                    {offlineDevices.map(d => d.name).join(', ')}
                  </span>
                </p>
                <p className="text-xs text-gray-700 mt-1">
                  Dispositivos offline não podem ser atualizados no momento
                </p>
              </div>
            )}
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
            <strong>⚠️ Atenção:</strong>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>Os dispositivos precisam estar <strong>online</strong>.</li>
              <li>O build do MDM pode levar 1–2 minutos. O download acontece depois.</li>
              <li>O download consumirá Wi-Fi dos dispositivos.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary" disabled={isLoading}>Cancelar</button>
          <button 
            onClick={handleUpdateMdm}
            className="btn btn-success"
            disabled={isLoading || selectedDevices.size === 0}
          >
            {isLoading 
              ? '📦 Compilando e enviando...' 
              : `📥 Atualizar MDM em ${selectedDevices.size} Dispositivo${selectedDevices.size !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </div>
  )
}

