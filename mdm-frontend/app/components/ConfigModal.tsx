'use client'

import { useState, useEffect } from 'react'
import { showAlert, showConfirm } from '../lib/dialog'

interface User {
  id: string
  name: string
  cpf: string
  birth_date?: string | null
  device_model?: string | null
  device_serial_number?: string | null
  role?: 'operador' | 'líder'
  leader_type?: string | null
  unlock_password?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface ConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (users: User[]) => void
  asPage?: boolean
}

const MONTHS = [
  { value: '', label: 'Mês' },
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]

const currentYear = new Date().getFullYear()
const YEARS: { value: string; label: string }[] = [{ value: '', label: 'Ano' }]
for (let y = currentYear; y >= 1950; y--) {
  YEARS.push({ value: String(y), label: String(y) })
}

const DAYS: { value: string; label: string }[] = [{ value: '', label: 'Dia' }]
for (let d = 1; d <= 31; d++) {
  DAYS.push({ value: String(d), label: String(d) })
}

const emptyForm = () => ({
  name: '',
  cpf: '',
  birth_day: '',
  birth_month: '',
  birth_year: '',
  device_model: '',
  device_serial_number: '',
  center_peripheral: '',
  role: 'operador' as 'operador' | 'líder',
  leader_type: '' as string,
  unlock_password: ''
})

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

function parseBirthDate(dateStr: string | null | undefined): { day: string; month: string; year: string } {
  if (!dateStr) return { day: '', month: '', year: '' }
  try {
    const match = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (match) {
      return {
        year: String(parseInt(match[1], 10)),
        month: String(parseInt(match[2], 10)),
        day: String(parseInt(match[3], 10))
      }
    }
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      return {
        day: String(d.getUTCDate()),
        month: String(d.getUTCMonth() + 1),
        year: String(d.getUTCFullYear())
      }
    }
  } catch { /* ignorar */ }
  return { day: '', month: '', year: '' }
}

// Senha do admin para desbloquear data de nascimento
const ADMIN_PASSWORD = 'admin@123'

export default function ConfigModal({ isOpen, onClose, onSave, asPage }: ConfigModalProps) {
  const [form, setForm] = useState(emptyForm())
  const [savedUsers, setSavedUsers] = useState<User[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [birthDateLocked, setBirthDateLocked] = useState(false)
  const [showAdminPrompt, setShowAdminPrompt] = useState(false)
  const [adminInput, setAdminInput] = useState('')

  useEffect(() => {
    if (isOpen) {
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
              birth_date: u.birth_date || null,
              device_model: u.device_model,
              device_serial_number: u.device_serial_number,
              role: u.role || 'operador',
              leader_type: u.leader_type || null,
              unlock_password: u.unlock_password || null,
              created_at: u.created_at || null,
              updated_at: u.updated_at || null
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

  const formatCpf = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }

  const updateForm = (field: string, value: string) => {
    if (field === 'cpf') {
      setForm(prev => ({ ...prev, cpf: formatCpf(value) }))
    } else {
      setForm(prev => ({ ...prev, [field]: value }))
    }
  }

  const handleUnlockBirthDate = () => {
    if (adminInput === ADMIN_PASSWORD) {
      setBirthDateLocked(false)
      setShowAdminPrompt(false)
      setAdminInput('')
      showAlert('✅ Data de nascimento desbloqueada para edição.')
    } else {
      showAlert('❌ Senha incorreta.')
      setAdminInput('')
    }
  }

  const handleSaveUser = async () => {
    const { name, cpf, birth_day, birth_month, birth_year, device_model, device_serial_number, center_peripheral, role, leader_type, unlock_password } = form
    if (!name.trim() || !cpf.trim()) {
      showAlert('Nome e CPF são obrigatórios.')
      return
    }
    if (role === 'líder' && !leader_type) {
      showAlert('Selecione o tipo de líder.')
      return
    }
    if (role === 'líder' && unlock_password.trim() && (unlock_password.trim().length < 1 || unlock_password.trim().length > 10)) {
      showAlert('A senha do líder deve ter entre 1 e 10 caracteres.')
      return
    }

    // Montar birth_date
    let birthDate: string | null = null
    const day = parseInt(birth_day, 10)
    const month = parseInt(birth_month, 10)
    const year = parseInt(birth_year, 10)

    // Se está editando e a data está travada, manter a original
    if (editingUser && birthDateLocked && editingUser.birth_date) {
      birthDate = editingUser.birth_date
    } else if (birth_year) {
      if (isNaN(year) || year < 1950 || year > currentYear) {
        showAlert('Ano de nascimento inválido.')
        return
      }
      if (birth_month && (isNaN(month) || month < 1 || month > 12)) {
        showAlert('Mês de nascimento inválido.')
        return
      }
      if (birth_day && (isNaN(day) || day < 1 || day > 31)) {
        showAlert('Dia de nascimento inválido.')
        return
      }
      const m = birth_month ? String(month).padStart(2, '0') : '01'
      const d = birth_day ? String(day).padStart(2, '0') : '01'
      birthDate = `${year}-${m}-${d}`
    }

    const userId = editingUser?.id || `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const userData = {
      id: userId,
      name: name.trim(),
      cpf: cpf.trim(),
      birth_date: birthDate,
      device_model: device_model.trim() || null,
      device_serial_number: device_serial_number.trim() || null,
      role: role || 'operador',
      leader_type: role === 'líder' && leader_type ? leader_type : null,
      unlock_password: role === 'líder' && unlock_password.trim() ? unlock_password.trim() : null
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/device-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: [userData] })
      })

      const result = await response.json()

      if (result.success) {
        showAlert(editingUser ? '✅ Usuário atualizado com sucesso!' : '✅ Usuário cadastrado com sucesso!')
        onSave([userData as User])
        setForm(emptyForm())
        setEditingUser(null)
        setBirthDateLocked(false)
        setShowAdminPrompt(false)
        await loadExistingUsers()
      } else {
        showAlert(`❌ Erro ao salvar: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao salvar usuário:', error)
      showAlert('❌ Erro ao conectar com o servidor')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setShowAdminPrompt(false)
    setAdminInput('')
    // Se o usuário já tem data de nascimento, travar
    const hasBirth = !!user.birth_date
    setBirthDateLocked(hasBirth)
    const bd = parseBirthDate(user.birth_date)
    setForm({
      name: user.name,
      cpf: user.cpf,
      birth_day: bd.day,
      birth_month: bd.month,
      birth_year: bd.year,
      device_model: user.device_model || '',
      device_serial_number: user.device_serial_number || '',
      center_peripheral: '',
      role: user.role || 'operador',
      leader_type: user.leader_type || '',
      unlock_password: user.unlock_password || ''
    })
  }

  const handleCancelEdit = () => {
    setEditingUser(null)
    setBirthDateLocked(false)
    setShowAdminPrompt(false)
    setAdminInput('')
    setForm(emptyForm())
  }

  const handleRemoveSaved = async (userId: string) => {
    if (!await showConfirm('Remover este usuário do banco de dados?')) return
    try {
      await fetch(`/api/device-users/${userId}`, { method: 'DELETE' })
    } catch { /* ignorar */ }
    setSavedUsers(prev => prev.filter(u => u.id !== userId))
    if (editingUser?.id === userId) {
      setEditingUser(null)
      setBirthDateLocked(false)
      setForm(emptyForm())
    }
  }

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSaving) {
        if (showAdminPrompt) {
          setShowAdminPrompt(false)
          setAdminInput('')
        } else {
          onClose()
        }
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, isSaving, onClose, showAdminPrompt])

  if (!isOpen) return null

  const sortedSaved = [...savedUsers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const outerClass = asPage
    ? 'p-6 w-full flex justify-center'
    : 'fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto'

  const inputClass = "w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent"
  const selectClass = "w-full px-2 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent appearance-none cursor-pointer"
  const disabledSelectClass = "w-full px-2 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text-muted)] cursor-not-allowed opacity-60"

  return (
    <div className={outerClass} onClick={asPage ? undefined : onClose}>
      <div
        className="flex gap-4 my-8 max-w-5xl w-full"
        onClick={asPage ? undefined : (e) => e.stopPropagation()}
      >
        {/* CARD ESQUERDO - Formulário */}
        <div className="flex-[3] min-w-0 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-[var(--border)] flex justify-between items-center">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              {editingUser ? '✏️ Editar Usuário' : '➕ Cadastrar Usuário'}
            </h2>
            <div className="flex items-center gap-1">
              {editingUser && (
                <button onClick={handleCancelEdit} className="text-xs text-[var(--primary)] hover:opacity-80 px-2 py-1 rounded hover:bg-[var(--surface)]/10 transition-colors">Cancelar</button>
              )}
              <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]/10 rounded-lg w-7 h-7 flex items-center justify-center transition-colors">✕</button>
            </div>
          </div>

          {loadError && (
            <div className="mx-4 mt-3 p-2 bg-red-500/150/150/10 border border-red-500/30 rounded-lg text-red-400 text-xs">{loadError}</div>
          )}

          {/* Balão com ID do usuário quando editando */}
          {editingUser && (
            <div className="mx-4 mt-3 px-3 py-2 bg-blue-500/150/150/10 border border-blue-500/30 rounded-lg flex items-center gap-2">
              <span className="text-xs text-blue-400">ID do usuário:</span>
              <span className="text-xs text-blue-300 font-mono select-all">{editingUser.id}</span>
            </div>
          )}

          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Nome completo *</label>
                <input type="text" value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="Nome completo" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">CPF *</label>
                <input type="text" value={form.cpf} onChange={(e) => updateForm('cpf', e.target.value)} placeholder="000.000.000-00" className={inputClass} />
              </div>
            </div>

            {/* Data de nascimento */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-[var(--text-secondary)]">Data de nascimento</label>
                {birthDateLocked && editingUser && (
                  <button
                    onClick={() => setShowAdminPrompt(true)}
                    className="text-[10px] text-[var(--primary)] hover:opacity-80 flex items-center gap-1 transition-colors"
                  >
                    🔒 Desbloquear
                  </button>
                )}
              </div>

              {/* Prompt de senha admin */}
              {showAdminPrompt && (
                <div className="mb-2 p-2.5 bg-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-lg">
                  <p className="text-xs text-[var(--primary)] mb-2">Digite a senha do administrador para desbloquear:</p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={adminInput}
                      onChange={(e) => setAdminInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUnlockBirthDate() }}
                      placeholder="Senha do administrador"
                      className="flex-1 px-3 py-1.5 border border-[var(--primary)]/30 rounded-lg text-sm bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      autoFocus
                    />
                    <button onClick={handleUnlockBirthDate} className="px-3 py-1.5 bg-[var(--primary)] hover:opacity-80 text-[var(--text-primary)] text-xs font-semibold rounded-lg transition-colors">
                      Confirmar
                    </button>
                    <button onClick={() => { setShowAdminPrompt(false); setAdminInput('') }} className="px-2 py-1.5 bg-[var(--surface)]/10 hover:bg-[var(--surface)]/20 text-[var(--text-primary)] text-xs rounded-lg transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <select
                  value={form.birth_day}
                  onChange={(e) => updateForm('birth_day', e.target.value)}
                  className={birthDateLocked ? disabledSelectClass : selectClass}
                  disabled={birthDateLocked}
                >
                  {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <select
                  value={form.birth_month}
                  onChange={(e) => updateForm('birth_month', e.target.value)}
                  className={birthDateLocked ? disabledSelectClass : selectClass}
                  disabled={birthDateLocked}
                >
                  {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select
                  value={form.birth_year}
                  onChange={(e) => updateForm('birth_year', e.target.value)}
                  className={birthDateLocked ? disabledSelectClass : selectClass}
                  disabled={birthDateLocked}
                >
                  {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                </select>
              </div>
              {birthDateLocked && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1">🔒 Data travada. Clique em "Desbloquear" para alterar.</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Nº periférico</label>
              <input
                type="text"
                value={form.center_peripheral}
                onChange={(e) => updateForm('center_peripheral', e.target.value)}
                placeholder="Nº do periférico"
                className={inputClass}
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-[var(--text-secondary)]">Tipo:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="role" checked={form.role === 'operador'} onChange={() => { updateForm('role', 'operador'); updateForm('leader_type', '') }} className="w-3 h-3" />
                <span className="text-sm text-[var(--text-primary)]">Operador</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="role" checked={form.role === 'líder'} onChange={() => updateForm('role', 'líder')} className="w-3 h-3" />
                <span className="text-sm text-[var(--text-primary)]">Líder</span>
              </label>
            </div>
            {form.role === 'líder' && (() => {
              const LEADER_TYPES = [
                { value: 'full', label: 'Full', max: 2 },
                { value: 'estoque', label: 'Estoque', max: 2 },
                { value: 'pedidos', label: 'Pedidos', max: 2 },
                { value: 'mapeamento', label: 'Mapeamento', max: 2 },
                { value: 'ti', label: 'TI', max: 5 },
              ]
              // Contar líderes por tipo (excluir o próprio usuário editando)
              const leaderCountByType: Record<string, number> = {}
              for (const lt of LEADER_TYPES) {
                leaderCountByType[lt.value] = savedUsers.filter(
                  u => u.role === 'líder' && u.leader_type === lt.value && u.id !== editingUser?.id
                ).length
              }

              return (
                <>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Tipo de líder *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {LEADER_TYPES.map((lt) => {
                        const count = leaderCountByType[lt.value] || 0
                        const isFull = count >= lt.max
                        const isSelected = form.leader_type === lt.value
                        return (
                          <button
                            key={lt.value}
                            type="button"
                            onClick={() => {
                              if (isFull && !isSelected) return
                              updateForm('leader_type', isSelected ? '' : lt.value)
                            }}
                            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                              isSelected
                                ? 'bg-[var(--primary)] text-[var(--text-primary)] border-[var(--primary)]'
                                : isFull
                                  ? 'bg-red-500/150/150/10 border-red-500/40 text-red-400 cursor-not-allowed'
                                  : 'bg-[var(--surface-elevated)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface)]/10 cursor-pointer'
                            }`}
                          >
                            {lt.label}
                            {isFull && !isSelected && (
                              <span className="block text-[9px] text-red-400 font-bold mt-0.5">Limite máximo atingido</span>
                            )}
                            {!isFull && (
                              <span className="block text-[9px] text-[var(--text-muted)] mt-0.5">{count}/{lt.max}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Senha do líder</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={form.unlock_password}
                      onChange={(e) => updateForm('unlock_password', e.target.value.replace(/\D/g, ''))}
                      placeholder="Senha de 4 dígitos"
                      className={inputClass}
                    />
                  </div>
                </>
              )
            })()}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Modelo celular</label>
                <input type="text" value={form.device_model} onChange={(e) => updateForm('device_model', e.target.value)} placeholder="Galaxy A54" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Nº de série</label>
                <input type="text" value={form.device_serial_number} onChange={(e) => updateForm('device_serial_number', e.target.value)} placeholder="Serial number" className={inputClass} />
              </div>
            </div>

            <button
              onClick={handleSaveUser}
              disabled={!form.name.trim() || !form.cpf.trim() || isSaving}
              className="w-full px-4 py-2.5 bg-[var(--primary)] hover:opacity-80 text-[var(--text-primary)] font-semibold rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Salvando...' : editingUser ? '💾 Salvar Alterações' : '💾 Cadastrar Usuário'}
            </button>
          </div>

          <div className="px-4 py-2.5 border-t border-[var(--border)] flex justify-end">
            <button onClick={onClose} disabled={isSaving} className="px-3 py-1.5 bg-[var(--surface)]/10 hover:bg-[var(--surface)]/20 text-[var(--text-primary)] rounded-lg text-sm transition-colors disabled:opacity-50">
              {asPage ? 'Voltar' : 'Fechar'}
            </button>
          </div>
        </div>

        {/* CARD DIREITO - Cadastrados */}
        <div className="flex-[2] min-w-0 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Cadastrados ({sortedSaved.length})</h2>
            {isLoading && <span className="text-xs text-[var(--text-muted)] animate-pulse">Carregando...</span>}
          </div>
          <div className="flex-1 overflow-y-auto max-h-[560px]">
            {sortedSaved.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-muted)] text-sm text-center gap-1 p-4">
                <span className="text-2xl">👤</span>
                <span>{isLoading ? 'Carregando...' : 'Nenhum usuário cadastrado.'}</span>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {sortedSaved.map((user) => (
                  <div
                    key={user.id}
                    className={`flex items-start justify-between px-4 py-3.5 hover:bg-[var(--surface)]/5 transition-colors cursor-pointer ${editingUser?.id === user.id ? 'bg-[var(--primary)]/10 border-l-2 border-[var(--primary)]' : ''}`}
                    onClick={() => handleEditUser(user)}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="text-lg flex-shrink-0 mt-0.5">{user.role === 'líder' ? '👑' : '👤'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-[var(--text-primary)] truncate">
                          {user.name}
                          {user.role === 'líder' && user.leader_type && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] uppercase">
                              {user.leader_type}
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                          CPF: {user.cpf}
                          {user.birth_date && (
                            <span className="ml-3">🎂 {formatDateShort(user.birth_date)}</span>
                          )}
                        </p>
                        {user.device_model && (
                          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                            📱 {user.device_model}
                          </p>
                        )}
                        {user.device_serial_number && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)]">
                            S/N: {user.device_serial_number}
                          </span>
                        )}
                        <div className="flex items-center gap-4 mt-1.5">
                          <span className="text-xs text-[var(--text-muted)]" title="Data de cadastro">
                            📅 Cadastro: {formatDateShort(user.created_at)}
                          </span>
                          {user.updated_at && user.updated_at !== user.created_at && (
                            <span className="text-xs text-[var(--text-muted)]" title="Última alteração">
                              ✏️ Alterado: {formatDate(user.updated_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2 mt-1">
                      <button onClick={(e) => { e.stopPropagation(); handleEditUser(user) }} className="text-[var(--text-muted)] hover:text-[var(--primary)] text-sm transition-colors p-1.5" title="Editar">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveSaved(user.id) }} className="text-[var(--text-muted)] hover:text-red-400 text-sm transition-colors p-1.5" title="Remover">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
