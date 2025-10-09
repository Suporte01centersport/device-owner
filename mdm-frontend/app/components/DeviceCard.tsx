'use client'

import { useState, useEffect, useCallback } from 'react'
import { Device } from '../types/device'

interface DeviceCardProps {
  device: Device
  onClick: () => void
  onDelete: () => void
  onSupport: () => void
  onSupportCountUpdate?: number
}

export default function DeviceCard({ device, onClick, onDelete, onSupport, onSupportCountUpdate }: DeviceCardProps) {
  const [readMessagesCount, setReadMessagesCount] = useState(0)
  
  // Debug: verificar dados do dispositivo
  console.log('DeviceCard renderizando:', {
    deviceId: device.deviceId,
    name: device.name,
    batteryLevel: device.batteryLevel,
    installedAppsCount: device.installedAppsCount,
    allowedAppsCount: device.allowedApps?.length || 0,
    storageTotal: device.storageTotal,
    storageUsed: device.storageUsed
  })

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
      className="card p-6 cursor-pointer hover:shadow-lg transition-all group"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
            <span className="text-white text-xl">📱</span>
          </div>
          <div>
            <h3 className="font-semibold text-primary group-hover:text-primary-dark transition-colors">
              {device.name}
            </h3>
            <p className="text-sm text-secondary">{device.model}</p>
            <p className="text-xs text-muted">{device.manufacturer}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`status-dot ${
            device.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
          }`} />
          <span className={`text-xs ${
            device.status === 'online' ? 'text-secondary' : 'text-red-500 font-medium'
          }`}>
            {device.status === 'online' ? 'online' : 'offline'}
          </span>
        </div>
      </div>

      {/* Device Info */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Android</span>
          <span className="text-sm font-medium text-primary">
            {device.androidVersion} (API {device.apiLevel})
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Bateria</span>
          {device.status === 'offline' ? (
            <span className="text-sm text-secondary">N/D</span>
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
                    device.batteryLevel > 50 ? 'bg-success' :
                    device.batteryLevel > 20 ? 'bg-warning' : 'bg-error'
                  }`}
                  style={{ width: `${device.batteryLevel}%` }}
                />
              </div>
              <span className={`text-sm font-medium ${getBatteryColor(device.batteryLevel)}`}>
                {device.batteryLevel}%
              </span>
              {device.isCharging && <span className="text-success text-xs">⚡</span>}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Armazenamento</span>
          {device.status === 'offline' ? (
            <span className="text-sm text-secondary">N/D</span>
          ) : isDataLoading() ? (
            <div className="text-right">
              <div className="text-sm font-medium text-gray-500">
                Carregando...
              </div>
              <div className="text-xs text-gray-400">aguarde</div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-sm font-medium text-primary">
                {formatStorage(device.storageUsed)} / {formatStorage(device.storageTotal)}
              </div>
              <div className="text-xs text-secondary">{storagePercentage}% usado</div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Última atualização</span>
          <span className={`text-sm font-medium ${
            device.status === 'online' ? 'text-primary' : 'text-red-500'
          }`}>
            {device.status === 'online' ? formatLastSeen(device.lastSeen) : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Status Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {device.isDeviceOwner && (
          <span className="badge badge-success">Device Owner</span>
        )}
        {device.isProfileOwner && (
          <span className="badge badge-primary">Profile Owner</span>
        )}
        {device.isDeveloperOptionsEnabled && (
          <span className="badge badge-gray">Dev Mode</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t border-border">
        <button 
          className="btn btn-sm btn-primary relative"
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
          className="btn btn-sm btn-error"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          🗑️ Deletar
        </button>
      </div>
    </div>
  )
}