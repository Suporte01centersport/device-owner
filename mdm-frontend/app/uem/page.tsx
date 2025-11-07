'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import UEMCard from '../components/UEM/UEMCard'
import UEMModal from '../components/UEM/UEMModal'
import { Computer } from '../types/uem'

type ComputerPayload = Partial<Computer> & { computerId: string }

const OFFLINE_GRACE_PERIOD_MS = 10000

const getLastActivityTimestamp = (computer?: Partial<Computer>) => {
  if (!computer) return 0
  const heartbeat = computer.lastHeartbeat ?? 0
  const lastSeen = computer.lastSeen ?? 0
  return Math.max(heartbeat, lastSeen)
}

const ensureComputerShape = (source: ComputerPayload, fallback?: Computer): Computer => {
  return {
    id: source.id ?? fallback?.id ?? source.computerId,
    name: source.name ?? fallback?.name ?? 'Computador',
    computerId: source.computerId,
    status: source.status ?? fallback?.status ?? 'offline',
    lastSeen: source.lastSeen ?? fallback?.lastSeen ?? Date.now(),
    osType: source.osType ?? fallback?.osType ?? 'unknown',
    osVersion: source.osVersion ?? fallback?.osVersion ?? '',
    osBuild: source.osBuild ?? fallback?.osBuild,
    architecture: source.architecture ?? fallback?.architecture ?? 'unknown',
    hostname: source.hostname ?? fallback?.hostname,
    domain: source.domain ?? fallback?.domain,
    cpuModel: source.cpuModel ?? fallback?.cpuModel,
    cpuCores: source.cpuCores ?? fallback?.cpuCores,
    cpuThreads: source.cpuThreads ?? fallback?.cpuThreads,
    memoryTotal: source.memoryTotal ?? fallback?.memoryTotal ?? 0,
    memoryUsed: source.memoryUsed ?? fallback?.memoryUsed ?? 0,
    storageTotal: source.storageTotal ?? fallback?.storageTotal ?? 0,
    storageUsed: source.storageUsed ?? fallback?.storageUsed ?? 0,
    storageDrives: source.storageDrives ?? fallback?.storageDrives ?? [],
    ipAddress: source.ipAddress ?? fallback?.ipAddress,
    macAddress: source.macAddress ?? fallback?.macAddress,
    networkType: source.networkType ?? fallback?.networkType,
    wifiSSID: source.wifiSSID ?? fallback?.wifiSSID,
    isWifiEnabled: source.isWifiEnabled ?? fallback?.isWifiEnabled ?? false,
    isBluetoothEnabled: source.isBluetoothEnabled ?? fallback?.isBluetoothEnabled ?? false,
    agentVersion: source.agentVersion ?? fallback?.agentVersion,
    agentInstalledAt: source.agentInstalledAt ?? fallback?.agentInstalledAt,
    lastHeartbeat: source.lastHeartbeat ?? fallback?.lastHeartbeat,
    loggedInUser: source.loggedInUser ?? fallback?.loggedInUser,
    assignedDeviceUserId: source.assignedDeviceUserId ?? fallback?.assignedDeviceUserId ?? null,
    assignedUser: source.assignedUser ?? fallback?.assignedUser ?? null,
    assignedUserId: source.assignedUserId ?? fallback?.assignedUserId ?? null,
    assignedUserName: source.assignedUserName ?? fallback?.assignedUserName ?? null,
    complianceStatus: source.complianceStatus ?? fallback?.complianceStatus ?? 'unknown',
    antivirusInstalled: source.antivirusInstalled ?? fallback?.antivirusInstalled ?? false,
    antivirusEnabled: source.antivirusEnabled ?? fallback?.antivirusEnabled ?? false,
    antivirusName: source.antivirusName ?? fallback?.antivirusName,
    firewallEnabled: source.firewallEnabled ?? fallback?.firewallEnabled ?? false,
    encryptionEnabled: source.encryptionEnabled ?? fallback?.encryptionEnabled ?? false,
    restrictions: { ...(fallback?.restrictions ?? {}), ...(source.restrictions ?? {}) },
    installedPrograms: source.installedPrograms ?? fallback?.installedPrograms,
    installedProgramsCount:
      source.installedProgramsCount ??
      source.installedPrograms?.length ??
      fallback?.installedProgramsCount ??
      fallback?.installedPrograms?.length ??
      0,
    latitude: source.latitude ?? fallback?.latitude,
    longitude: source.longitude ?? fallback?.longitude,
    locationAccuracy: source.locationAccuracy ?? fallback?.locationAccuracy,
    lastLocationUpdate: source.lastLocationUpdate ?? fallback?.lastLocationUpdate,
    locationSource: source.locationSource ?? fallback?.locationSource,
    locationAddress: source.locationAddress ?? fallback?.locationAddress
  }
}

const mergeComputerState = (existing: Computer | undefined, incoming: ComputerPayload): Computer => {
  const normalized = ensureComputerShape(incoming, existing)

  if (!existing) {
    return normalized
  }

  const lastActivityExisting = getLastActivityTimestamp(existing)
  const lastActivityIncoming = getLastActivityTimestamp(normalized)

  const merged: Computer = {
    ...existing,
    ...normalized,
    restrictions: normalized.restrictions,
    installedPrograms: normalized.installedPrograms ?? existing.installedPrograms,
    installedProgramsCount: normalized.installedProgramsCount
  }

  merged.lastSeen = Math.max(existing.lastSeen, normalized.lastSeen)

  const heartbeatExisting = existing.lastHeartbeat ?? 0
  const heartbeatIncoming = normalized.lastHeartbeat ?? 0
  const resolvedHeartbeat = Math.max(heartbeatExisting, heartbeatIncoming)
  merged.lastHeartbeat = resolvedHeartbeat > 0 ? resolvedHeartbeat : undefined

  if (lastActivityIncoming >= lastActivityExisting) {
    merged.status = normalized.status
  } else {
    merged.status = existing.status
  }

  return merged
}

const buildComputerPayload = (raw: any, fallbackId?: string): ComputerPayload | null => {
  const computerId = raw?.computerId ?? fallbackId
  if (!computerId) {
    return null
  }
  return { ...raw, computerId }
}

export default function UEMPage() {
  const [computers, setComputers] = useState<Computer[]>([])
  const [selectedComputer, setSelectedComputer] = useState<Computer | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [websocket, setWebsocket] = useState<WebSocket | null>(null)
  const isMountedRef = useRef(false)
  const lastRequestId = useRef(0)
  const offlineTimersRef = useRef<Record<string, NodeJS.Timeout>>({})

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      Object.values(offlineTimersRef.current).forEach(timer => clearTimeout(timer))
      offlineTimersRef.current = {}
    }
  }, [])

  const clearPendingOffline = useCallback((computerId: string) => {
    const timers = offlineTimersRef.current
    const pending = timers[computerId]
    if (pending) {
      clearTimeout(pending)
      delete timers[computerId]
    }
  }, [])

  const scheduleOfflineUpdate = useCallback((payload: ComputerPayload) => {
    const computerId = payload.computerId
    if (!computerId) {
      return
    }

    const timers = offlineTimersRef.current
    if (timers[computerId]) {
      clearTimeout(timers[computerId])
    }

    timers[computerId] = setTimeout(() => {
      delete timers[computerId]

      setComputers(prev => {
        const index = prev.findIndex(c => c.computerId === computerId)
        const normalized = ensureComputerShape({ ...payload, status: 'offline' }, index >= 0 ? prev[index] : undefined)

        if (index === -1) {
          return [...prev, normalized]
        }

        if (prev[index].status === 'offline') {
          const merged = mergeComputerState(prev[index], normalized)
          if (merged === prev[index]) {
            return prev
          }
          const next = [...prev]
          next[index] = merged
          return next
        }

        const next = [...prev]
        next[index] = mergeComputerState(prev[index], normalized)
        return next
      })
    }, OFFLINE_GRACE_PERIOD_MS)
  }, [])

  const mergeComputers = useCallback((incoming: Computer[]) => {
    if (!incoming || incoming.length === 0) {
      setComputers(prev => (prev.length === 0 ? prev : []))
      return
    }

    setComputers(prev => {
      const prevMap = new Map(prev.map(computer => [computer.computerId, computer]))
      const mergedList: Computer[] = []

      incoming.forEach(rawComputer => {
        if (!rawComputer || !rawComputer.computerId) {
          return
        }

        const existing = prevMap.get(rawComputer.computerId)
        const merged = mergeComputerState(existing, rawComputer)

        if (rawComputer.status === 'online') {
          clearPendingOffline(rawComputer.computerId)
        }

        if (rawComputer.status === 'offline' && existing && existing.status === 'online') {
          scheduleOfflineUpdate(rawComputer)
          merged.status = existing.status
        }

        mergedList.push(merged)
        prevMap.delete(rawComputer.computerId)
      })

      // Preservar computadores que não vieram na lista atual (útil para evitar sumiço em caso de resposta parcial)
      prevMap.forEach(remaining => {
        mergedList.push(remaining)
      })

      return mergedList
    })
  }, [clearPendingOffline, scheduleOfflineUpdate])

  const upsertComputer = useCallback((payload: ComputerPayload) => {
    setComputers(prev => {
      const index = prev.findIndex(computer => computer.computerId === payload.computerId)
      if (index === -1) {
        const normalized = ensureComputerShape(payload)
        if (payload.status === 'online') {
          clearPendingOffline(payload.computerId)
        }
        if (payload.status === 'offline') {
          scheduleOfflineUpdate(payload)
        }
        return [...prev, normalized]
      }

      const updated = [...prev]
      if (payload.status === 'online') {
        clearPendingOffline(payload.computerId)
        updated[index] = mergeComputerState(prev[index], payload)
      } else {
        if (prev[index].status === 'online') {
          scheduleOfflineUpdate(payload)
        } else {
          updated[index] = mergeComputerState(prev[index], payload)
        }
      }
      return updated
    })
  }, [clearPendingOffline, scheduleOfflineUpdate])

  const loadComputers = useCallback(
    async (showSpinner: boolean) => {
      const requestId = ++lastRequestId.current

      if (showSpinner) {
        if (isMountedRef.current) {
          setLoading(true)
        }
      } else if (isMountedRef.current) {
        setIsRefreshing(true)
      }

      try {
        const response = await fetch('/api/uem/computers')
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        if (requestId !== lastRequestId.current || !isMountedRef.current) {
          return
        }

        if (data.success && Array.isArray(data.computers)) {
          mergeComputers(data.computers as Computer[])
        }
      } catch (error) {
        if (requestId === lastRequestId.current) {
          console.error('Erro ao carregar computadores:', error)
        }
      } finally {
        if (requestId === lastRequestId.current && isMountedRef.current) {
          if (showSpinner) {
            setLoading(false)
          }
          setIsRefreshing(false)
        }
      }
    },
    [mergeComputers]
  )

  useEffect(() => {
    loadComputers(true)
    const interval = setInterval(() => loadComputers(false), 30000)

    return () => {
      clearInterval(interval)
    }
  }, [loadComputers])

  useEffect(() => {
    const hostname = window.location.hostname
    const wsHost = hostname === 'localhost' || hostname === '127.0.0.1' ? 'localhost' : hostname
    const wsUrl = `ws://${wsHost}:3002`
    const socket = new WebSocket(wsUrl)

    const handleOpen = () => {
      if (!isMountedRef.current) {
        socket.close()
        return
      }

      console.log('✅ WebSocket conectado para UEM')
      socket.send(
        JSON.stringify({
          type: 'web_client',
          timestamp: Date.now()
        })
      )
      setWebsocket(socket)
    }

    const handleMessage = (event: MessageEvent) => {
      if (!isMountedRef.current) {
        return
      }

      try {
        const message = JSON.parse(event.data)

        if (message.type === 'desktop_frame') {
          return
        }

        if (message.type === 'computer_status_update') {
          const payload = buildComputerPayload(message.computer, message.computerId)
          if (payload) {
            upsertComputer(payload)
          }
        } else if (message.type === 'computer_disconnected') {
          const computerId = message.computerId
          if (computerId) {
            scheduleOfflineUpdate({
              computerId,
              status: 'offline',
              lastSeen: message.timestamp ?? Date.now()
            })
          }
        }
      } catch (error) {
        console.error('Erro ao processar mensagem WebSocket:', error)
      }
    }

    const handleClose = (event: CloseEvent) => {
      if (event.code !== 1000) {
        console.log('WebSocket desconectado', event.code)
      }
      if (isMountedRef.current) {
        setWebsocket(null)
      }
    }

    const handleError = (error: Event) => {
      if (isMountedRef.current && socket.readyState === WebSocket.OPEN) {
        console.error('Erro WebSocket:', error)
      }
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose)
    socket.addEventListener('error', handleError)

    return () => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('close', handleClose)
      socket.removeEventListener('error', handleError)

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Component unmounting')
      }

      if (isMountedRef.current) {
        setWebsocket(null)
      }
    }
  }, [scheduleOfflineUpdate, upsertComputer])

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

      {isRefreshing && !loading && (
        <div className="flex items-center gap-2 text-sm text-blue-600 mb-4">
          <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping"></span>
          <span>Atualizando dados...</span>
        </div>
      )}

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

