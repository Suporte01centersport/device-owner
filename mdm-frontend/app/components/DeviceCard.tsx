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
  onLigar?: () => void
  onDesligar?: () => void
  onRevert?: () => void
  onSupportCountUpdate?: number
}

export default function DeviceCard({ device, onClick, onDelete, onSupport, onUpdate, onLigar, onDesligar, onRevert, onSupportCountUpdate }: DeviceCardProps) {
  const [readMessagesCount, setReadMessagesCount] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)
  const [showRevertConfirm, setShowRevertConfirm] = useState(false)
  const [nfKey, setNfKey] = useState(device.nfKey || '')
  const [purchaseDate, setPurchaseDate] = useState(device.purchaseDate || '')
  const [editingNf, setEditingNf] = useState(false)
  const [savingNf, setSavingNf] = useState(false)

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
    if (level > 50) return 'bg-green-500/150/150/20'
    if (level > 20) return 'bg-yellow-500/150/150/20'
    return 'bg-red-500/150/150/20'
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
      className="relative card p-6 cursor-pointer hover:shadow-lg transition-all group !bg-background !border-border"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[var(--surface-elevated)] rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform border border-[var(--border)]">
            <span className="text-xl">📱</span>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] transition-colors">
              {device.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">{device.model} • {device.manufacturer}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`status-dot ${
            device.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
          }`} />
          <span className={`text-xs font-medium ${
            device.status === 'online' ? 'text-[var(--text-primary)]' : 'text-red-400'
          }`}>
            {device.status === 'online' ? 'online' : 'offline'}
          </span>
        </div>
      </div>

      {/* Atribuído a */}
      <div className="mb-4 px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Atribuído a</span>
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
          {device.assignedUserName || 'Nenhum usuário'}
        </p>
      </div>

      {/* Device Info */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--text-secondary)]">Android</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {device.androidVersion} (API {device.apiLevel})
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--text-secondary)]">Bateria</span>
          {device.status === 'offline' ? (
            <span className="text-sm text-[var(--text-secondary)]">N/D</span>
          ) : isDataLoading() ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Carregando...
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`w-16 h-2 rounded-full ${getBatteryBgColor(device.batteryLevel)}`}>
                <div 
                  className={`h-full rounded-full ${
                    device.batteryLevel > 50 ? 'bg-green-500/150/150' :
                    device.batteryLevel > 20 ? 'bg-yellow-500/150/150' : 'bg-red-500/150/150'
                  }`}
                  style={{ width: `${device.batteryLevel}%` }}
                />
              </div>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {device.batteryLevel}%
              </span>
              {device.isCharging && <span className="text-green-400 text-xs">⚡</span>}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--text-secondary)]">Armazenamento</span>
          {device.status === 'offline' ? (
            <span className="text-sm text-[var(--text-secondary)]">N/D</span>
          ) : isDataLoading() ? (
            <div className="text-right">
              <div className="text-sm font-medium text-[var(--text-secondary)]">
                Carregando...
              </div>
              <div className="text-xs text-[var(--text-muted)]">aguarde</div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {formatStorage(device.storageUsed)} / {formatStorage(device.storageTotal)}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">{storagePercentage}% usado</div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--text-secondary)]">Última atualização</span>
          <span className={`text-sm font-medium ${
            device.status === 'online' ? 'text-[var(--text-primary)]' : 'text-red-400'
          }`}>
            {device.status === 'online' ? formatLastSeen(device.lastSeen) : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Hardware Inventory Details */}
      {(device.imei || device.serialNumber || device.phoneNumber || device.simNumber) && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] space-y-1">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Inventário</span>
          {device.imei && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)]">IMEI</span>
              <span className="text-xs font-mono text-[var(--text-secondary)] truncate ml-2">{device.imei}</span>
            </div>
          )}
          {device.serialNumber && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)]">S/N</span>
              <span className="text-xs font-mono text-[var(--text-secondary)] truncate ml-2">{device.serialNumber}</span>
            </div>
          )}
          {device.phoneNumber && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)]">Telefone</span>
              <span className="text-xs font-mono text-[var(--text-secondary)] truncate ml-2">{device.phoneNumber}</span>
            </div>
          )}
          {device.simNumber && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)]">SIM</span>
              <span className="text-xs font-mono text-[var(--text-secondary)] truncate ml-2">{device.simNumber}</span>
            </div>
          )}
        </div>
      )}

      {/* Botões Ligar / Desligar */}
      {(onLigar || onDesligar) && (
        <div className="flex gap-2 mb-4">
          {onLigar && (
            <button
              className="btn btn-sm flex-1 !bg-green-600/80 !border-green-500/50 !text-white hover:!bg-green-600"
              onClick={(e) => {
                e.stopPropagation()
                onLigar()
              }}
              title="Ligar celular (acordar tela)"
            >
              📱 Ligar
            </button>
          )}
          {onDesligar && (
            <button
              className="btn btn-sm flex-1 !bg-red-600/80 !border-red-500/50 !text-white hover:!bg-red-600"
              onClick={(e) => {
                e.stopPropagation()
                onDesligar()
              }}
              title="Desligar celular (reiniciar)"
            >
              ⏻ Desligar
            </button>
          )}
        </div>
      )}

      {/* NF e Data de Compra */}
      <div className="mb-4 px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] space-y-2">
        {!editingNf && (device.nfKey || device.purchaseDate) ? (
          <>
            {device.nfKey && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">Chave NF</span>
                <span className="text-xs font-mono text-[var(--text-secondary)] truncate ml-2 max-w-[200px]" title={device.nfKey}>{device.nfKey}</span>
              </div>
            )}
            {device.purchaseDate && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--text-muted)]">Data Compra</span>
                <span className="text-xs font-mono text-[var(--text-secondary)]">
                  {new Date(device.purchaseDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            )}
            {!device.purchaseDate && (
              <button
                className="text-xs text-blue-400 hover:text-blue-300 underline"
                onClick={(e) => { e.stopPropagation(); setEditingNf(true) }}
              >
                Adicionar data de compra
              </button>
            )}
          </>
        ) : !editingNf && !device.nfKey && !device.purchaseDate ? (
          <button
            className="text-xs text-blue-400 hover:text-blue-300 underline"
            onClick={(e) => { e.stopPropagation(); setEditingNf(true) }}
          >
            Cadastrar dados da NF
          </button>
        ) : (
          <div className="space-y-2" onClick={e => e.stopPropagation()}>
            <div>
              <label className="text-[10px] text-[var(--text-muted)]">Chave de Acesso NF</label>
              <input
                type="text"
                value={nfKey}
                onChange={e => setNfKey(e.target.value)}
                placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                className="w-full px-2 py-1 text-xs rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-blue-500"
                disabled={!!device.nfKey}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)]">Data de Compra</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text-primary)] outline-none focus:border-blue-500"
                disabled={!!device.purchaseDate}
              />
            </div>
            <div className="flex gap-2">
              <button
                disabled={savingNf || (!nfKey && !purchaseDate)}
                className="flex-1 px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                onClick={async (e) => {
                  e.stopPropagation()
                  setSavingNf(true)
                  try {
                    const wsHost = window.location.hostname || 'localhost'
                    const token = localStorage.getItem('mdm_auth_token')
                    const body: any = {}
                    if (nfKey && !device.nfKey) body.nfKey = nfKey
                    if (purchaseDate && !device.purchaseDate) body.purchaseDate = purchaseDate
                    await fetch(`http://${wsHost}:3001/api/devices/${encodeURIComponent(device.deviceId)}/update-info`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                      body: JSON.stringify(body)
                    })
                    setEditingNf(false)
                    // Force refresh by reloading
                    window.location.reload()
                  } catch (err) {
                    console.error('Erro ao salvar NF:', err)
                  } finally {
                    setSavingNf(false)
                  }
                }}
              >
                {savingNf ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-white"
                onClick={(e) => { e.stopPropagation(); setEditingNf(false); setNfKey(device.nfKey || ''); setPurchaseDate(device.purchaseDate || '') }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-1.5 pt-4 border-t border-[var(--border)]">
        <button
          className="btn btn-sm relative !text-xs !px-1 !bg-[var(--surface-elevated)] !border-[var(--border)] !text-[var(--text-primary)] hover:!bg-[var(--border)]"
          onClick={(e) => {
            e.stopPropagation()
            onSupport()
          }}
          title="Mensagens de Suporte"
        >
          🔔 Suporte
          {readMessagesCount > 0 && (
            <span className={`read-messages-badge ${readMessagesCount > 9 ? 'large-count' : ''}`}>
              {readMessagesCount > 99 ? '99+' : readMessagesCount}
            </span>
          )}
        </button>
        <button
          className="btn btn-sm !text-xs !px-1 !bg-[var(--surface-elevated)] !border-[var(--border)] !text-[var(--text-primary)] hover:!bg-[var(--border)]"
          onClick={(e) => {
            e.stopPropagation()
            setShowUpdateConfirm(true)
          }}
          title="Atualizar APK do dispositivo"
        >
          📥 Atualizar
        </button>
        {onRevert && (
          <button
            className="btn btn-sm !text-xs !px-1 !bg-orange-500/20 !border-orange-400/30 !text-orange-400 hover:!bg-orange-500/40"
            onClick={(e) => {
              e.stopPropagation()
              setShowRevertConfirm(true)
            }}
            title="Reverter: remove MDM e libera o celular"
          >
            🔓 Reverter
          </button>
        )}
        <button
          className="btn btn-sm !text-xs !px-1 !bg-red-500/20 !border-red-400/30 !text-red-400 hover:!bg-red-500/40"
          onClick={(e) => {
            e.stopPropagation()
            setShowDeleteConfirm(true)
          }}
          title="Deletar dispositivo"
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

      <ConfirmModal
        isOpen={showRevertConfirm}
        onClose={() => setShowRevertConfirm(false)}
        onConfirm={() => {
          setShowRevertConfirm(false)
          if (onRevert) onRevert()
        }}
        title="Reverter Dispositivo?"
        message={`Isso vai REMOVER o MDM do dispositivo "${device.name}". Todas as restrições serão desativadas e o celular voltará ao normal. Para gerenciar novamente, será necessário fazer factory reset e escanear o QR Code. Continuar?`}
        confirmLabel="Sim, reverter"
        cancelLabel="Cancelar"
        variant="danger"
        insideCard
      />

    </div>
  )
}