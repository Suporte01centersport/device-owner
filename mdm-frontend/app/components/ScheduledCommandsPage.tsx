'use client'

import { useState, useEffect, useCallback } from 'react'

interface ScheduledCommand {
  id: string
  commandType: string
  target: string
  targetDevice?: string
  scheduleType: string
  scheduleValue: string
  parameters?: string
  status: 'active' | 'inactive'
  lastExecution?: string
  createdAt: string
}

const COMMAND_TYPES = [
  { id: 'restart', label: 'Reiniciar', icon: '🔄' },
  { id: 'lock', label: 'Bloquear', icon: '🔒' },
  { id: 'update-mdm', label: 'Atualização MDM', icon: '📥' },
  { id: 'clear-cache', label: 'Limpar Cache', icon: '🧹' },
  { id: 'send-message', label: 'Enviar Mensagem', icon: '💬' },
  { id: 'report', label: 'Relatório', icon: '📊' },
]

const DAYS_OF_WEEK = [
  { id: '0', label: 'Domingo' },
  { id: '1', label: 'Segunda' },
  { id: '2', label: 'Terça' },
  { id: '3', label: 'Quarta' },
  { id: '4', label: 'Quinta' },
  { id: '5', label: 'Sexta' },
  { id: '6', label: 'Sábado' },
]

function getCommandIcon(commandType: string): string {
  const cmd = COMMAND_TYPES.find(c => c.id === commandType)
  return cmd?.icon || '📋'
}

function getCommandLabel(commandType: string): string {
  const cmd = COMMAND_TYPES.find(c => c.id === commandType)
  return cmd?.label || commandType
}

function formatSchedule(scheduleType: string, scheduleValue: string): string {
  switch (scheduleType) {
    case 'once': {
      try {
        const date = new Date(scheduleValue)
        return `Uma vez em ${date.toLocaleDateString('pt-BR')}`
      } catch {
        return `Uma vez em ${scheduleValue}`
      }
    }
    case 'daily':
      return `Diário às ${scheduleValue}`
    case 'weekly': {
      const [dayId, time] = scheduleValue.split('|')
      const day = DAYS_OF_WEEK.find(d => d.id === dayId)
      const dayLabel = day ? day.label.toLowerCase() : dayId
      return `Toda ${dayLabel} às ${time}`
    }
    default:
      return scheduleValue
  }
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts)
    return date.toLocaleString('pt-BR')
  } catch {
    return ts
  }
}

export default function ScheduledCommandsPage() {
  const [commands, setCommands] = useState<ScheduledCommand[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [commandType, setCommandType] = useState('restart')
  const [target, setTarget] = useState('all')
  const [targetDevice, setTargetDevice] = useState('')
  const [scheduleType, setScheduleType] = useState('once')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('03:00')
  const [scheduleDay, setScheduleDay] = useState('1')
  const [parameters, setParameters] = useState('')
  const [reportType, setReportType] = useState('compliance')
  const [reportFormat, setReportFormat] = useState('pdf')
  const [reportEmail, setReportEmail] = useState('')

  const fetchCommands = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduled-commands')
      if (res.ok) {
        const data = await res.json()
        setCommands(data.data || [])
      }
    } catch (err) {
      console.error('Erro ao buscar agendamentos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCommands()
  }, [fetchCommands])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    let scheduleValue = ''
    switch (scheduleType) {
      case 'once':
        scheduleValue = scheduleDate
        break
      case 'daily':
        scheduleValue = scheduleTime
        break
      case 'weekly':
        scheduleValue = `${scheduleDay}|${scheduleTime}`
        break
    }

    const payload = {
      commandType,
      target,
      targetDevice: target === 'specific' ? targetDevice : undefined,
      scheduleType,
      scheduleValue,
      parameters: commandType === 'send-message' ? parameters : undefined,
      reportType: commandType === 'report' ? reportType : undefined,
      format: commandType === 'report' ? reportFormat : undefined,
      email: commandType === 'report' ? reportEmail : undefined,
    }

    try {
      const res = await fetch('/api/scheduled-commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        // Reset form
        setCommandType('restart')
        setTarget('all')
        setTargetDevice('')
        setScheduleType('once')
        setScheduleDate('')
        setScheduleTime('03:00')
        setScheduleDay('1')
        setParameters('')
        setReportType('compliance')
        setReportFormat('pdf')
        setReportEmail('')
        fetchCommands()
      }
    } catch (err) {
      console.error('Erro ao criar agendamento:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/scheduled-commands?id=${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchCommands()
      }
    } catch (err) {
      console.error('Erro ao excluir agendamento:', err)
    }
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ' +
    'bg-[var(--surface)] border-[var(--border)] text-[var(--text-primary)] ' +
    'focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]'

  const labelClass = 'block text-sm font-medium text-[var(--text-secondary)] mb-1'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agendamentos</h1>
        <p className="text-[var(--text-secondary)] mt-1">
          Gerencie comandos agendados e automatizados para os dispositivos
        </p>
      </div>

      {/* Create Form */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border p-6 space-y-4"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Novo Agendamento</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Command Type */}
          <div>
            <label className={labelClass}>Tipo de Comando</label>
            <select
              value={commandType}
              onChange={e => setCommandType(e.target.value)}
              className={inputClass}
            >
              {COMMAND_TYPES.map(ct => (
                <option key={ct.id} value={ct.id}>
                  {ct.icon} {ct.label}
                </option>
              ))}
            </select>
          </div>

          {/* Target */}
          <div>
            <label className={labelClass}>Destino</label>
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              className={inputClass}
            >
              <option value="all">Todos os dispositivos</option>
              <option value="specific">Dispositivo específico</option>
            </select>
          </div>

          {/* Target Device Name */}
          {target === 'specific' && (
            <div>
              <label className={labelClass}>Nome do Dispositivo</label>
              <input
                type="text"
                value={targetDevice}
                onChange={e => setTargetDevice(e.target.value)}
                placeholder="Ex: Samsung A54"
                className={inputClass}
                required
              />
            </div>
          )}

          {/* Schedule Type */}
          <div>
            <label className={labelClass}>Frequência</label>
            <select
              value={scheduleType}
              onChange={e => setScheduleType(e.target.value)}
              className={inputClass}
            >
              <option value="once">Uma vez</option>
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>

          {/* Schedule Value */}
          {scheduleType === 'once' && (
            <div>
              <label className={labelClass}>Data</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          )}

          {(scheduleType === 'daily' || scheduleType === 'weekly') && (
            <div>
              <label className={labelClass}>Horário</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          )}

          {scheduleType === 'weekly' && (
            <div>
              <label className={labelClass}>Dia da Semana</label>
              <select
                value={scheduleDay}
                onChange={e => setScheduleDay(e.target.value)}
                className={inputClass}
              >
                {DAYS_OF_WEEK.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Parameters (for report) */}
          {commandType === 'report' && (
            <>
              <div>
                <label className={labelClass}>Tipo de Relatório</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value)}
                  className={inputClass}
                >
                  <option value="compliance">Compliance</option>
                  <option value="inventory">Inventário</option>
                  <option value="app-usage">Uso de Apps</option>
                  <option value="location">Localização</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Formato</label>
                <select
                  value={reportFormat}
                  onChange={e => setReportFormat(e.target.value)}
                  className={inputClass}
                >
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>E-mail de Destino</label>
                <input
                  type="email"
                  value={reportEmail}
                  onChange={e => setReportEmail(e.target.value)}
                  placeholder="usuario@exemplo.com"
                  className={inputClass}
                  required
                />
              </div>
            </>
          )}

          {/* Parameters (for send-message) */}
          {commandType === 'send-message' && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className={labelClass}>Mensagem</label>
              <textarea
                value={parameters}
                onChange={e => setParameters(e.target.value)}
                placeholder="Digite a mensagem a ser enviada..."
                rows={3}
                className={inputClass}
                required
              />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {saving ? 'Agendando...' : 'Agendar'}
          </button>
        </div>
      </form>

      {/* Commands List */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Comandos Agendados
        </h2>

        {loading ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">
            Carregando agendamentos...
          </div>
        ) : commands.length === 0 ? (
          <div
            className="text-center py-12 rounded-xl border"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            <span className="text-4xl block mb-3">📅</span>
            <p className="text-[var(--text-secondary)]">Nenhum comando agendado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {commands.map(cmd => (
              <div
                key={cmd.id}
                className="rounded-xl border p-4 space-y-3"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                }}
              >
                {/* Command Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getCommandIcon(cmd.commandType)}</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {getCommandLabel(cmd.commandType)}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      cmd.status === 'active'
                        ? 'bg-green-500/150/150/20 text-green-400'
                        : 'bg-[var(--surface-elevated)]0/20 text-[var(--text-muted)]'
                    }`}
                  >
                    {cmd.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                {/* Target */}
                <div className="text-sm text-[var(--text-secondary)]">
                  <span className="font-medium">Destino:</span>{' '}
                  {cmd.target === 'all'
                    ? 'Todos os dispositivos'
                    : cmd.targetDevice || 'Dispositivo específico'}
                </div>

                {/* Schedule */}
                <div className="text-sm text-[var(--text-secondary)]">
                  <span className="font-medium">Agenda:</span>{' '}
                  {formatSchedule(cmd.scheduleType, cmd.scheduleValue)}
                </div>

                {/* Last Execution */}
                {cmd.lastExecution && (
                  <div className="text-xs text-[var(--text-secondary)]">
                    Última execução: {formatTimestamp(cmd.lastExecution)}
                  </div>
                )}

                {/* Delete Button */}
                <div className="flex justify-end pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => handleDelete(cmd.id)}
                    className="px-3 py-1 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/150/150/10 transition-colors"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
