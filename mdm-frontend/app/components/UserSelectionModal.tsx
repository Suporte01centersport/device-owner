'use client'

import { useState, useEffect } from 'react'

interface User {
  id: string // UUID do banco
  userId?: string // ID customizado
  name: string
  cpf: string
}

interface UserSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectUser: (userUuid: string, userId: string, userName: string) => void
  currentUserId?: string | null
}

export default function UserSelectionModal({ isOpen, onClose, onSelectUser, currentUserId }: UserSelectionModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Buscar usuários da API quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      loadUsers()
    }
  }, [isOpen])

  const loadUsers = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/device-users?active=true')
      const result = await response.json()
      
      if (result.success) {
        // Mapear para o formato esperado
        const mappedUsers = result.users.map((u: any) => ({
          id: u.id, // UUID do banco
          userId: u.user_id, // ID customizado
          name: u.name,
          cpf: u.cpf
        }))
        setUsers(mappedUsers)
      } else {
        setError('Erro ao carregar usuários')
      }
    } catch (err) {
      console.error('Erro ao buscar usuários:', err)
      setError('Erro ao conectar com o servidor')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.cpf.replace(/\D/g, '').includes(searchTerm.replace(/\D/g, ''))
  )

  const handleSelectUser = (user: User) => {
    const firstName = user.name.split(' ')[0] // Pegar apenas o primeiro nome
    onSelectUser(user.id, user.userId || user.id, firstName)
    onClose()
  }

  const handleRemoveUser = () => {
    onSelectUser('', '', '')
    onClose()
  }

  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, isLoading, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">👤 Vincular Usuário</h2>
              <p className="text-sm text-gray-600 mt-1">Selecione um usuário para vincular ao dispositivo</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            placeholder="Buscar por nome ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          {error && (
            <p className="text-xs mt-2 text-red-600">
              ❌ {error}
            </p>
          )}
          {!isLoading && users.length === 0 && !error && (
            <p className="text-xs mt-2 text-orange-600">
              ⚠️ Nenhum usuário configurado. Clique em "👥 Usuários" para adicionar.
            </p>
          )}
        </div>

        {/* User List */}
        <div className="max-h-96 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin text-4xl mb-3">⏳</div>
                <p className="text-gray-600">Carregando usuários...</p>
              </div>
            </div>
          ) : (
            <>
          {currentUserId && (
            <div className="mb-4">
              <button
                onClick={handleRemoveUser}
                className="w-full p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-xl">🚫</span>
                    </div>
                    <div>
                      <p className="font-medium text-red-900">Remover Usuário</p>
                      <p className="text-sm text-red-600">Desvincular usuário atual</p>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}

          {filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">{users.length === 0 ? '📋' : '🔍'}</span>
              </div>
              <p className="text-gray-600 font-medium">
                {users.length === 0 ? 'Lista vazia' : 'Nenhum usuário encontrado'}
              </p>
              {users.length === 0 ? (
                <p className="text-sm text-gray-500 mt-2">
                  Configure a planilha ou verifique se há dados válidos
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-2">
                  Tente outro termo de busca
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`w-full p-3 hover:bg-blue-50 border border-gray-200 rounded-lg transition-colors text-left ${
                    currentUserId === user.id ? 'bg-blue-50 border-blue-300' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-sm text-gray-600">{user.cpf}</p>
                      </div>
                    </div>
                    {currentUserId === user.id && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                          Vinculado
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

