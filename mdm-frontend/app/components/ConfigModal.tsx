'use client'

import { useState, useEffect } from 'react'

interface User {
  id: string
  name: string
  cpf: string
  birth_year?: number | null
  device_model?: string | null
  device_serial_number?: string | null
}

interface ConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (users: User[]) => void
}

const emptyForm = () => ({
  name: '',
  cpf: '',
  birth_year: '',
  device_model: '',
  device_serial_number: '',
  center_peripheral: ''
})

export default function ConfigModal({ isOpen, onClose, onSave }: ConfigModalProps) {
  const [form, setForm] = useState(emptyForm())
  const [users, setUsers] = useState<User[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadExistingUsers()
    }
  }, [isOpen])

  const loadExistingUsers = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/device-users?active=true')
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      const result = await response.json()
      const usersList = result.users || result.data || []
      if (result.success && Array.isArray(usersList) && usersList.length > 0) {
        setUsers(usersList.map((u: any) => ({
          id: u.user_id || u.id,
          name: u.name,
          cpf: u.cpf,
          birth_year: u.birth_year,
          device_model: u.device_model,
          device_serial_number: u.device_serial_number
        })))
      } else {
        setUsers([])
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
      alert('Erro ao carregar usuários.')
    } finally {
      setIsLoading(false)
    }
  }

  const updateForm = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleAddUser = () => {
    const { name, cpf, birth_year, device_model, device_serial_number, center_peripheral } = form
    if (!name.trim() || !cpf.trim()) {
      alert('Nome e CPF são obrigatórios.')
      return
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
      device_serial_number: device_serial_number.trim() || null
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
        device_serial_number: u.device_serial_number
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

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">👥 Usuários</h2>
              <p className="text-sm text-gray-900 mt-1">Preencha a ficha da pessoa e do celular</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Mini ficha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900/90 col-span-full">📋 Dados da pessoa</h3>
            <div>
              <label className="block text-sm font-medium text-gray-900/90 mb-1">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="Nome completo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900/90 mb-1">CPF *</label>
              <input
                type="text"
                value={form.cpf}
                onChange={(e) => updateForm('cpf', e.target.value)}
                placeholder="000.000.000-00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900/90 mb-1">Ano de nascimento</label>
              <input
                type="number"
                value={form.birth_year}
                onChange={(e) => updateForm('birth_year', e.target.value)}
                placeholder="Ex: 1990"
                min={1900}
                max={new Date().getFullYear()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900/90 mb-1">Nº periférico na Center</label>
              <input
                type="text"
                value={form.center_peripheral}
                onChange={(e) => updateForm('center_peripheral', e.target.value)}
                placeholder="ID do periférico"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-600"
              />
            </div>
            <h3 className="text-sm font-semibold text-gray-900/90 col-span-full mt-2">📱 Dados do celular</h3>
            <div>
              <label className="block text-sm font-medium text-gray-900/90 mb-1">Modelo</label>
              <input
                type="text"
                value={form.device_model}
                onChange={(e) => updateForm('device_model', e.target.value)}
                placeholder="Ex: Galaxy A54"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900/90 mb-1">Número de série</label>
              <input
                type="text"
                value={form.device_serial_number}
                onChange={(e) => updateForm('device_serial_number', e.target.value)}
                placeholder="Número de série"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900 placeholder:text-gray-600"
              />
            </div>
            <div className="col-span-full">
              <button
                onClick={handleAddUser}
                disabled={!form.name.trim() || !form.cpf.trim()}
                className="btn btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ➕ Adicionar à lista
              </button>
            </div>
          </div>

          {/* Lista de usuários adicionados */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-900">
                👁️ Lista ({users.length} usuário{users.length !== 1 ? 's' : ''})
              </label>
              {users.length > 0 && (
                <button onClick={handleClear} className="text-xs text-red-600 hover:text-red-700">
                  🗑️ Limpar lista
                </button>
              )}
            </div>
            <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto bg-gray-50">
              {isLoading ? (
                <div className="p-4 text-center text-gray-900">Carregando...</div>
              ) : users.length > 0 ? (
                <div className="p-4 space-y-2">
                  {users.map((user, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium text-sm text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-900/90">
                          CPF: {user.cpf}
                          {user.birth_year && ` • Nasc: ${user.birth_year}`}
                          {user.device_model && ` • ${user.device_model}`}
                          {user.device_serial_number && ` • Série: ${user.device_serial_number}`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveUser(idx)}
                        className="text-red-500 hover:text-red-700 text-sm"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 text-gray-900">
                  <p className="text-sm">Preencha a ficha e clique em Adicionar</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          {saveMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {saveMessage}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={users.length === 0 || isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Salvando...
                </>
              ) : (
                <>
                  <span>💾</span>
                  Salvar {users.length > 0 && `(${users.length})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
