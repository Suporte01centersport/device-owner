'use client'

import { useState, useEffect } from 'react'
import { DeviceGroup, AppPolicy, Device } from '../types/device'

interface AppPolicyModalProps {
  group: DeviceGroup | null
  isOpen: boolean
  onClose: () => void
  onSave: (policy: AppPolicy) => void
  onDelete: (policyId: string) => void
}

export default function AppPolicyModal({ 
  group, 
  isOpen, 
  onClose, 
  onSave, 
  onDelete 
}: AppPolicyModalProps) {
  const [newPolicy, setNewPolicy] = useState({
    packageName: '',
    appName: '',
    isAllowed: true,
    policyType: 'allow' as 'allow' | 'block' | 'require'
  })
  
  const [editingPolicy, setEditingPolicy] = useState<AppPolicy | null>(null)
  const [availableApps, setAvailableApps] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Carregar aplicativos disponíveis dos dispositivos do grupo
  useEffect(() => {
    if (group && isOpen) {
      loadAvailableApps()
    }
  }, [group, isOpen])

  const loadAvailableApps = async () => {
    setLoading(true)
    try {
      // Simular carregamento de apps dos dispositivos do grupo
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Dados mock de aplicativos disponíveis
      const mockApps = [
        { packageName: 'com.microsoft.office.outlook', appName: 'Microsoft Outlook' },
        { packageName: 'com.spotify.music', appName: 'Spotify' },
        { packageName: 'com.whatsapp', appName: 'WhatsApp' },
        { packageName: 'com.google.android.gm', appName: 'Gmail' },
        { packageName: 'com.android.chrome', appName: 'Google Chrome' },
        { packageName: 'com.microsoft.teams', appName: 'Microsoft Teams' },
        { packageName: 'com.slack', appName: 'Slack' },
        { packageName: 'com.zoom.videomeetings', appName: 'Zoom' },
        { packageName: 'com.google.android.apps.docs', appName: 'Google Docs' },
        { packageName: 'com.adobe.reader', appName: 'Adobe Acrobat Reader' }
      ]
      
      setAvailableApps(mockApps)
    } catch (error) {
      console.error('Erro ao carregar aplicativos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSavePolicy = () => {
    if (!newPolicy.packageName || !newPolicy.appName) {
      alert('Por favor, preencha todos os campos obrigatórios')
      return
    }

    const policy: AppPolicy = {
      id: editingPolicy?.id || `policy_${Date.now()}`,
      packageName: newPolicy.packageName,
      appName: newPolicy.appName,
      isAllowed: newPolicy.isAllowed,
      policyType: newPolicy.policyType
    }

    onSave(policy)
    
    // Limpar formulário
    setNewPolicy({
      packageName: '',
      appName: '',
      isAllowed: true,
      policyType: 'allow'
    })
    setEditingPolicy(null)
  }

  const handleEditPolicy = (policy: AppPolicy) => {
    setEditingPolicy(policy)
    setNewPolicy({
      packageName: policy.packageName,
      appName: policy.appName,
      isAllowed: policy.isAllowed,
      policyType: policy.policyType
    })
  }

  const handleDeletePolicy = (policyId: string) => {
    if (window.confirm('Tem certeza que deseja deletar esta política?')) {
      onDelete(policyId)
    }
  }

  const handleAppSelect = (app: any) => {
    setNewPolicy({
      ...newPolicy,
      packageName: app.packageName,
      appName: app.appName
    })
  }

  // Fechar ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  if (!isOpen || !group) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-primary">
            Políticas de Aplicativos - {group.name}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Formulário de Nova Política */}
          <div className="space-y-4">
            <h4 className="text-md font-medium text-primary">
              {editingPolicy ? 'Editar Política' : 'Nova Política'}
            </h4>
            
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                Selecionar Aplicativo
              </label>
              <select
                value={newPolicy.packageName}
                onChange={(e) => {
                  const selectedApp = availableApps.find(app => app.packageName === e.target.value)
                  if (selectedApp) {
                    handleAppSelect(selectedApp)
                  }
                }}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Selecione um aplicativo...</option>
                {availableApps.map((app) => (
                  <option key={app.packageName} value={app.packageName}>
                    {app.appName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                Nome do Aplicativo
              </label>
              <input
                type="text"
                value={newPolicy.appName}
                onChange={(e) => setNewPolicy({ ...newPolicy, appName: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Nome do aplicativo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                Tipo de Política
              </label>
              <select
                value={newPolicy.policyType}
                onChange={(e) => setNewPolicy({ ...newPolicy, policyType: e.target.value as any })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="allow">Permitir (Allow)</option>
                <option value="block">Bloquear (Block)</option>
                <option value="require">Obrigatório (Require)</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isAllowed"
                checked={newPolicy.isAllowed}
                onChange={(e) => setNewPolicy({ ...newPolicy, isAllowed: e.target.checked })}
                className="mr-2"
              />
              <label htmlFor="isAllowed" className="text-sm text-secondary">
                Aplicativo permitido
              </label>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleSavePolicy}
                className="btn btn-primary flex-1"
                disabled={!newPolicy.packageName || !newPolicy.appName}
              >
                <span>{editingPolicy ? '💾' : '➕'}</span>
                {editingPolicy ? 'Salvar Alterações' : 'Adicionar Política'}
              </button>
              {editingPolicy && (
                <button 
                  onClick={() => {
                    setEditingPolicy(null)
                    setNewPolicy({
                      packageName: '',
                      appName: '',
                      isAllowed: true,
                      policyType: 'allow'
                    })
                  }}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Lista de Políticas Existentes */}
          <div>
            <h4 className="text-md font-medium text-primary mb-4">
              Políticas Existentes ({group.appPolicies.length})
            </h4>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-secondary">Carregando...</span>
              </div>
            ) : group.appPolicies.length === 0 ? (
              <div className="text-center py-8 text-secondary">
                <span className="text-4xl mb-2 block">📋</span>
                <p>Nenhuma política definida</p>
                <p className="text-sm">Adicione políticas para controlar aplicativos</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {group.appPolicies.map((policy) => (
                  <div 
                    key={policy.id}
                    className={`p-3 rounded-lg border ${
                      editingPolicy?.id === policy.id 
                        ? 'border-primary bg-blue-50' 
                        : 'border-border bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            policy.policyType === 'block' 
                              ? 'bg-red-100 text-red-800' 
                              : policy.policyType === 'require'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            <span className="mr-1">
                              {policy.policyType === 'block' ? '🚫' : policy.policyType === 'require' ? '✅' : '✓'}
                            </span>
                            {policy.policyType === 'block' ? 'Bloqueado' : 
                             policy.policyType === 'require' ? 'Obrigatório' : 'Permitido'}
                          </span>
                          {!policy.isAllowed && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              ❌ Desabilitado
                            </span>
                          )}
                        </div>
                        <h5 className="font-medium text-primary">{policy.appName}</h5>
                        <p className="text-xs text-secondary">{policy.packageName}</p>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleEditPolicy(policy)}
                          className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                          title="Editar política"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => handleDeletePolicy(policy.id)}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                          title="Deletar política"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Informações sobre tipos de política */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h5 className="font-medium text-primary mb-2">Tipos de Política:</h5>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                ✓ Permitir
              </span>
              <span className="text-secondary">Aplicativo pode ser usado</span>
            </div>
            <div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">
                🚫 Bloquear
              </span>
              <span className="text-secondary">Aplicativo é bloqueado</span>
            </div>
            <div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                ✅ Obrigatório
              </span>
              <span className="text-secondary">Aplicativo deve estar instalado</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

