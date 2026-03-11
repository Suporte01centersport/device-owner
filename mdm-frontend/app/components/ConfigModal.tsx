'use client'

import { useState, useEffect } from 'react'
import { showAlert, showConfirm } from '../lib/dialog'

interface User {
  id: string
  name: string
  cpf: string
  birth_year?: number | null
  device_model?: string | null
  device_serial_number?: string | null
  role?: 'operador' | 'líder'
  unlock_password?: string | null
}

interface ConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (users: User[]) => void
  asPage?: boolean
}

const emptyForm = () => ({
  name: '',
  cpf: '',
  birth_year: '',
  device_model: '',
  device_serial_number: '',
  center_peripheral: '',
  role: 'operador' as 'operador' | 'líder',
  unlock_password: ''
})

export default function ConfigModal({ isOpen, onClose, onSave, asPage }: ConfigModalProps) {
  const [form, setForm] = useState(emptyForm())
  const [savedUsers, setSavedUsers] = useState<User[]>([])
  const [pendingUsers, setPendingUsers] = useState<User[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setPendingUsers([])
      setSaveMessage('')
      loadExistingUsers()
    }
  }, [isOpen])

  const loadExistingUsers = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/device-users?active=true')
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setLoadError(result.detail || result.error || `Erro HTTP ${response.status}`)
        setSavedUsers([])
        return
      }
      const usersList = result.users || result.data || []
      setSavedUsers(
        Array.isArray(usersList)
          ? usersList.map((u: any) => ({
              id: u.user_id || u.id,
              name: u.name,
              cpf: u.cpf,
              birth_year: u.birth_year,
              device_model: u.device_model,
              device_serial_number: u.device_serial_number,
              role: u.role || 'operador',
              unlock_password: u.unlock_password || null
            }))
          : []
      )
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
      setLoadError('Não foi possível conectar. Verifique se o PostgreSQL está rodando.')
      setSavedUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  const updateForm = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleAddUser = () => {
    const { name, cpf, birth_year, device_model, device_serial_number, center_peripheral, role, unlock_password } = form
    if (!name.trim() || !cpf.trim()) {
      showAlert('Nome e CPF são obrigatórios.')
      return
    }
    if (role === 'líder' && unlock_password.trim() && unlock_password.trim().length !== 4) {
      showAlert('A senha do líder deve ter exatamente 4 dígitos.')
      return
    }
    const userId = center_peripheral.trim() || `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const year = birth_year.trim() ? parseInt(birth_year, 10) : null
    if (year && (isNaN(year) || year < 1900 || year > new Date().getFullYear())) {
      showAlert('Ano de nascimento inválido.')
      return
    }
    const newUser: User = {
      id: userId,
      name: name.trim(),
      cpf: cpf.trim(),
      birth_year: year,
      device_model: device_model.trim() || null,
      device_serial_number: device_serial_number.trim() || null,
      role: role || 'operador',
      unlock_password: role === 'líder' && unlock_password.trim() ? unlock_password.trim() : null
    }
    setPendingUsers(prev => [...prev, newUser])
    setForm(emptyForm())
  }

  const handleRemovePending = (index: number) => {
    setPendingUsers(prev => prev.filter((_, i) => i !== index))
  }

  const handleRemoveSaved = async (userId: string) => {
    if (!await showConfirm('Remover este usuário do banco de dados?')) return
    try {
      const response = await fetch(`/api/device-users/${userId}`, { method: 'DELETE' })
      if (response.ok || response.status === 404) {
        setSavedUsers(prev => prev.filter(u => u.id !== userId))
      } else {
        setSavedUsers(prev => prev.filter(u => u.id !== userId))
      }
    } catch {
      setSavedUsers(prev => prev.filter(u => u.id !== userId))
    }
  }

  const handleSave = async () => {
    if (pendingUsers.length === 0) {
      showAlert('Adicione pelo menos um usuário na fila para salvar.')
      return
    }

    setIsSaving(true)
    setSaveMessage('')

    try {
      const payload = pendingUsers.map(u => ({
        id: u.id,
        name: u.name,
        cpf: u.cpf,
        birth_year: u.birth_year,
        device_model: u.device_model,
        device_serial_number: u.device_serial_number,
        role: u.role || 'operador',
        unlock_password: u.unlock_password || null
      }))

      const response = await fetch('/api/device-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: payload })
      })

      const result = await response.json()

      if (result.success) {
        setSaveMessage(`${result.count} usuário(s) salvo(s) com sucesso!`)
        onSave(pendingUsers)
        setSavedUsers(prev => {
          const existingIds = new Set(prev.map(u => u.id))
          const newOnes = pendingUsers.filter(u => !existingIds.has(u.id))
          return [...prev, ...newOnes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        })
        setPendingUsers([])
        setForm(emptyForm())
      } else {
        showAlert(`Erro ao salvar: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao salvar usuários:', error)
      showAlert('Erro ao conectar com o servidor')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearPending = async () => {
    if (await showConfirm('Limpar a fila?')) {
      setPendingUsers([])
      setForm(emptyForm())
    }
  }

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSaving) onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, isSaving, onClose])

  if (!isOpen) return null

  const sortedSaved = [...savedUsers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const outerClass = asPage
    ? 'p-6 w-full flex justify-center'
    : 'fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto'

  return (
    <div className={outerClass} onClick={asPage ? undefined : onClose}>
      <div
        className="w-full max-w-lg my-8"
        onClick={asPage ? undefined : (e) => e.stopPropagation()}
      >
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Cadastrar Usuário</h2>
              <p className="text-xs text-[var(--text-muted)]">Preencha os dados e adicione à fila</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-white/10 transition-colors"
              title={asPage ? 'Voltar' : 'Fechar'}
            >
              {asPage ? '←' : '✕'}
            </button>
          </div>

          {loadError && (
            <div className="mx-5 mt-4 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs">
              {loadError}
            </div>
          )}

          {/* Form */}
          <div className="p-5 space-y-4">
            {/* Nome + CPF */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">CPF *</label>
                <input
                  type="text"
                  value={form.cpf}
                  onChange={(e) => updateForm('cpf', e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>
            </div>

            {/* Ano + Periférico */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Ano nasc.</label>
                <input
                  type="number"
                  value={form.birth_year}
                  onChange={(e) => updateForm('birth_year', e.target.value)}
                  placeholder="1990"
                  min={1900}
                  max={new Date().getFullYear()}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">ID periférico</label>
                <input
                  type="text"
                  value={form.center_peripheral}
                  onChange={(e) => updateForm('center_peripheral', e.target.value)}
                  placeholder="Nº Center"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>
            </div>

            {/* Tipo + Senha líder */}
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Tipo:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="role" checked={form.role === 'operador'} onChange={() => updateForm('role', 'operador')} className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span className="text-sm text-[var(--text-primary)]">Operador</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="role" checked={form.role === 'líder'} onChange={() => updateForm('role', 'líder')} className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span className="text-sm text-[var(--text-primary)]">Líder</span>
              </label>
              {form.role === 'líder' && (
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.unlock_password}
                  onChange={(e) => updateForm('unlock_password', e.target.value.replace(/\D/g, ''))}
                  placeholder="Senha 4 dig."
                  className="w-28 px-3 py-1.5 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
                />
              )}
            </div>

            {/* Modelo + Serial */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Modelo celular</label>
                <input
                  type="text"
                  value={form.device_model}
                  onChange={(e) => updateForm('device_model', e.target.value)}
                  placeholder="Galaxy A54"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nº de série</label>
                <input
                  type="text"
                  value={form.device_serial_number}
                  onChange={(e) => updateForm('device_serial_number', e.target.value)}
                  placeholder="Serial number"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
                />
              </div>
            </div>

            {/* Add button */}
            <button
              onClick={handleAddUser}
              disabled={!form.name.trim() || !form.cpf.trim()}
              className="w-full px-4 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-black font-semibold rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Adicionar à fila
            </button>

            {/* Pending queue */}
            {pendingUsers.length > 0 && (
              <div className="border border-[var(--primary)]/30 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-[var(--primary)]/10 flex justify-between items-center">
                  <span className="text-xs font-semibold text-[var(--primary)]">Fila ({pendingUsers.length})</span>
                  <button onClick={handleClearPending} className="text-xs text-red-400 hover:text-red-300">Limpar</button>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {pendingUsers.map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{user.role === 'líder' ? '👑' : '👤'}</span>
                        <span className="text-[var(--text-primary)] font-medium">{user.name}</span>
                        <span className="text-[var(--text-muted)] text-xs">{user.cpf}</span>
                      </div>
                      <button onClick={() => handleRemovePending(idx)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {saveMessage && (
              <div className="p-2.5 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm text-center">
                {saveMessage}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-between">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-[var(--text-primary)] rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {asPage ? 'Voltar' : 'Fechar'}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded-lg transition-colors"
              >
                {showSaved ? 'Ocultar' : 'Ver'} cadastrados ({sortedSaved.length})
              </button>
              <button
                onClick={handleSave}
                disabled={pendingUsers.length === 0 || isSaving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSaving ? <><span className="animate-spin inline-block">⏳</span> Salvando...</> : <>Salvar {pendingUsers.length > 0 && `(${pendingUsers.length})`}</>}
              </button>
            </div>
          </div>

          {/* Saved users expandable */}
          {showSaved && (
            <div className="border-t border-[var(--border)] max-h-64 overflow-y-auto">
              {sortedSaved.length === 0 ? (
                <div className="p-6 text-center text-[var(--text-muted)] text-sm">
                  {isLoading ? 'Carregando...' : 'Nenhum usuário cadastrado.'}
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {sortedSaved.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm">{user.role === 'líder' ? '👑' : '👤'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {user.cpf}{user.device_model ? ` · ${user.device_model}` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveSaved(user.id)}
                        className="flex-shrink-0 text-[var(--text-muted)] hover:text-red-400 text-xs transition-colors ml-2"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
