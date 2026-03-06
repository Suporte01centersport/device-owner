'use client'

import { useState, useEffect, useCallback } from 'react'
import { Device } from '../types/device'
import ConfirmModal from './ConfirmModal'

interface DeviceCardProps {
  device: Device
  onClick: () => void
  onDelete: () => void
  onSupport: () => void
  onUpdate: () => void
  onSupportCountUpdate?: number
}

export default function DeviceCard({ device, onClick, onDelete, onSupport, onUpdate, onSupportCountUpdate }: DeviceCardProps) {
  const [readMessagesCount, setReadMessagesCount] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)

  const loadReadMessagesCount = useCallback(async () => {
    try {
      const response = await fetch('/api/support-messages')
      if (response.ok) {
        const allMessages = await response.json()
        const readCount = allMessages.filter((msg: any) => 
          msg.deviceId === device.deviceId && msg.status === 'read'
        ).length
        setReadMessagesCount(readCount)
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens lidas:', error)
    }
  }, [device.deviceId])

  useEffect(() => {
    loadReadMessagesCount()
  }, [loadReadMessagesCount])

  // Recarregar quando houver atualização externa (trigger numérico)
  useEffect(() => {
    if (onSupportCountUpdate !== undefined && onSupportCountUpdate > 0) {
      loadReadMessagesCount()
    }
  }, [onSupportCountUpdate, loadReadMessagesCount])

  const formatStorage = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatLastSeen = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (days > 0) return `${days}d atrás`
    if (hours > 0) return `${hours}h atrás`
    if (minutes > 0) return `${minutes}m atrás`
    return 'Agora'
  }

  const getBatteryColor = (level: number) => {
    if (level > 50) return 'text-success'
    if (level > 20) return 'text-warning'
    return 'text-error'
  }

  const getBatteryBgColor = (level: number) => {
    if (level > 50) return 'bg-green-100'
    if (level > 20) return 'bg-yellow-100'
    return 'bg-red-100'
  }

  // Função para detectar se os dados são válidos ou ainda estão carregando
  const isDataLoading = () => {
    // Detectar valores zerados
    const isZeroed = device.batteryLevel === 0 && 
                     device.installedAppsCount === 0 && 
                     device.storageTotal === 0
    
    // Detectar valores simulados específicos (85% bateria, 32GB total, 15GB usado, 3 apps)
    const isSimulated = device.batteryLevel === 85 && 
                        device.storageTotal === 32 * 1024 * 1024 * 1024 && // 32GB
                        device.storageUsed === 15 * 1024 * 1024 * 1024 &&   // 15GB
                        device.installedAppsCount === 3
    
    return isZeroed || isSimulated
  }

  const storagePercentage = device.storageTotal > 0 
    ? Math.round((device.storageUsed / device.storageTotal) * 100)
    : 0

  return (
    <div 
      className="relative card p-6 cursor-pointer hover:shadow-lg transition-all group !bg-white !border-gray-200 !text-black"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-200">
            <span className="text-xl">📱</span>
          </div>
          <div>
            <h3 className="font-semibold text-black group-hover:text-gray-800 transition-colors">
              {device.name}
            </h3>
            {device.assignedUserName && (
              <p className="text-sm font-medium text-gray-700">{device.assignedUserName}</p>
            )}
            <p className="text-sm text-gray-700">{device.model} • {device.manufacturer}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`status-dot ${
            device.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
          }`} />
          <span className={`text-xs font-medium ${
            device.status === 'online' ? 'text-black' : 'text-red-600'
          }`}>
            {device.status === 'online' ? 'online' : 'offline'}
          </span>
        </div>
      </div>

      {/* Device Info */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-700">Android</span>
          <span className="text-sm font-medium text-black">
            {device.androidVersion} (API {device.apiLevel})
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Bateria</span>
          {device.status === 'offline' ? (
            <span className="text-sm text-gray-700">N/D</span>
          ) : isDataLoading() ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">
                Carregando...
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`w-16 h-2 rounded-full ${getBatteryBgColor(device.batteryLevel)}`}>
                <div 
                  className={`h-full rounded-full ${
                    device.batteryLevel > 50 ? 'bg-green-500' :
                    device.batteryLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${device.batteryLevel}%` }}
                />
              </div>
              <span className="text-sm font-medium text-black">
                {device.batteryLevel}%
              </span>
              {device.isCharging && <span className="text-green-600 text-xs">⚡</span>}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Armazenamento</span>
          {device.status === 'offline' ? (
            <span className="text-sm text-gray-700">N/D</span>
          ) : isDataLoading() ? (
            <div className="text-right">
              <div className="text-sm font-medium text-gray-500">
                Carregando...
              </div>
              <div className="text-xs text-gray-500">aguarde</div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-sm font-medium text-black">
                {formatStorage(device.storageUsed)} / {formatStorage(device.storageTotal)}
              </div>
              <div className="text-xs text-gray-700">{storagePercentage}% usado</div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Última atualização</span>
          <span className={`text-sm font-medium ${
            device.status === 'online' ? 'text-black' : 'text-red-600'
          }`}>
            {device.status === 'online' ? formatLastSeen(device.lastSeen) : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Status Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {device.isDeviceOwner && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Device Owner</span>
        )}
        {device.isProfileOwner && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">Profile Owner</span>
        )}
        {device.isDeveloperOptionsEnabled && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">Dev Mode</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-gray-200">
        <button 
          className="btn btn-sm relative flex-1 bg-gray-100 border-gray-200 text-black hover:bg-gray-200"
          onClick={(e) => {
            e.stopPropagation()
            onSupport()
          }}
          title={readMessagesCount > 0 ? `${readMessagesCount} mensagem${readMessagesCount !== 1 ? 's' : ''} lida${readMessagesCount !== 1 ? 's' : ''} (aguardando resolução)` : 'Mensagens de Suporte'}
        >
          🔔 Suporte
          {readMessagesCount > 0 && (
            <span className={`read-messages-badge ${readMessagesCount > 9 ? 'large-count' : ''}`}>
              {readMessagesCount > 99 ? '99+' : readMessagesCount}
            </span>
          )}
        </button>
        <button 
          className="btn btn-sm flex-1 bg-gray-100 border-gray-200 text-black hover:bg-gray-200"
          onClick={(e) => {
            e.stopPropagation()
            setShowUpdateConfirm(true)
          }}
          title="Atualizar APK do dispositivo"
        >
          📥 Atualizar
        </button>
        <button 
          className="btn btn-sm flex-1 bg-red-100 border-red-200 text-red-700 hover:bg-red-200"
          onClick={(e) => {
            e.stopPropagation()
            setShowDeleteConfirm(true)
          }}
        >
          🗑️ Deletar
        </button>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false)
          onDelete()
        }}
        title="Tem certeza?"
        message={`Deseja deletar o dispositivo "${device.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Sim"
        cancelLabel="Não"
        variant="danger"
        insideCard
      />

      <ConfirmModal
        isOpen={showUpdateConfirm}
        onClose={() => setShowUpdateConfirm(false)}
        onConfirm={() => {
          setShowUpdateConfirm(false)
          onUpdate()
        }}
        title="Tem certeza?"
        message={`Deseja atualizar o APK do dispositivo "${device.name}"?`}
        confirmLabel="Sim"
        cancelLabel="Não"
        variant="primary"
        insideCard
      />
    </div>
  )
}