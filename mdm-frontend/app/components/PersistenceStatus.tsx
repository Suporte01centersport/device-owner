'use client'

import { useState, useEffect } from 'react'
import { usePersistence } from '../lib/persistence'

export default function PersistenceStatus() {
  const { hasSavedData, devices, adminPassword, isLoaded } = usePersistence()
  const [showDetails, setShowDetails] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  useEffect(() => {
    if (isLoaded) {
      setLastSync(new Date())
    }
  }, [isLoaded])

  const getStatusColor = () => {
    if (!isLoaded) return 'text-white/50'
    if (hasSavedData()) return 'text-white'
    return 'text-yellow-300'
  }

  const getStatusIcon = () => {
    if (!isLoaded) return '⏳'
    if (hasSavedData()) return '💾'
    return '⚠️'
  }

  const getStatusText = () => {
    if (!isLoaded) return 'Carregando...'
    if (hasSavedData()) return 'Dados salvos'
    return 'Sem dados salvos'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-colors text-sm"
        title="Status de persistência de dados"
      >
        <span className="text-lg">{getStatusIcon()}</span>
        <span className={`font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        <span className="text-white/40">
          {showDetails ? '▲' : '▼'}
        </span>
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-50">
          <div className="p-4">
            <h3 className="font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <span>💾</span>
              Status de Persistência
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Status:</span>
                <span className={`text-sm font-medium ${getStatusColor()}`}>
                  {getStatusText()}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Dispositivos salvos:</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {devices.length}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Senha admin:</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {adminPassword ? 'Definida' : 'Não definida'}
                </span>
              </div>
              
              {lastSync && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-secondary)]">Última sincronização:</span>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {lastSync.toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              )}
              
              <div className="pt-2 border-t border-[var(--border)]">
                <div className="text-xs text-[var(--text-secondary)]">
                  <p>• Dados são salvos automaticamente no navegador</p>
                  <p>• Sobrevivem a recarregamentos da página</p>
                  <p>• Sincronizam com o servidor quando conectado</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
