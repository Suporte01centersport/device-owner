'use client'

import { useState, useEffect } from 'react'
import UEMCard from '../components/UEM/UEMCard'
import UEMModal from '../components/UEM/UEMModal'
import { Computer } from '../types/uem'

export default function UEMPage() {
  const [computers, setComputers] = useState<Computer[]>([])
  const [selectedComputer, setSelectedComputer] = useState<Computer | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [websocket, setWebsocket] = useState<WebSocket | null>(null)

  // Carregar computadores e conectar ao WebSocket (consolidado em um único useEffect)
  useEffect(() => {
    const loadComputers = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/uem/computers')
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setComputers(data.computers || [])
          }
        }
      } catch (error) {
        console.error('Erro ao carregar computadores:', error)
      } finally {
        setLoading(false)
      }
    }
    loadComputers()
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(loadComputers, 30000)
    
    // Conectar ao WebSocket para receber atualizações em tempo real e acesso remoto
    const hostname = window.location.hostname
    const wsHost = (hostname === 'localhost' || hostname === '127.0.0.1') 
      ? 'localhost' 
      : hostname
    const wsUrl = `ws://${wsHost}:3002`
    const websocket = new WebSocket(wsUrl)
    
    websocket.onopen = () => {
      console.log('✅ WebSocket conectado para UEM')
      websocket.send(JSON.stringify({
        type: 'web_client',
        timestamp: Date.now()
      }))
      setWebsocket(websocket) // Atualizar estado com o websocket conectado
    }
    
    // Usar addEventListener ao invés de onmessage para permitir múltiplos handlers
    const messageHandler = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data)
        
        // Ignorar mensagens de desktop_frame (são tratadas pelo RemoteDesktopViewer)
        if (message.type === 'desktop_frame') {
          return
        }
        
        // Logar todas as mensagens recebidas para debug
        if (message.type !== 'desktop_frame') { // Não logar frames (são muitos)
          // console.log('📥 Mensagem WebSocket recebida no page.tsx:', message.type) // Removido para reduzir logs
        }
        
        if (message.type === 'computer_status_update') {
          // console.log('💻 Atualização de computador recebida:', message.computerId, message.computer) // Removido para reduzir logs
          // Atualizar computador na lista
          setComputers(prev => {
            const existingIndex = prev.findIndex(c => c.computerId === message.computerId)
            if (existingIndex >= 0) {
              const updated = [...prev]
              updated[existingIndex] = { ...updated[existingIndex], ...message.computer }
              // console.log('✅ Computador atualizado na lista') // Removido para reduzir logs
              return updated
            } else {
              // Novo computador - adicionar à lista
              // console.log('🆕 Novo computador adicionado à lista:', message.computer) // Removido para reduzir logs
              const computer = message.computer
              return [...prev, {
                id: computer.id || computer.computerId,
                name: computer.name || 'Computador',
                computerId: computer.computerId || message.computerId,
                status: computer.status || 'online',
                lastSeen: computer.lastSeen || Date.now(),
                osType: computer.osType || 'unknown',
                osVersion: computer.osVersion || '',
                osBuild: computer.osBuild,
                architecture: computer.architecture || 'unknown',
                hostname: computer.hostname,
                domain: computer.domain,
                cpuModel: computer.cpuModel,
                cpuCores: computer.cpuCores,
                cpuThreads: computer.cpuThreads,
                memoryTotal: computer.memoryTotal || 0,
                memoryUsed: computer.memoryUsed || 0,
                storageTotal: computer.storageTotal || 0,
                storageUsed: computer.storageUsed || 0,
                storageDrives: computer.storageDrives || [],
                ipAddress: computer.ipAddress,
                macAddress: computer.macAddress,
                networkType: computer.networkType,
                wifiSSID: computer.wifiSSID,
                isWifiEnabled: computer.isWifiEnabled !== undefined ? computer.isWifiEnabled : false,
                isBluetoothEnabled: computer.isBluetoothEnabled !== undefined ? computer.isBluetoothEnabled : false,
                agentVersion: computer.agentVersion,
                agentInstalledAt: computer.agentInstalledAt,
                lastHeartbeat: computer.lastHeartbeat,
                loggedInUser: computer.loggedInUser,
                assignedDeviceUserId: computer.assignedDeviceUserId,
                assignedUserId: computer.assignedUserId,
                assignedUserName: computer.assignedUserName,
                complianceStatus: computer.complianceStatus || 'unknown',
                antivirusInstalled: computer.antivirusInstalled !== undefined ? computer.antivirusInstalled : false,
                antivirusEnabled: computer.antivirusEnabled !== undefined ? computer.antivirusEnabled : false,
                antivirusName: computer.antivirusName,
                firewallEnabled: computer.firewallEnabled !== undefined ? computer.firewallEnabled : false,
                encryptionEnabled: computer.encryptionEnabled !== undefined ? computer.encryptionEnabled : false,
                latitude: computer.latitude,
                longitude: computer.longitude,
                locationAccuracy: computer.locationAccuracy,
                lastLocationUpdate: computer.lastLocationUpdate,
                restrictions: computer.restrictions || {},
                installedPrograms: computer.installedPrograms || [],
                installedProgramsCount: computer.installedPrograms?.length || computer.installedProgramsCount || 0
              }]
            }
          })
        }
      } catch (error) {
        console.error('Erro ao processar mensagem WebSocket:', error)
      }
    }
    
    websocket.addEventListener('message', messageHandler)
    
    websocket.onerror = (error) => {
      console.error('Erro WebSocket:', error)
    }
    
    websocket.onclose = () => {
      console.log('WebSocket desconectado')
      setWebsocket(null)
    }
    
    return () => {
      clearInterval(interval)
      websocket.removeEventListener('message', messageHandler)
      if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
        websocket.close()
      }
    }
  }, [])

  const handleComputerClick = (computer: Computer) => {
    setSelectedComputer(computer)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedComputer(null)
  }

  const handleDeleteComputer = async (computerId: string) => {
    if (window.confirm('Tem certeza que deseja deletar este computador? Esta ação não pode ser desfeita.')) {
      try {
        const response = await fetch(`/api/uem/computers?computerId=${computerId}`, {
          method: 'DELETE'
        })
        
        if (response.ok) {
          setComputers(prev => prev.filter(c => c.computerId !== computerId))
          handleCloseModal()
        } else {
          const error = await response.json()
          alert(`Erro ao deletar: ${error.error}`)
        }
      } catch (error) {
        console.error('Erro ao deletar computador:', error)
        alert('Erro ao deletar computador')
      }
    }
  }

  const handleRemoteAction = (computer: Computer) => {
    setSelectedComputer(computer)
    setIsModalOpen(true)
    // O modal já tem a aba de ações remotas, então apenas abre o modal
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">UEM - Computadores</h1>
          <p className="text-secondary mt-1">Gerenciar computadores e ações remotas</p>
        </div>
        <div className="flex gap-3">
          <button 
            className="btn btn-primary"
            onClick={() => {
              // TODO: Implementar adicionar novo computador
              alert('Funcionalidade de adicionar computador será implementada em breve')
            }}
          >
            <span>➕</span>
            Adicionar Computador
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando computadores...</p>
          </div>
        </div>
      ) : computers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow">
            <span className="text-3xl">💻</span>
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">Nenhum computador conectado</h3>
          <p className="text-secondary mb-6">
            Conecte computadores para começar o gerenciamento UEM
          </p>
          <button 
            className="btn btn-primary btn-lg"
            onClick={() => {
              // TODO: Implementar adicionar novo computador
              alert('Funcionalidade de adicionar computador será implementada em breve')
            }}
          >
            <span>💻</span>
            Conectar Primeiro Computador
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {computers.map((computer) => (
            <UEMCard
              key={computer.computerId}
              computer={computer}
              onClick={() => handleComputerClick(computer)}
              onDelete={() => handleDeleteComputer(computer.computerId)}
              onRemoteAction={() => handleRemoteAction(computer)}
            />
          ))}
        </div>
      )}

      {/* Computer Modal */}
      {isModalOpen && selectedComputer && (
        <UEMModal
          computer={selectedComputer}
          onClose={handleCloseModal}
          onDelete={handleDeleteComputer}
          websocket={websocket || undefined}
        />
      )}
    </div>
  )
}

