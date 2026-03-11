'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePersistence } from '../lib/persistence'

export default function PersistenceStatus() {
  const { adminPassword, isLoaded } = usePersistence()
  const [showDetails, setShowDetails] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [deviceCount, setDeviceCount] = useState(0)

  // Buscar contagem real de dispositivos do banco e atualizar periodicamente
  const fetchDeviceCount = useCallback(async () => {
    try {
      const res = await fetch('/api/devices')
      if (res.ok) {
        const data = await res.json()
        const count = Array.isArray(data) ? data.length : (Array.isArray(data?.data) ? data.data.length : 0)
        setDeviceCount(count)
        setLastSync(new Date())
      }
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (isLoaded) {
      fetchDeviceCount()
    }
  }, [isLoaded, fetchDeviceCount])

  // Atualizar a cada 10 segundos
  useEffect(() => {
    const interval = setInterval(fetchDeviceCount, 10000)
    return () => clearInterval(interval)
  }, [fetchDeviceCount])

  const hasSaved = deviceCount > 0 || (adminPassword?.length || 0) > 0

  const getStatusColor = () => {
    if (!isLoaded) return 'text-black/50'
    if (hasSaved) return 'text-black'
    return 'text-yellow-600'
  }

  const getStatusIcon = () => {
    if (!isLoaded) return '⏳'
    if (hasSaved) return '💾'
    return '⚠️'
  }

  const getStatusText = () => {
    if (!isLoaded) return 'Carregando...'
    if (hasSaved) return 'Dados salvos'
    return 'Sem dados salvos'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-white/90 border border-white/20 rounded-lg transition-colors text-sm"
        title="Status de persistência de dados"
      >
        <span className="text-lg">{getStatusIcon()}</span>
        <span className={`font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        <span className="text-black/40">
          {showDetails ? '▲' : '▼'}
        </span>
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-50">
          <div className="p-4">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <span>💾</span>
              Status de Persistência
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Status:</span>
                <span className="text-sm font-medium text-white">
                  {getStatusText()}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Dispositivos salvos:</span>
                <span className="text-sm font-medium text-white">
                  {deviceCount}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Senha admin:</span>
                <span className="text-sm font-medium text-white">
                  {adminPassword ? 'Definida' : 'Não definida'}
                </span>
              </div>

              {lastSync && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/70">Última sincronização:</span>
                  <span className="text-sm font-medium text-white">
                    {lastSync.toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border)]">
                <div className="text-xs text-white/70">
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
