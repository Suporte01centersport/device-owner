'use client'

import { useState, useEffect } from 'react'

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
  /** Quando true, renderiza como página (sem overlay de modal) */
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
  const [users, setUsers] = useState<User[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
        setUsers([])
        return
      }
      const usersList = result.users || result.data || []
      if (result.success && Array.isArray(usersList) && usersList.length > 0) {
        setUsers(usersList.map((u: any) => ({
          id: u.user_id || u.id,
          name: u.name,
          cpf: u.cpf,
          birth_year: u.birth_year,
          device_model: u.device_model,
          device_serial_number: u.device_serial_number,
          role: u.role || 'operador',
          unlock_password: u.unlock_password || null
        })))
      } else {
        setUsers([])
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
      setLoadError('Não foi possível conectar. Verifique se o PostgreSQL está rodando e configurado em .env.development.')
      setUsers([])
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
      alert('Nome e CPF são obrigatórios.')
      return
    }
    if (role === 'líder' && unlock_password.trim()) {
      if (unlock_password.trim().length !== 4) {
        alert('A senha do líder deve ter exatamente 4 dígitos.')
        return
      }
    }
    const userId = center_peripheral.trim() || `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const year = birth_year.trim() ? parseInt(birth_year, 10) : null
    if (year && (isNaN(year) || year < 1900 || year > new Date().getFullYear())) {
      alert('Ano de nascimento inválido.')
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
    setUsers(prev => [...prev, newUser])
    setForm(emptyForm())
  }

  const handleRemoveUser = (index: number) => {
    setUsers(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (users.length === 0) {
      alert('Adicione pelo menos um usuário para salvar.')
      return
    }

    setIsSaving(true)
    setSaveMessage('')

    try {
      const payload = users.map(u => ({
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
        setSaveMessage(`✅ ${result.count} usuário(s) salvo(s) com sucesso!`)
        onSave(users)
        setTimeout(() => onClose(), 1500)
      } else {
        alert(`❌ Erro ao salvar: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao salvar usuários:', error)
      alert('❌ Erro ao conectar com o servidor')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = () => {
    if (confirm('Limpar todos os usuários da lista?')) {
      setUsers([])
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

  const wrapperClass = asPage
    ? 'p-6 w-full'
    : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto'
  const contentClass = asPage
    ? 'bg-white rounded-xl shadow-xl w-full'
    : 'bg-white rounded-xl shadow-xl w-full max-w-5xl my-8'

  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  return (
    <div
      className={wrapperClass}
      onClick={asPage ? undefined : onClose}
    >
      <div
        className={contentClass}
        onClick={asPage ? undefined : (e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{asPage ? '👤' : '👥'} Usuários</h2>
              <p className="text-sm text-gray-500 mt-1">Preencha a ficha e salve. Usuários cadastrados aparecem à direita.</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100"
              title={asPage ? 'Voltar' : 'Fechar'}
            >
              {asPage ? '←' : '✕'}
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            ⚠️ {loadError}
          </div>
        )}

        {/* Layout: formulário à esquerda | lista à direita */}
        <div className="flex flex-col lg:flex-row gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

          {/* COLUNA ESQUERDA — Formulário */}
          <div className="flex-1 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">📋 Dados da pessoa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                <input
                  type="text"
                  value={form.cpf}
                  onChange={(e) => updateForm('cpf', e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ano de nascimento</label>
                <input
                  type="number"
                  value={form.birth_year}
                  onChange={(e) => updateForm('birth_year', e.target.value)}
                  placeholder="Ex: 1990"
                  min={1900}
                  max={new Date().getFullYear()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nº periférico na Center</label>
                <input
                  type="text"
                  value={form.center_peripheral}
                  onChange={(e) => updateForm('center_peripheral', e.target.value)}
                  placeholder="ID do periférico"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </div>

            <h3 className="text-sm font-semibold text-gray-700 pt-2">👤 Tipo de usuário</h3>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  checked={form.role === 'operador'}
                  onChange={() => updateForm('role', 'operador')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-900">Operador</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  checked={form.role === 'líder'}
                  onChange={() => updateForm('role', 'líder')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-900">Líder</span>
              </label>
            </div>
            {form.role === 'líder' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha de desbloqueio (4 dígitos)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.unlock_password}
                  onChange={(e) => updateForm('unlock_password', e.target.value.replace(/\D/g, ''))}
                  placeholder="Senha para desbloquear o celular"
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">O líder usa esta senha para desbloquear o celular na tela de cadeado.</p>
              </div>
            )}

            <h3 className="text-sm font-semibold text-gray-700 pt-2">📱 Dados do celular</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                <input
                  type="text"
                  value={form.device_model}
                  onChange={(e) => updateForm('device_model', e.target.value)}
                  placeholder="Ex: Galaxy A54"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de série</label>
                <input
                  type="text"
                  value={form.device_serial_number}
                  onChange={(e) => updateForm('device_serial_number', e.target.value)}
                  placeholder="Número de série"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Botões de ação */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleAddUser}
                disabled={!form.name.trim() || !form.cpf.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ➕ Adicionar à fila
              </button>
            </div>

            {/* Fila de usuários para salvar (abaixo do form, antes de salvar) */}
            {users.filter(u => !u.id.startsWith('user_') === false || true).length > 0 && (
              <div className="pt-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fila para salvar ({users.length})</span>
                  <button onClick={handleClear} className="text-xs text-red-500 hover:text-red-700">🗑️ Limpar fila</button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {users.map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded px-3 py-1.5 text-xs">
                      <span className="text-gray-900 font-medium">{user.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">{user.role === 'líder' ? '👑' : '👤'}</span>
                        <button onClick={() => handleRemoveUser(idx)} className="text-red-400 hover:text-red-600">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {saveMessage && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {saveMessage}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {asPage ? 'Voltar' : 'Cancelar'}
              </button>
              <button
                onClick={handleSave}
                disabled={users.length === 0 || isSaving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? <><span className="animate-spin inline-block">⏳</span> Salvando...</> : <>💾 Salvar {users.length > 0 && `(${users.length})`}</>}
              </button>
            </div>
          </div>

          {/* COLUNA DIREITA — Lista de todos os usuários cadastrados, ordem alfabética */}
          <div className="w-full lg:w-80 p-6 bg-gray-50 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                👥 Usuários cadastrados
                <span className="ml-1.5 text-xs font-normal text-gray-400">({sortedUsers.length})</span>
              </h3>
              {isLoading && <span className="text-xs text-gray-400 animate-pulse">carregando…</span>}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[480px]">
              {sortedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm text-center gap-2">
                  <span className="text-2xl">👤</span>
                  <span>Nenhum usuário ainda.<br/>Adicione pelo formulário.</span>
                </div>
              ) : (
                sortedUsers.map((user, idx) => (
                  <div
                    key={user.id || idx}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2 hover:border-blue-200 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {user.role === 'líder' ? '👑 Líder' : '👤 Operador'}
                        {user.birth_year ? ` • ${user.birth_year}` : ''}
                        {user.device_model ? ` • ${user.device_model}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">CPF: {user.cpf}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveUser(users.findIndex(u => u === user || u.id === user.id))}
                      className="flex-shrink-0 text-gray-300 hover:text-red-500 text-sm transition-colors mt-0.5"
                      title="Remover"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
