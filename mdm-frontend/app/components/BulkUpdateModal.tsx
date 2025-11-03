'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'

interface BulkUpdateModalProps {
  devices: Device[]
  isOpen: boolean
  onClose: () => void
  onConfirm: (deviceIds: string[], apkUrl: string, version: string) => void
}

export default function BulkUpdateModal({ devices, isOpen, onClose, onConfirm }: BulkUpdateModalProps) {
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [apkUrl, setApkUrl] = useState('https://github.com/suporte04centersport/qrcode/releases/download/v1/app-debug.apk')
  const [version, setVersion] = useState('1.0.1')
  const [isLoading, setIsLoading] = useState(false)

  // Filtrar apenas dispositivos online
  const onlineDevices = devices.filter(d => d.status === 'online')
  const offlineDevices = devices.filter(d => d.status !== 'online')

  useEffect(() => {
    if (isOpen) {
      // Resetar seleção ao abrir
      setSelectedDevices(new Set())
      setSelectAll(false)
    }
  }, [isOpen])

  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, isLoading, onClose])

  if (!isOpen) return null

  const handleToggleDevice = (deviceId: string) => {
    const newSelected = new Set(selectedDevices)
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId)
    } else {
      newSelected.add(deviceId)
    }
    setSelectedDevices(newSelected)
    setSelectAll(newSelected.size === onlineDevices.length)
  }

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedDevices(new Set())
      setSelectAll(false)
    } else {
      const allOnlineIds = new Set(onlineDevices.map(d => d.deviceId))
      setSelectedDevices(allOnlineIds)
      setSelectAll(true)
    }
  }

  const handleConfirm = async () => {
    if (selectedDevices.size === 0) {
      alert('⚠️ Selecione pelo menos um dispositivo para atualizar.')
      return
    }

    if (!apkUrl) {
      alert('⚠️ Insira a URL do APK.')
      return
    }

    setIsLoading(true)
    try {
      await onConfirm(Array.from(selectedDevices), apkUrl, version)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📥 Atualização em Massa</h2>
          <button 
            onClick={onClose}
            className="modal-close"
            disabled={isLoading}
          >
            ✕
          </button>
        </div>
        
        <div className="modal-body">
          {/* APK Configuration */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-md font-semibold text-primary mb-3">📦 Configuração do APK</h3>
            
            <div className="mb-3">
              <label htmlFor="bulkApkUrl" className="block text-sm font-medium text-secondary mb-2">
                URL do APK *
              </label>
              <input
                type="url"
                id="bulkApkUrl"
                value={apkUrl}
                onChange={(e) => setApkUrl(e.target.value)}
                placeholder="https://github.com/.../app-debug.apk"
                className="input w-full"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="bulkVersion" className="block text-sm font-medium text-secondary mb-2">
                Versão (opcional)
              </label>
              <input
                type="text"
                id="bulkVersion"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.1"
                className="input w-full"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Device Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold text-primary">
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
                <span className="text-sm font-medium text-primary">Selecionar Todos</span>
              </label>
            </div>

            {/* Online Devices List */}
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white">
              {onlineDevices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-lg mb-2">🔴 Nenhum dispositivo online</p>
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
                        <span className="font-medium text-primary">{device.name}</span>
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                          🟢 Online
                        </span>
                        {device.isDeviceOwner && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                            Device Owner
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted mt-1">
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
                <p className="text-sm text-gray-600">
                  <strong>ℹ️ {offlineDevices.length} dispositivo(s) offline:</strong>
                  <span className="ml-2 text-xs">
                    {offlineDevices.map(d => d.name).join(', ')}
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Dispositivos offline não podem ser atualizados no momento
                </p>
              </div>
            )}
          </div>

          {/* Warnings */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
            <strong>⚠️ Atenção:</strong>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>Os dispositivos selecionados serão atualizados <strong>simultaneamente</strong>.</li>
              <li>O download consumirá dados móveis/Wi-Fi dos dispositivos.</li>
              <li>Os dispositivos podem <strong>reiniciar automaticamente</strong> após a instalação.</li>
              <li>Acompanhe o progresso nos logs de cada dispositivo.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="btn btn-secondary"
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button 
            onClick={handleConfirm}
            className="btn btn-success"
            disabled={isLoading || selectedDevices.size === 0}
          >
            {isLoading 
              ? '📥 Enviando...' 
              : `📥 Atualizar ${selectedDevices.size} Dispositivo${selectedDevices.size !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </div>
  )
}

