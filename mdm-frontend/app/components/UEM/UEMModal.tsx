'use client'

import { useState, useEffect } from 'react'
import { Computer, RemoteAction } from '../types/uem'

interface UEMModalProps {
  computer: Computer
  onClose: () => void
  onDelete: (computerId: string) => void
  sendMessage?: (message: any) => void
}

export default function UEMModal({ computer, onClose, onDelete, sendMessage }: UEMModalProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [remoteActions, setRemoteActions] = useState<RemoteAction[]>([])
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [showRemoteActionModal, setShowRemoteActionModal] = useState(false)

  useEffect(() => {
    // Carregar ações remotas disponíveis
    const loadRemoteActions = async () => {
      try {
        const response = await fetch('/api/uem/remote/actions')
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setRemoteActions(data.actions || [])
          }
        }
      } catch (error) {
        console.error('Erro ao carregar ações remotas:', error)
      }
    }
    loadRemoteActions()
  }, [])

  const formatStorage = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatLastSeen = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (days > 0) return `${days} dias atrás`
    if (hours > 0) return `${hours} horas atrás`
    if (minutes > 0) return `${minutes} minutos atrás`
    return 'Agora'
  }

  const getOSIcon = (osType: string) => {
    switch (osType) {
      case 'Windows':
        return '🪟'
      case 'Linux':
        return '🐧'
      case 'macOS':
        return '🍎'
      default:
        return '💻'
    }
  }

  const handleExecuteRemoteAction = async (actionId: string) => {
    try {
      const response = await fetch('/api/uem/remote/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: computer.computerId,
          action: actionId
        })
      })

      const result = await response.json()
      if (result.success) {
        alert(`Comando ${actionId} enviado com sucesso!`)
        setShowRemoteActionModal(false)
        
        // Se houver função sendMessage, enviar também via WebSocket
        if (sendMessage) {
          sendMessage({
            type: 'uem_remote_action',
            computerId: computer.computerId,
            action: actionId,
            timestamp: Date.now()
          })
        }
      } else {
        alert(`Erro ao executar ação: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao executar ação remota:', error)
      alert('Erro ao executar ação remota')
    }
  }

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: '📊' },
    { id: 'system', label: 'Sistema', icon: '⚙️' },
    { id: 'security', label: 'Segurança', icon: '🔒' },
    { id: 'programs', label: 'Programas', icon: '💿' },
    { id: 'network', label: 'Rede', icon: '🌐' },
    { id: 'remote', label: 'Ações Remotas', icon: '⚡' }
  ]

  const storagePercentage = computer.storageTotal > 0 
    ? Math.round((computer.storageUsed / computer.storageTotal) * 100)
    : 0

  const memoryPercentage = computer.memoryTotal > 0 
    ? Math.round((computer.memoryUsed / computer.memoryTotal) * 100)
    : 0

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-xl shadow-xl max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
                <span className="text-white text-2xl">{getOSIcon(computer.osType)}</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-primary">
                  {computer.assignedUserName ? `${computer.name} • ${computer.assignedUserName}` : computer.name}
                </h2>
                <p className="text-secondary">{computer.osType} {computer.osVersion}</p>
                <div className="flex items-center gap-4 mt-2">
                  <div className={`status-dot ${
                    computer.status === 'online' ? 'status-dot-online' : 'status-dot-offline'
                  }`} />
                  <span className="text-sm text-secondary">{computer.status}</span>
                  <span className="text-sm text-muted">•</span>
                  <span className="text-sm text-muted">{formatLastSeen(computer.lastSeen)}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-blue-50'
                    : 'border-transparent text-secondary hover:text-primary hover:bg-border-light'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <span className="text-white">💾</span>
                    </div>
                    <div>
                      <div className="text-sm text-secondary">Memória</div>
                      <div className="text-xl font-bold text-primary">
                        {memoryPercentage}%
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    {formatStorage(computer.memoryUsed)} / {formatStorage(computer.memoryTotal)}
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-success rounded-lg flex items-center justify-center">
                      <span className="text-white">💿</span>
                    </div>
                    <div>
                      <div className="text-sm text-secondary">Armazenamento</div>
                      <div className="text-xl font-bold text-primary">
                        {storagePercentage}%
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    {formatStorage(computer.storageUsed)} / {formatStorage(computer.storageTotal)}
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-warning rounded-lg flex items-center justify-center">
                      <span className="text-white">💿</span>
                    </div>
                    <div>
                      <div className="text-sm text-secondary">Programas</div>
                      <div className="text-xl font-bold text-warning">
                        {computer.installedProgramsCount}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted">Instalados</div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-info rounded-lg flex items-center justify-center">
                      <span className="text-white">✅</span>
                    </div>
                    <div>
                      <div className="text-sm text-secondary">Conformidade</div>
                      <div className={`text-xl font-bold ${
                        computer.complianceStatus === 'compliant' ? 'text-success' :
                        computer.complianceStatus === 'non_compliant' ? 'text-error' :
                        'text-secondary'
                      }`}>
                        {computer.complianceStatus === 'compliant' ? 'OK' :
                         computer.complianceStatus === 'non_compliant' ? '⚠️' : '?'}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted">Status</div>
                </div>
              </div>

              {/* System Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-primary">Informações Básicas</h3>
                  <div className="space-y-3">
                    {computer.assignedUserName && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-primary font-semibold">{computer.assignedUserName}</span>
                        </div>
                      </div>
                    )}
                    {computer.hostname && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Hostname</span>
                        <span className="text-primary">{computer.hostname}</span>
                      </div>
                    )}
                    {computer.loggedInUser && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Usuário Logado</span>
                        <span className="text-primary">{computer.loggedInUser}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-primary">Status do Sistema</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-secondary">Wi-Fi</span>
                      <span className={`badge ${computer.isWifiEnabled ? 'badge-success' : 'badge-error'}`}>
                        {computer.isWifiEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Bluetooth</span>
                      <span className={`badge ${computer.isBluetoothEnabled ? 'badge-success' : 'badge-error'}`}>
                        {computer.isBluetoothEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    {computer.agentVersion && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Agente</span>
                        <span className="text-primary">{computer.agentVersion}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-primary">Informações do Sistema</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Sistema Operacional</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-secondary">OS Type</span>
                      <span className="text-primary">{computer.osType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Versão</span>
                      <span className="text-primary">{computer.osVersion}</span>
                    </div>
                    {computer.osBuild && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Build</span>
                        <span className="text-primary">{computer.osBuild}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-secondary">Arquitetura</span>
                      <span className="text-primary">{computer.architecture}</span>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Hardware</h4>
                  <div className="space-y-2">
                    {computer.cpuModel && (
                      <div className="flex justify-between">
                        <span className="text-secondary">CPU</span>
                        <span className="text-primary text-sm">{computer.cpuModel}</span>
                      </div>
                    )}
                    {computer.cpuCores && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Núcleos</span>
                        <span className="text-primary">{computer.cpuCores}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-secondary">Memória Total</span>
                      <span className="text-primary">{formatStorage(computer.memoryTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Armazenamento Total</span>
                      <span className="text-primary">{formatStorage(computer.storageTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-primary">Segurança e Conformidade</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Status de Conformidade</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-secondary">Compliance Status</span>
                      <span className={`badge ${
                        computer.complianceStatus === 'compliant' ? 'badge-success' : 
                        computer.complianceStatus === 'non_compliant' ? 'badge-warning' : 
                        'badge-gray'
                      }`}>
                        {computer.complianceStatus === 'compliant' ? 'Conforme' :
                         computer.complianceStatus === 'non_compliant' ? 'Não Conforme' :
                         'Desconhecido'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Proteções</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-secondary">Antivírus</span>
                      <span className={`badge ${computer.antivirusInstalled && computer.antivirusEnabled ? 'badge-success' : 'badge-error'}`}>
                        {computer.antivirusInstalled && computer.antivirusEnabled ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {computer.antivirusName && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Nome</span>
                        <span className="text-primary text-sm">{computer.antivirusName}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-secondary">Firewall</span>
                      <span className={`badge ${computer.firewallEnabled ? 'badge-success' : 'badge-error'}`}>
                        {computer.firewallEnabled ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-secondary">Criptografia</span>
                      <span className={`badge ${computer.encryptionEnabled ? 'badge-success' : 'badge-error'}`}>
                        {computer.encryptionEnabled ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'programs' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-primary">Programas Instalados</h3>
              {!computer.installedPrograms || computer.installedPrograms.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">💿</span>
                  </div>
                  <h4 className="text-lg font-semibold text-primary mb-2">Nenhum programa encontrado</h4>
                  <p className="text-sm text-muted">
                    Os programas instalados serão exibidos aqui quando disponíveis
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {computer.installedPrograms.map((program, index) => (
                    <div key={index} className="card p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-primary">{program.name}</h4>
                          {program.publisher && (
                            <p className="text-sm text-secondary">{program.publisher}</p>
                          )}
                          {program.version && (
                            <p className="text-xs text-muted">Versão: {program.version}</p>
                          )}
                        </div>
                        {program.size && (
                          <span className="text-sm text-secondary">{formatStorage(program.size)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-primary">Informações de Rede</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Conexão Atual</h4>
                  <div className="space-y-2">
                    {computer.ipAddress && (
                      <div className="flex justify-between">
                        <span className="text-secondary">IP Address</span>
                        <span className="font-mono text-sm text-primary">{computer.ipAddress}</span>
                      </div>
                    )}
                    {computer.macAddress && (
                      <div className="flex justify-between">
                        <span className="text-secondary">MAC Address</span>
                        <span className="font-mono text-sm text-primary">{computer.macAddress}</span>
                      </div>
                    )}
                    {computer.wifiSSID && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Wi-Fi SSID</span>
                        <span className="text-primary">{computer.wifiSSID}</span>
                      </div>
                    )}
                    {computer.networkType && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Tipo de Rede</span>
                        <span className="text-primary">{computer.networkType}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card p-4">
                  <h4 className="font-semibold text-primary mb-3">Configurações de Rede</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-secondary">Wi-Fi</span>
                      <span className={`badge ${computer.isWifiEnabled ? 'badge-success' : 'badge-error'}`}>
                        {computer.isWifiEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Bluetooth</span>
                      <span className={`badge ${computer.isBluetoothEnabled ? 'badge-success' : 'badge-error'}`}>
                        {computer.isBluetoothEnabled ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'remote' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-primary">Ações Remotas</h3>
                <span className="text-sm text-secondary">
                  {remoteActions.length} ações disponíveis
                </span>
              </div>

              {remoteActions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">⚡</span>
                  </div>
                  <h4 className="text-lg font-semibold text-primary mb-2">Nenhuma ação disponível</h4>
                  <p className="text-sm text-muted">
                    Carregando ações remotas...
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {remoteActions.map((action) => (
                    <div
                      key={action.id}
                      className={`card p-4 cursor-pointer hover:shadow-md transition-all ${
                        action.dangerous ? 'border-l-4 border-red-500' : ''
                      }`}
                      onClick={() => {
                        setSelectedAction(action.id)
                        if (action.requiresConfirmation) {
                          if (confirm(`Tem certeza que deseja executar: ${action.name}?`)) {
                            handleExecuteRemoteAction(action.id)
                          }
                        } else {
                          handleExecuteRemoteAction(action.id)
                        }
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-primary">{action.name}</h4>
                        {action.dangerous && (
                          <span className="badge badge-error">⚠️ Perigoso</span>
                        )}
                      </div>
                      <p className="text-sm text-secondary">{action.description}</p>
                      {action.params && action.params.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs text-muted">Parâmetros: {action.params.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button
            onClick={() => onDelete(computer.computerId)}
            className="btn btn-error"
          >
            🗑️ Deletar
          </button>
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

