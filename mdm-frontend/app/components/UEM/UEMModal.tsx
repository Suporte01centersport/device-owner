'use client'

import { useState, useEffect, useRef } from 'react'
import { Computer, RemoteAction } from '../../types/uem'
import RemoteAccessModal from './RemoteAccessModal'

interface UEMModalProps {
  computer: Computer
  onClose: () => void
  onDelete: (computerId: string) => void
  sendMessage?: (message: any) => void
  websocket?: WebSocket
}

export default function UEMModal({ computer, onClose, onDelete, sendMessage, websocket }: UEMModalProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [remoteActions, setRemoteActions] = useState<RemoteAction[]>([])
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [showRemoteActionModal, setShowRemoteActionModal] = useState(false)
  const [showRemoteAccessModal, setShowRemoteAccessModal] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [ipLocation, setIpLocation] = useState<{ lat: number; lng: number; city?: string; country?: string } | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(false)

  // Função auxiliar para verificar se IP é privado
  const isPrivateIP = (ip: string | undefined): boolean => {
    if (!ip) return false
    return ip.startsWith('192.168.') || 
           ip.startsWith('10.') || 
           ip.startsWith('172.') ||
           ip.startsWith('127.') ||
           ip.startsWith('169.254.')
  }

  const getLocationFromIP = async (ipAddress: string) => {
    if (!ipAddress || ipAddress === 'Unknown') {
      return null
    }

    setLoadingLocation(true)
    try {
      // Usar rota API do backend para evitar problemas de CORS
      const response = await fetch(`/api/uem/ip-location?ip=${encodeURIComponent(ipAddress)}`)
      const data = await response.json()
      
      if (data.success && data.location) {
        return {
          lat: data.location.lat,
          lng: data.location.lng,
          city: data.location.city,
          country: data.location.country
        }
      } else if (data.isPrivate) {
        // IP privado - não é possível obter localização
        console.warn('IP privado detectado:', ipAddress)
        return null
      }
    } catch (error) {
      console.error('Erro ao obter localização do IP:', error)
    } finally {
      setLoadingLocation(false)
    }
    return null
  }

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

  // Buscar localização automaticamente quando o modal abrir
  useEffect(() => {
    const loadLocationAutomatically = async () => {
      // Se já temos localização GPS do agente, usar ela
      if (computer.latitude && computer.longitude) {
        setIpLocation({
          lat: computer.latitude,
          lng: computer.longitude,
          city: computer.locationAddress?.split(',')[0] || undefined,
          country: computer.locationAddress?.split(',').pop()?.trim() || undefined
        })
        return
      }

      // Se não temos localização GPS mas temos IP público, buscar automaticamente
      if (computer.ipAddress && !isPrivateIP(computer.ipAddress) && !ipLocation) {
        const location = await getLocationFromIP(computer.ipAddress)
        if (location) {
          setIpLocation(location)
        }
      }
    }

    loadLocationAutomatically()
  }, [computer.ipAddress, computer.latitude, computer.longitude, computer.locationAddress])

  const handleLocationCardClick = async () => {
    // Se já temos localização GPS do agente, usar ela (mais precisa)
    if (computer.latitude && computer.longitude) {
      setIpLocation({
        lat: computer.latitude,
        lng: computer.longitude,
        city: computer.locationAddress?.split(',')[0] || undefined,
        country: computer.locationAddress?.split(',').pop()?.trim() || undefined
      })
      setShowLocationModal(true)
      return
    }

    // Se não temos localização GPS, tentar obter via IP público
    if (!computer.ipAddress || isPrivateIP(computer.ipAddress)) {
      alert('Localização GPS não disponível e IP é privado.\n\nPara obter localização:\n- O agente precisa estar conectado à internet\n- O computador precisa ter um IP público')
      return
    }

    // Se já temos a localização em cache, apenas abrir o modal
    if (ipLocation) {
      setShowLocationModal(true)
      return
    }

    // Buscar localização do IP
    const location = await getLocationFromIP(computer.ipAddress)
    if (location) {
      setIpLocation(location)
      setShowLocationModal(true)
    } else {
      alert('Não foi possível obter a localização aproximada do IP')
    }
  }

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

  const getWindowsVersion = (osVersion: string, osBuild?: string): string => {
    if (computer.osType !== 'Windows') {
      return ''
    }

    // Tentar extrair o número do build da versão ou do osBuild
    let buildNumber: number | null = null

    // Primeiro, tentar extrair da osVersion (formato: "Microsoft Windows NT 10.0.26100.0")
    if (osVersion) {
      // Procurar por padrão 10.0.XXXXX onde XXXXX é o build number
      const versionMatch = osVersion.match(/10\.0\.(\d+)/)
      if (versionMatch) {
        buildNumber = parseInt(versionMatch[1], 10)
      }
    }

    // Se não encontrou na osVersion, tentar extrair do osBuild
    if (buildNumber === null && osBuild) {
      // osBuild pode ser "24H2" ou um número direto
      // Tentar extrair número do build (pode estar no formato "24H2" ou "26100")
      const buildMatch = osBuild.match(/(\d{4,})/) // Pelo menos 4 dígitos para ser um build number
      if (buildMatch) {
        const extracted = parseInt(buildMatch[1], 10)
        // Se for um número grande (>= 1000), provavelmente é um build number
        if (extracted >= 1000) {
          buildNumber = extracted
        }
      }
    }

    // Determinar versão baseado no build number
    // Windows 11: Build >= 22000
    // Windows 10: Build < 22000 (mas >= 10240 para Windows 10)
    if (buildNumber !== null) {
      if (buildNumber >= 22000) {
        return 'Windows 11'
      } else if (buildNumber >= 10240) {
        return 'Windows 10'
      }
    }

    // Fallback: verificar se contém "11" ou "10" no texto
    const lowerVersion = osVersion.toLowerCase()
    const lowerBuild = osBuild?.toLowerCase() || ''
    
    if (lowerVersion.includes('11') || lowerBuild.includes('11')) {
      return 'Windows 11'
    }
    if (lowerVersion.includes('10') || lowerBuild.includes('10')) {
      return 'Windows 10'
    }

    // Se não conseguir determinar, retornar vazio
    return ''
  }

  const handleExecuteRemoteAction = async (actionId: string) => {
    // Se for acesso remoto, abrir modal especial
    if (actionId === 'remote_access') {
      setShowRemoteAccessModal(true)
      return
    }

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
                <p className="text-secondary">
                  {(() => {
                    const windowsVersion = getWindowsVersion(computer.osVersion, computer.osBuild)
                    if (computer.osType === 'Windows' && windowsVersion) {
                      return `${windowsVersion} ${computer.osVersion}`
                    }
                    return `${computer.osType} ${computer.osVersion}`
                  })()}
                </p>
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
                      <span className="text-white">📍</span>
                    </div>
                    <div>
                      <div className="text-sm text-secondary">Localização</div>
                      <div className="text-xl font-bold text-primary">
                        {(() => {
                          // Priorizar cidade do locationAddress (GPS/Agente)
                          if (computer.locationAddress) {
                            const city = computer.locationAddress.split(',')[0].trim()
                            if (city) return city
                          }
                          // Se não tiver, usar cidade do ipLocation (IP público)
                          if (ipLocation?.city) {
                            return ipLocation.city
                          }
                          // Se não tiver cidade mas tiver coordenadas GPS, não mostrar nada no título
                          return ''
                        })()}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    // Mostrar subtítulo apenas se houver informações relevantes
                    if (computer.locationAddress) {
                      const parts = computer.locationAddress.split(',')
                      if (parts.length > 1) {
                        const rest = parts.slice(1).join(',').trim()
                        if (rest) {
                          return <div className="text-xs text-muted">{rest}</div>
                        }
                      }
                    } else if (ipLocation?.country) {
                      return <div className="text-xs text-muted">{ipLocation.country}</div>
                    } else if (computer.latitude && computer.longitude) {
                      return <div className="text-xs text-muted">Coordenadas GPS</div>
                    } else if (loadingLocation) {
                      return <div className="text-xs text-muted">Buscando...</div>
                    }
                    return null
                  })()}
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
                      <span className="text-primary">
                        {(() => {
                          const windowsVersion = getWindowsVersion(computer.osVersion, computer.osBuild)
                          if (computer.osType === 'Windows' && windowsVersion) {
                            return windowsVersion
                          }
                          return computer.osType
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Versão</span>
                      <span className="text-primary text-sm">{computer.osVersion}</span>
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
                <div 
                  className={`card p-4 transition-all border-2 ${
                    isPrivateIP(computer.ipAddress)
                      ? 'border-yellow-300 bg-yellow-50 cursor-not-allowed' 
                      : 'border-transparent hover:border-primary hover:shadow-lg cursor-pointer'
                  }`}
                  onClick={isPrivateIP(computer.ipAddress) ? undefined : handleLocationCardClick}
                >
                  <h4 className="font-semibold text-primary mb-3 flex items-center justify-between">
                    <span>Localização Aproximada</span>
                    <span className="text-2xl">📍</span>
                  </h4>
                  <div className="space-y-3">
                    {loadingLocation ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="ml-2 text-secondary">Carregando localização...</span>
                      </div>
                    ) : (computer.latitude && computer.longitude) ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-secondary">Fonte</span>
                          <span className="text-primary text-xs">📍 GPS/Agente</span>
                        </div>
                        {computer.locationAddress ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-secondary">Cidade</span>
                              <span className="text-primary text-sm font-medium">
                                {computer.locationAddress.split(',')[0].trim()}
                              </span>
                            </div>
                            {computer.locationAddress.split(',').length > 1 && (
                              <div className="flex justify-between">
                                <span className="text-secondary">Região/País</span>
                                <span className="text-primary text-sm">
                                  {computer.locationAddress.split(',').slice(1).join(',').trim()}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-secondary">Coordenadas</span>
                            <span className="text-primary text-sm font-mono">
                              {computer.latitude.toFixed(4)}, {computer.longitude.toFixed(4)}
                            </span>
                          </div>
                        )}
                        {computer.locationAccuracy && (
                          <div className="flex justify-between">
                            <span className="text-secondary">Precisão</span>
                            <span className="text-primary text-sm">
                              ~{(computer.locationAccuracy / 1000).toFixed(1)} km
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-secondary">IP</span>
                          <span className="text-primary font-mono text-sm">{computer.ipAddress || 'N/A'}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border">
                          <span className="text-xs text-muted">Clique para ver no mapa</span>
                        </div>
                      </>
                    ) : ipLocation ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-secondary">Fonte</span>
                          <span className="text-primary text-xs">🌐 IP Público</span>
                        </div>
                        {ipLocation.city && (
                          <div className="flex justify-between">
                            <span className="text-secondary">Cidade</span>
                            <span className="text-primary text-sm font-medium">{ipLocation.city}</span>
                          </div>
                        )}
                        {ipLocation.country && (
                          <div className="flex justify-between">
                            <span className="text-secondary">País</span>
                            <span className="text-primary text-sm">{ipLocation.country}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-secondary">IP</span>
                          <span className="text-primary font-mono text-sm">{computer.ipAddress || 'N/A'}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border">
                          <span className="text-xs text-muted">Clique para ver no mapa</span>
                        </div>
                      </>
                    ) : isPrivateIP(computer.ipAddress) ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-secondary">IP</span>
                          <span className="text-primary font-mono text-sm">{computer.ipAddress || 'N/A'}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3">
                            <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ IP Privado</p>
                            <p className="text-xs text-yellow-700">
                              Localização GPS não disponível e IP é privado. O agente tentará obter localização via IP público automaticamente quando conectado à internet.
                            </p>
                          </div>
                        </div>
                      </>
                    ) : computer.ipAddress ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-secondary">IP</span>
                          <span className="text-primary font-mono text-sm">{computer.ipAddress}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-xs text-blue-800 font-medium mb-1">🔄 Buscando localização...</p>
                            <p className="text-xs text-blue-700">
                              A localização está sendo obtida automaticamente. Clique para atualizar.
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-secondary">Status</span>
                          <span className="text-primary text-sm">Sem informações</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="bg-gray-100 border border-gray-300 rounded-lg p-3">
                            <p className="text-xs text-gray-700">
                              IP não disponível. Aguarde o agente enviar informações de rede.
                            </p>
                          </div>
                        </div>
                      </>
                    )}
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
                        // Se for ação especial (como remote_access), tratar diferente
                        if ((action as any).special) {
                          handleExecuteRemoteAction(action.id)
                        } else {
                          setSelectedAction(action.id)
                          if (action.requiresConfirmation) {
                            if (confirm(`Tem certeza que deseja executar: ${action.name}?`)) {
                              handleExecuteRemoteAction(action.id)
                            }
                          } else {
                            handleExecuteRemoteAction(action.id)
                          }
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

      {/* Remote Access Modal */}
      {showRemoteAccessModal && (
        <RemoteAccessModal
          computer={computer}
          onClose={() => setShowRemoteAccessModal(false)}
          websocket={websocket}
        />
      )}

      {/* Location Modal */}
      {showLocationModal && (() => {
        const location = ipLocation || (computer.latitude && computer.longitude ? {
          lat: computer.latitude,
          lng: computer.longitude,
          city: computer.locationAddress?.split(',')[0] || undefined,
          country: computer.locationAddress?.split(',').pop()?.trim() || undefined
        } : null);
        
        return location && (
          <LocationMapModal
            computer={computer}
            location={location}
            onClose={() => setShowLocationModal(false)}
          />
        );
      })()}
    </div>
  )
}

// Componente Modal de Mapa de Localização
function LocationMapModal({ 
  computer, 
  location, 
  onClose 
}: { 
  computer: Computer
  location: { lat: number; lng: number; city?: string; country?: string }
  onClose: () => void 
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    const loadLeaflet = async () => {
      try {
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const cssLink = document.createElement('link')
          cssLink.rel = 'stylesheet'
          cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
          cssLink.crossOrigin = ''
          document.head.appendChild(cssLink)
        }

        if (!window.L) {
          const script = document.createElement('script')
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
          script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
          script.crossOrigin = ''
          document.head.appendChild(script)
          
          await new Promise((resolve, reject) => {
            script.onload = resolve
            script.onerror = reject
          })
        }

        setIsMapLoaded(true)
      } catch (error) {
        console.error('Erro ao carregar Leaflet:', error)
        setMapError('Erro ao carregar o mapa')
      }
    }

    loadLeaflet()
  }, [])

  useEffect(() => {
    if (!isMapLoaded || !window.L || !mapRef.current || !location) return

    try {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
      }

      const map = window.L.map(mapRef.current).setView([location.lat, location.lng], 13)

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map)

      const deviceIcon = window.L.divIcon({
        className: 'custom-device-marker',
        html: `
          <div style="
            background: #3b82f6;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
          ">
            💻
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })

      const marker = window.L.marker([location.lat, location.lng], { icon: deviceIcon }).addTo(map)

      const accuracyKm = computer.locationAccuracy ? (computer.locationAccuracy / 1000).toFixed(1) : '~10'
      const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">
            ${computer.name}
          </h3>
          <div style="font-size: 14px; color: #666;">
            <div><strong>IP:</strong> ${computer.ipAddress}</div>
            ${location.city ? `<div><strong>Cidade:</strong> ${location.city}</div>` : ''}
            ${location.country ? `<div><strong>País:</strong> ${location.country}</div>` : ''}
            <div><strong>Coordenadas:</strong> ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</div>
            <div><strong>Precisão:</strong> ~${accuracyKm} km</div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
              📍 Localização aproximada baseada no IP público
            </div>
          </div>
        </div>
      `
      marker.bindPopup(popupContent).openPopup()

      mapInstanceRef.current = map
      markerRef.current = marker

    } catch (error) {
      console.error('Erro ao criar mapa:', error)
      setMapError('Erro ao criar o mapa')
    }
  }, [isMapLoaded, location, computer])

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-xl shadow-xl max-w-4xl w-full h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-primary">Localização Aproximada</h2>
            <p className="text-secondary mt-1">
              {computer.name} • {location.city && location.country ? `${location.city}, ${location.country}` : 'Localização baseada no IP'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {mapError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-2">🗺️</div>
                <p className="text-lg font-medium">Erro ao carregar mapa</p>
                <p className="text-sm">{mapError}</p>
              </div>
            </div>
          ) : !isMapLoaded ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-lg font-medium">Carregando mapa...</p>
              </div>
            </div>
          ) : (
            <div 
              ref={mapRef} 
              className="w-full h-full" 
            />
          )}
        </div>

        <div className="p-4 border-t border-border bg-gray-50">
          <div className="text-sm text-muted text-center">
            <p>📍 Localização aproximada baseada no endereço IP público: <strong>{computer.ipAddress}</strong></p>
            {computer.locationAccuracy && (
              <p className="text-xs mt-1">
                Precisão estimada: <strong>~{(computer.locationAccuracy / 1000).toFixed(1)} km</strong>
                {computer.locationAccuracy < 10000 ? ' (Boa)' : computer.locationAccuracy < 50000 ? ' (Moderada)' : ' (Aproximada)'}
              </p>
            )}
            <p className="text-xs mt-1">
              A precisão varia conforme o tipo de conexão (fixa/móvel) e localização do provedor de internet
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Declaração global para TypeScript
declare global {
  interface Window {
    L: any
  }
}

