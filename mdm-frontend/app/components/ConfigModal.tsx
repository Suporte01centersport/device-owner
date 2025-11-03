'use client'

import { useState, useEffect } from 'react'

interface User {
  id: string
  name: string
  cpf: string
}

interface ConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (users: User[]) => void
}

export default function ConfigModal({ isOpen, onClose, onSave }: ConfigModalProps) {
  const [textInput, setTextInput] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [previewUsers, setPreviewUsers] = useState<User[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Carregar usuários existentes da API
  useEffect(() => {
    if (isOpen) {
      loadExistingUsers()
    }
  }, [isOpen])

  const loadExistingUsers = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/device-users?active=true')
      const result = await response.json()
      
      if (result.success && result.users.length > 0) {
        const loadedUsers = result.users.map((u: any) => ({
          id: u.user_id,
          name: u.name,
          cpf: u.cpf
        }))
        setUsers(loadedUsers)
        // Converter para texto
        const text = loadedUsers.map((u: User) => `${u.name}\t${u.cpf}\t${u.id}`).join('\n')
        setTextInput(text)
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Preview em tempo real
  useEffect(() => {
    if (textInput.trim()) {
      try {
        const parsed = parseInput(textInput)
        setPreviewUsers(parsed)
      } catch (e) {
        setPreviewUsers([])
      }
    } else {
      setPreviewUsers([])
    }
  }, [textInput])

  const parseInput = (input: string): User[] => {
    const lines = input.trim().split('\n')
    const users: User[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      let parts: string[]
      
      // Detectar separador
      if (line.includes('\t')) {
        parts = line.split('\t')
      } else if (line.includes(',')) {
        parts = line.split(',')
      } else if (line.includes(';')) {
        parts = line.split(';')
      } else {
        parts = line.split(/\s+/)
      }
      
      if (parts.length >= 2) {
        const name = parts[0]?.trim()
        const cpf = parts[1]?.trim()
        const id = parts[2]?.trim() || `user_${i + 1}`
        
        if (name && cpf) {
          users.push({ id, name, cpf })
        }
      }
    }
    
    return users
  }

  const handleSave = async () => {
    const parsed = parseInput(textInput)
    if (parsed.length === 0) {
      alert('❌ Nenhum usuário válido encontrado. Verifique o formato.')
      return
    }

    setIsSaving(true)
    setSaveMessage('')

    try {
      // Enviar para API (bulk update)
      const response = await fetch('/api/device-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: parsed })
      })

      const result = await response.json()

      if (result.success) {
        setSaveMessage(`✅ ${result.count} usuários salvos com sucesso!`)
        // Notificar o pai com os usuários salvos
        onSave(parsed)
        setTimeout(() => {
          onClose()
        }, 1500)
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
    if (confirm('Limpar todos os usuários?')) {
      setTextInput('')
      setUsers([])
      setPreviewUsers([])
    }
  }

  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSaving) {
        onClose()
      }
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
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">👥 Usuários</h2>
              <p className="text-sm text-gray-600 mt-1">Cole os dados dos usuários abaixo</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Area */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📝 Cole os dados aqui:
                </label>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Cole direto do Excel/Sheets:&#10;Nome&#9;CPF&#9;ID&#10;João Silva&#9;123.456.789-00&#9;1&#10;Maria Santos&#9;234.567.890-11&#9;2"
                  className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none"
                />
                <p className="text-xs text-gray-500 mt-2">
                  💡 Cole diretamente do Excel/Google Sheets - o sistema detecta automaticamente
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 font-medium mb-2">📋 Formato esperado:</p>
                <div className="bg-white border border-blue-200 rounded p-2 mb-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left p-1 text-gray-500">Nome</th>
                        <th className="text-left p-1 text-gray-500">CPF</th>
                        <th className="text-left p-1 text-gray-500">ID</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr>
                        <td className="p-1">João Silva</td>
                        <td className="p-1">123.456.789-00</td>
                        <td className="p-1">1</td>
                      </tr>
                      <tr>
                        <td className="p-1">Maria Santos</td>
                        <td className="p-1">234.567.890-11</td>
                        <td className="p-1">2</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>✅ Aceita CSV (vírgula)</li>
                  <li>✅ Aceita TSV (tab do Excel/Sheets)</li>
                  <li>✅ Aceita ponto-e-vírgula</li>
                  <li>✅ ID é opcional</li>
                </ul>
              </div>
            </div>

            {/* Preview Area */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    👁️ Preview ({previewUsers.length} usuários)
                  </label>
                  {users.length > 0 && (
                    <button
                      onClick={handleClear}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      🗑️ Limpar tudo
                    </button>
                  )}
                </div>
                <div className="border border-gray-300 rounded-lg h-64 overflow-y-auto bg-gray-50">
                  {previewUsers.length > 0 ? (
                    <div className="p-4 space-y-2">
                      {previewUsers.map((user, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-xs">
                                {user.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-gray-900 truncate">{user.name}</p>
                              <p className="text-xs text-gray-600">{user.cpf}</p>
                            </div>
                            <span className="text-xs text-gray-400">#{user.id}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <div className="text-center">
                        <p className="text-2xl mb-2">📋</p>
                        <p className="text-sm">Cole os dados ao lado</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={previewUsers.length === 0 || isSaving}
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
                  Salvar {previewUsers.length > 0 && `(${previewUsers.length})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

