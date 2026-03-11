'use client'

import { useState, useEffect, useRef } from 'react'
import { Device } from '../types/device'
import { showAlert } from '../lib/dialog'

interface BulkUpdateModalProps {
  devices: Device[]
  isOpen: boolean
  onClose: () => void
  onBulkUpdateMdm: (deviceIds: string[], onProgress?: (progress: ProgressUpdate) => void, cancelRef?: React.MutableRefObject<boolean>) => Promise<void>
}

interface ProgressUpdate {
  currentDevice: number
  totalDevices: number
  percentage: number
  stage: 'compilation' | 'sending' | 'downloading' | 'installing' | 'complete'
  message: string
}

export default function BulkUpdateModal({ devices, isOpen, onClose, onBulkUpdateMdm }: BulkUpdateModalProps) {
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  const cancelRef = useRef(false)

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
      showAlert('Selecione pelo menos um dispositivo.')
      return
    }
    cancelRef.current = false
    setIsLoading(true)
    setProgress(null)
    try {
      await onBulkUpdateMdm(Array.from(selectedDevices), (progressUpdate) => {
        if (!cancelRef.current) {
          setProgress(progressUpdate)
        }
      }, cancelRef)
      if (!cancelRef.current) {
        onClose()
      }
    } finally {
      setIsLoading(false)
      setProgress(null)
    }
  }

  const handleCancel = () => {
    cancelRef.current = true
    setIsLoading(false)
    setProgress(null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📥 Atualização em Massa</h2>
          <button onClick={onClose} className="modal-close" disabled={isLoading}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="mb-4 p-4 bg-green-500/150/15 border border-green-500/30 rounded-lg">
            <h3 className="text-md font-semibold text-[var(--text-primary)] mb-2">📶 Atualização via WiFi</h3>
            <p className="text-sm text-[var(--text-primary)]">
              O MDM será compilado e enviado para os dispositivos selecionados pela rede. Não é necessário conectar via USB.
            </p>
          </div>

          {/* Device Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold text-[var(--text-primary)]">
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
                <span className="text-sm font-medium text-[var(--text-primary)]">Selecionar Todos</span>
              </label>
            </div>

            {/* Online Devices List */}
            <div className="space-y-2 max-h-64 overflow-y-auto border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]">
              {onlineDevices.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-primary)]">
                  <p className="text-lg mb-2 font-medium">🔴 Nenhum dispositivo online</p>
                  <p className="text-sm">Aguarde dispositivos se conectarem</p>
                </div>
              ) : (
                onlineDevices.map((device) => (
                  <label
                    key={device.deviceId}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedDevices.has(device.deviceId)
                        ? 'border-blue-500 bg-blue-500/150/15'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-blue-500/30 hover:bg-blue-500/150/15'
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
                        <span className="font-medium text-[var(--text-primary)]">{device.name}</span>
                        <span className="text-xs px-2 py-1 bg-green-500/150/20 text-green-700 rounded-full">
                          🟢 Online
                        </span>
                      </div>
                      <div className="text-sm text-[var(--text-primary)] mt-1">
                        {device.model} • Android {device.androidVersion} • Bateria: {device.batteryLevel}%
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Offline Devices Info */}
            {offlineDevices.length > 0 && (
              <div className="mt-3 p-3 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg">
                <p className="text-sm text-[var(--text-primary)]">
                  <strong>ℹ️ {offlineDevices.length} dispositivo(s) offline:</strong>
                  <span className="ml-2 text-xs text-[var(--text-primary)]">
                    {offlineDevices.map(d => d.name).join(', ')}
                  </span>
                </p>
                <p className="text-xs text-[var(--text-primary)] mt-1">
                  Dispositivos offline não podem ser atualizados no momento
                </p>
              </div>
            )}
          </div>

          <div className="bg-orange-500/150/15 border border-orange-500/30 rounded-lg p-3 text-sm text-orange-300">
            <strong>⚠️ Atenção:</strong>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>Os dispositivos precisam estar <strong>online</strong>.</li>
              <li>O build do MDM pode levar 1–2 minutos. O download acontece depois.</li>
              <li>O download consumirá Wi-Fi dos dispositivos.</li>
            </ul>
          </div>

          {/* Barra de progresso enquanto compila/envia */}
          {isLoading && progress && (
            <div className="mt-4 space-y-3">
              {/* Estágio do processo */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Etapa:</span>
                <span className="text-sm font-bold text-blue-600">
                  {progress.stage === 'compilation' && '🔨 Compilando MDM'}
                  {progress.stage === 'sending' && '📤 Enviando para dispositivos'}
                  {progress.stage === 'downloading' && '⬇️ Baixando no dispositivo'}
                  {progress.stage === 'installing' && '⚙️ Instalando'}
                  {progress.stage === 'complete' && '✅ Concluído'}
                </span>
              </div>

              {/* Progresso do dispositivo */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Dispositivo:</span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {progress.currentDevice} de {progress.totalDevices}
                </span>
              </div>

              {/* Barra de progresso visual */}
              <div className="w-full bg-[var(--border)] rounded-full h-3 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              {/* Percentual */}
              <div className="text-center">
                <span className="text-lg font-bold text-blue-600">{Math.round(progress.percentage)}%</span>
              </div>

              {/* Mensagem descritiva */}
              <p className="text-xs text-[var(--text-secondary)] text-center">
                {progress.message}
              </p>
            </div>
          )}

          {/* Barra de progresso genérica enquanto está carregando (sem dados de progresso) */}
          {isLoading && !progress && (
            <div className="mt-4">
              <div className="w-full bg-[var(--border)] rounded-full h-2 overflow-hidden">
                <div className="h-full bg-green-500/150/150 w-1/2 animate-pulse" />
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Compilando o MDM e enviando atualização para os dispositivos selecionados. Aguarde...
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            onClick={handleCancel} 
            className={`btn ${isLoading ? 'btn-danger' : 'btn-secondary'}`}
          >
            {isLoading ? '❌ Cancelar Atualização' : 'Cancelar'}
          </button>
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

