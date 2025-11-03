'use client'

import { Computer } from '../types/uem'

interface UEMCardProps {
  computer: Computer
  onClick: () => void
  onDelete: () => void
  onRemoteAction?: () => void
}

export default function UEMCard({ computer, onClick, onDelete, onRemoteAction }: UEMCardProps) {
  const formatStorage = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatMemory = (bytes: number) => {
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

  const getOSIcon = (osType: string) => {
    switch (osType) {
      case 'Windows':
        return '🪟'
      case 'Linux':
        return '🐧'
      case 'macOS':
        return '🍎'
      default:
        return '💻'
    }
  }

  const storagePercentage = computer.storageTotal > 0 
    ? Math.round((computer.storageUsed / computer.storageTotal) * 100)
    : 0

  const memoryPercentage = computer.memoryTotal > 0 
    ? Math.round((computer.memoryUsed / computer.memoryTotal) * 100)
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
            <span className="text-white text-xl">{getOSIcon(computer.osType)}</span>
          </div>
          <div>
            <h3 className="font-semibold text-primary group-hover:text-primary-dark transition-colors">
              {computer.name}
            </h3>
            {computer.assignedUserName && (
              <p className="text-sm font-medium text-blue-600">{computer.assignedUserName}</p>
            )}
            <p className="text-sm text-secondary">
              {computer.osType} {computer.osVersion}
              {computer.hostname && ` • ${computer.hostname}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`status-dot ${
            computer.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
          }`} />
          <span className={`text-xs ${
            computer.status === 'online' ? 'text-secondary' : 'text-red-500 font-medium'
          }`}>
            {computer.status === 'online' ? 'online' : 'offline'}
          </span>
        </div>
      </div>

      {/* Computer Info */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Sistema</span>
          <span className="text-sm font-medium text-primary">
            {computer.osType} {computer.architecture}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Memória</span>
          {computer.status === 'offline' ? (
            <span className="text-sm text-secondary">N/D</span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-16 h-2 rounded-full bg-gray-200">
                <div 
                  className={`h-full rounded-full ${
                    memoryPercentage > 80 ? 'bg-error' :
                    memoryPercentage > 60 ? 'bg-warning' : 'bg-success'
                  }`}
                  style={{ width: `${memoryPercentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-primary">
                {memoryPercentage}%
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Armazenamento</span>
          {computer.status === 'offline' ? (
            <span className="text-sm text-secondary">N/D</span>
          ) : (
            <div className="text-right">
              <div className="text-sm font-medium text-primary">
                {formatStorage(computer.storageUsed)} / {formatStorage(computer.storageTotal)}
              </div>
              <div className="text-xs text-secondary">{storagePercentage}% usado</div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-secondary">Última atualização</span>
          <span className={`text-sm font-medium ${
            computer.status === 'online' ? 'text-primary' : 'text-red-500'
          }`}>
            {computer.status === 'online' ? formatLastSeen(computer.lastSeen) : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Status Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {computer.complianceStatus === 'compliant' && (
          <span className="badge badge-success">Conforme</span>
        )}
        {computer.complianceStatus === 'non_compliant' && (
          <span className="badge badge-error">Não Conforme</span>
        )}
        {computer.antivirusInstalled && computer.antivirusEnabled && (
          <span className="badge badge-primary">Antivírus</span>
        )}
        {computer.firewallEnabled && (
          <span className="badge badge-primary">Firewall</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-border">
        {onRemoteAction && (
          <button 
            className="btn btn-sm btn-primary flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onRemoteAction()
            }}
          >
            ⚡ Ações
          </button>
        )}
        <button 
          className="btn btn-sm btn-error flex-1"
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

