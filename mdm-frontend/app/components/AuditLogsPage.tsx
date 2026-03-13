'use client'

import { useState, useEffect, useCallback } from 'react'

interface AuditLog {
  id: string
  timestamp: string
  action: string
  type: string
  target: string
  details: string
  user?: string
}

interface AuditLogsResponse {
  success: boolean
  data: AuditLog[]
  total: number
  page: number
  totalPages: number
}

const ACTION_LABELS: Record<string, string> = {
  device_added: 'Dispositivo adicionado',
  device_deleted: 'Dispositivo removido',
  device_locked: 'Dispositivo bloqueado',
  user_assigned: 'Usuário atribuído',
  restriction_changed: 'Restrição alterada',
  app_updated: 'App atualizado',
  password_changed: 'Senha alterada',
  config_backup: 'Backup de configuração',
  wifi_configured: 'WiFi configurado',
  device_connected: 'Dispositivo conectado',
  device_disconnected: 'Dispositivo desconectado',
  command_sent: 'Comando enviado',
}

const FILTER_TYPES = [
  { id: 'all', label: 'Todos' },
  { id: 'device', label: 'Dispositivos' },
  { id: 'user', label: 'Usuários' },
  { id: 'system', label: 'Sistema' },
]

function getActionColor(action: string): string {
  if (action.includes('added') || action.includes('connected') || action.includes('configured')) {
    return 'text-green-400'
  }
  if (action.includes('updated') || action.includes('changed') || action.includes('assigned') || action.includes('backup') || action.includes('sent')) {
    return 'text-yellow-400'
  }
  if (action.includes('deleted') || action.includes('locked') || action.includes('disconnected')) {
    return 'text-red-400'
  }
  return 'text-[var(--text-primary)]'
}

function getActionBadgeClasses(action: string): string {
  if (action.includes('added') || action.includes('connected') || action.includes('configured')) {
    return 'bg-green-500/150/150/20 text-green-400 border border-green-500/30'
  }
  if (action.includes('updated') || action.includes('changed') || action.includes('assigned') || action.includes('backup') || action.includes('sent')) {
    return 'bg-yellow-500/150/150/20 text-yellow-400 border border-yellow-500/30'
  }
  if (action.includes('deleted') || action.includes('locked') || action.includes('disconnected')) {
    return 'bg-red-500/150/150/20 text-red-400 border border-red-500/30'
  }
  return 'bg-[var(--surface)]/10 text-[var(--text-primary)] border border-white/20'
}

function formatDateTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return timestamp
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [activeFilter, setActiveFilter] = useState('all')
  const pageSize = 20

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      })
      if (activeFilter !== 'all') {
        params.set('type', activeFilter)
      }
      const res = await fetch(`/api/audit-logs?${params.toString()}`)
      if (res.ok) {
        const data: AuditLogsResponse = await res.json()
        setLogs(data.data || [])
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
      } else {
        setLogs([])
      }
    } catch (err) {
      console.error('Erro ao carregar logs de auditoria:', err)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [currentPage, activeFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleFilterChange = (filterId: string) => {
    setActiveFilter(filterId)
    setCurrentPage(1)
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <p className="text-white/60 text-sm">{total} registros de auditoria</p>
        <button
          onClick={fetchLogs}
          className="btn btn-secondary !text-white border-white/30"
        >
          <span>🔄</span>
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {FILTER_TYPES.map((filter) => (
          <button
            key={filter.id}
            onClick={() => handleFilterChange(filter.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === filter.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-[var(--surface)]/10 text-white/80 hover:bg-[var(--surface)]/20 border border-white/20'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="card bg-[var(--surface)]/10 border border-white/20 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-white/80">Carregando logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/60">
            <span className="text-4xl mb-3">📋</span>
            <p className="text-lg">Nenhum log encontrado</p>
            <p className="text-sm mt-1">Os logs de auditoria aparecerão aqui conforme as ações forem realizadas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20 bg-[var(--surface)]/5">
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white/80">Data/Hora</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white/80">Ação</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white/80">Tipo</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white/80">Alvo</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white/80">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-white/10 hover:bg-[var(--surface)]/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-white/70 whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${getActionBadgeClasses(log.action)}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/80 capitalize">
                      {log.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-medium">
                      {log.target}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/70 max-w-xs truncate" title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-white/60">
            Página {currentPage} de {totalPages} ({total} registros)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                currentPage === 1
                  ? 'bg-[var(--surface)]/5 text-white/30 cursor-not-allowed'
                  : 'bg-[var(--surface)]/10 text-white hover:bg-[var(--surface)]/20 border border-white/20'
              }`}
            >
              ← Anterior
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-[var(--surface)]/10 text-white hover:bg-[var(--surface)]/20 border border-white/20'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                currentPage === totalPages
                  ? 'bg-[var(--surface)]/5 text-white/30 cursor-not-allowed'
                  : 'bg-[var(--surface)]/10 text-white hover:bg-[var(--surface)]/20 border border-white/20'
              }`}
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
