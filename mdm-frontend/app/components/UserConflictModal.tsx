'use client'

import { useEffect } from 'react'

interface UserConflictModalProps {
  isOpen: boolean
  onClose: () => void
  conflict: {
    userName: string
    userCustomId?: string
    otherDevices: Array<{
      deviceId: string
      name: string
    }>
    currentDeviceName?: string
  }
}

export default function UserConflictModal({ isOpen, onClose, conflict }: UserConflictModalProps) {
  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-yellow-500/150/20 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-primary">Usuário Já Vinculado</h2>
        </div>

        <div className="mb-4">
          <p className="text-[var(--text-primary)] mb-3">
            O usuário <strong>{conflict.userName}</strong>
            {conflict.userCustomId && ` (${conflict.userCustomId})`} já estava vinculado a 
            {conflict.otherDevices.length === 1 ? ' outro dispositivo' : ` ${conflict.otherDevices.length} outros dispositivos`}:
          </p>
          
          <div className="bg-[var(--surface-elevated)] rounded-lg p-3 mb-3">
            <ul className="space-y-2">
              {conflict.otherDevices.map((device) => (
                <li key={device.deviceId} className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-secondary)]">•</span>
                  <span className="font-medium">{device.name}</span>
                  <span className="text-[var(--text-muted)]">({device.deviceId.substring(0, 8)}...)</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[var(--text-primary)] mb-3">
            <strong>A vinculação foi IMPEDIDA.</strong> Para vincular este usuário ao dispositivo atual, 
            é necessário desvincular primeiro do(s) dispositivo(s) abaixo.
          </p>
          {conflict.currentDeviceName && (
            <p className="text-[var(--text-secondary)] text-sm mb-3">
              Tentativa de vincular ao dispositivo: <strong>{conflict.currentDeviceName}</strong>
            </p>
          )}
          <p className="text-red-600 font-semibold text-sm">
            ⚠️ Ação necessária: Desvincule o usuário do(s) dispositivo(s) acima primeiro.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="btn btn-primary"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
