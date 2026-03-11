'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import DeviceLocationMap from './DeviceLocationMap'
import { showAlert, showConfirm } from '../lib/dialog'

interface LocationViewProps {
  device: Device
  sendMessage?: (message: any) => void
}

interface LocationHistoryEntry {
  id: string
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
  provider: string
  address?: string
}

export default function LocationView({ device, sendMessage }: LocationViewProps) {
  const [locationHistory, setLocationHistory] = useState<LocationHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<LocationHistoryEntry | null>(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showHistoryMap, setShowHistoryMap] = useState(false)

  // Carregar histórico de localização
  useEffect(() => {
    loadLocationHistory()
  }, [device.deviceId])

  // Função para remover duplicatas do histórico
  const removeDuplicates = (history: any[]) => {
    const seen = new Set()
    return history.filter(entry => {
      const key = `${entry.deviceId}_${entry.latitude}_${entry.longitude}_${entry.timestamp}`
      if (seen.has(key)) {
        console.log('🗑️ Removendo entrada duplicada:', key)
        return false
      }
      seen.add(key)
      return true
    })
  }

  // Salvar dados de localização no localStorage quando disponíveis
  useEffect(() => {
    if (device.latitude && device.longitude) {
      const locationData = {
        deviceId: device.deviceId,
        latitude: device.latitude,
        longitude: device.longitude,
        accuracy: device.locationAccuracy,
        timestamp: device.lastLocationUpdate || Date.now(),
        provider: device.locationProvider || 'unknown',
        address: device.address
      }
      
      try {
        // Verificar se o histórico foi limpo para este dispositivo
        const clearedKey = `mdm_location_cleared_${device.deviceId}`
        const wasCleared = localStorage.getItem(clearedKey)
        
        if (wasCleared) {
          console.log('📋 Histórico foi limpo, removendo flag e permitindo novas localizações')
          localStorage.removeItem(clearedKey) // Remove o flag de limpeza
        }
        
        const saved = localStorage.getItem('mdm_location_history')
        const history = saved ? JSON.parse(saved) : []
        
        // Adicionar nova localização se não existir (verificar por coordenadas e timestamp)
        const exists = history.some((entry: any) => 
          entry.deviceId === device.deviceId && (
            entry.timestamp === locationData.timestamp ||
            (Math.abs(entry.latitude - locationData.latitude) < 0.0001 && 
             Math.abs(entry.longitude - locationData.longitude) < 0.0001 &&
             Math.abs(entry.timestamp - locationData.timestamp) < 30000) // 30 segundos de tolerância
          )
        )
        
        if (!exists) {
          console.log('📍 Adicionando nova localização ao histórico:', {
            deviceId: device.deviceId,
            coordinates: `${locationData.latitude}, ${locationData.longitude}`,
            timestamp: new Date(locationData.timestamp).toLocaleString(),
            accuracy: locationData.accuracy
          })
          
          history.unshift(locationData)
          // Manter apenas as últimas 100 localizações por dispositivo
          const deviceHistory = history.filter((entry: any) => entry.deviceId === device.deviceId)
          const otherDevices = history.filter((entry: any) => entry.deviceId !== device.deviceId)
          const limitedDeviceHistory = deviceHistory.slice(0, 100)
          
          localStorage.setItem('mdm_location_history', JSON.stringify([...otherDevices, ...limitedDeviceHistory]))
        } else {
          console.log('📍 Localização já existe no histórico, não duplicando:', {
            deviceId: device.deviceId,
            coordinates: `${locationData.latitude}, ${locationData.longitude}`,
            timestamp: new Date(locationData.timestamp).toLocaleString()
          })
        }
      } catch (error) {
        console.error('Erro ao salvar localização no localStorage:', error)
      }
    }
  }, [device.latitude, device.longitude, device.locationAccuracy, device.lastLocationUpdate, device.locationProvider, device.address, device.deviceId])

  const loadLocationHistory = async () => {
    setIsLoading(true)
    try {
      // Carregar dados salvos do localStorage
      const saved = localStorage.getItem('mdm_location_history')
      let savedHistory: any[] = []
      
      if (saved) {
        try {
          savedHistory = JSON.parse(saved)
        } catch (error) {
          console.error('Erro ao fazer parse do histórico salvo:', error)
        }
      }
      
      // Filtrar histórico para este dispositivo e remover duplicatas
      const deviceHistory = removeDuplicates(savedHistory
        .filter(entry => entry.deviceId === device.deviceId))
        .map(entry => ({
          id: `saved_${entry.timestamp}`,
          latitude: entry.latitude,
          longitude: entry.longitude,
          accuracy: entry.accuracy,
          timestamp: entry.timestamp,
          provider: entry.provider,
          address: entry.address
        }))
        .sort((a, b) => b.timestamp - a.timestamp) // Mais recentes primeiro
      
      // Se o dispositivo tem localização atual, adicionar no topo apenas se não existir no histórico salvo
      if (device.latitude && device.longitude) {
        const currentTimestamp = device.lastLocationUpdate || Date.now()
        
        // Verificar se já existe uma entrada com o mesmo timestamp no histórico salvo
        const hasCurrentInSaved = deviceHistory.some(entry => 
          Math.abs(entry.timestamp - currentTimestamp) < 1000 // 1 segundo de tolerância
        )
        
        if (!hasCurrentInSaved) {
          const currentLocation = {
            id: 'current',
            latitude: device.latitude,
            longitude: device.longitude,
            accuracy: device.locationAccuracy || 0,
            timestamp: currentTimestamp,
            provider: device.locationProvider || 'unknown',
            address: device.address
          }
          
          deviceHistory.unshift(currentLocation)
        }
      }
      
      // Verificar se o histórico foi limpo para este dispositivo
      const clearedKey = `mdm_location_cleared_${device.deviceId}`
      const wasCleared = localStorage.getItem(clearedKey)
      
      if (wasCleared) {
        console.log('📋 Histórico foi limpo para este dispositivo, não carregando dados mock')
        setLocationHistory(deviceHistory) // Mesmo que vazio, não carrega mock
      } else if (deviceHistory.length === 0) {
        // Se não há histórico salvo e não foi limpo, usar dados mock para demonstração
        console.log('📋 Carregando dados mock para demonstração')
        const mockHistory: LocationHistoryEntry[] = [
          {
            id: 'mock_1',
            latitude: -23.5505,
            longitude: -46.6333,
            accuracy: 10,
            timestamp: Date.now() - 3600000, // 1 hora atrás
            provider: 'gps',
            address: 'São Paulo, SP, Brasil'
          },
          {
            id: 'mock_2',
            latitude: -23.5510,
            longitude: -46.6340,
            accuracy: 15,
            timestamp: Date.now() - 7200000, // 2 horas atrás
            provider: 'network',
            address: 'São Paulo, SP, Brasil'
          }
        ]
        
        setLocationHistory(mockHistory)
      } else {
        setLocationHistory(deviceHistory)
      }
    } catch (error) {
      console.error('Erro ao carregar histórico de localização:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatAccuracy = (accuracy: number) => {
    if (accuracy < 10) return 'Muito precisa'
    if (accuracy < 50) return 'Precisa'
    if (accuracy < 100) return 'Moderada'
    return 'Imprecisa'
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy < 10) return 'text-green-600'
    if (accuracy < 50) return 'text-blue-600'
    if (accuracy < 100) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'gps': return '🛰️'
      case 'network': return '📡'
      case 'passive': return '📍'
      default: return '❓'
    }
  }

  const openInMaps = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`
    window.open(url, '_blank')
  }

  const handleOpenHistoryModal = () => {
    setShowHistoryModal(true)
    setShowHistoryMap(false) // Sempre abrir no modo lista
  }

  const handleCloseHistoryModal = () => {
    setShowHistoryModal(false)
    setShowHistoryMap(false) // Reset para modo lista quando fechar
  }

  const handleClearLocationHistory = async () => {
    if (!device?.deviceId) {
      console.error('❌ DeviceId não disponível')
      return
    }
    
    if (!sendMessage) {
      console.error('❌ Função sendMessage não disponível')
      showAlert('Erro: Função de comunicação não disponível. Tente recarregar a página.')
      return
    }
    
    const confirmed = await showConfirm(
      `Tem certeza que deseja limpar todo o histórico de localização do dispositivo "${device.name}"?\n\nEsta ação não pode ser desfeita e removerá ${locationHistory.length} entradas.`
    )

    if (!confirmed) return
    
    try {
      console.log('🗑️ Limpando histórico de localização...')
      console.log('   DeviceId:', device.deviceId)
      console.log('   Entradas a remover:', locationHistory.length)
      
      // Enviar comando para o dispositivo limpar o histórico
      sendMessage({
        type: 'clear_location_history',
        deviceId: device.deviceId,
        timestamp: Date.now()
      })
      
      // Limpar o histórico local imediatamente para feedback visual
      setLocationHistory([])
      
      // Limpar também o localStorage para evitar recarregamento
      try {
        const saved = localStorage.getItem('mdm_location_history')
        if (saved) {
          const history = JSON.parse(saved)
          // Remover apenas entradas deste dispositivo
          const filteredHistory = history.filter((entry: any) => entry.deviceId !== device.deviceId)
          localStorage.setItem('mdm_location_history', JSON.stringify(filteredHistory))
          
          // Marcar que o histórico foi limpo para este dispositivo
          const clearedKey = `mdm_location_cleared_${device.deviceId}`
          localStorage.setItem(clearedKey, Date.now().toString())
          
          console.log('🗑️ Histórico removido do localStorage para o dispositivo:', device.deviceId)
        }
      } catch (error) {
        console.error('❌ Erro ao limpar localStorage:', error)
      }
      
      console.log('✅ Comando de limpeza de histórico enviado')
      
      // Mostrar notificação de sucesso
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('MDM Center', {
            body: `Histórico de localização limpo para ${device.name}`,
            icon: '/icon-192.png',
            tag: 'history-cleared'
          })
        } catch (e) {
          console.error('❌ Erro ao exibir notificação:', e)
        }
      }
      
    } catch (error) {
      console.error('❌ Erro ao limpar histórico de localização:', error)
      showAlert('Erro ao limpar histórico de localização. Tente novamente.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Informações atuais de localização */}
      <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-6 flex items-center text-[var(--text-primary)]">
          📍 Localização Atual
        </h3>

        {device.latitude && device.longitude ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-base text-[var(--text-secondary)] font-medium">Coordenadas:</span>
              <span className="font-mono text-base text-[var(--text-primary)]">
                {device.latitude.toFixed(6)}, {device.longitude.toFixed(6)}
              </span>
            </div>

            {device.locationAccuracy && (
              <div className="flex items-center justify-between">
                <span className="text-base text-[var(--text-secondary)] font-medium">Precisão:</span>
                <span className={`text-base font-semibold ${getAccuracyColor(device.locationAccuracy)}`}>
                  {device.locationAccuracy.toFixed(0)}m - {formatAccuracy(device.locationAccuracy)}
                </span>
              </div>
            )}

            {device.locationProvider && (
              <div className="flex items-center justify-between">
                <span className="text-base text-[var(--text-secondary)] font-medium">Provedor:</span>
                <span className="text-base text-[var(--text-primary)] flex items-center font-medium">
                  {getProviderIcon(device.locationProvider)} {device.locationProvider.toUpperCase()}
                </span>
              </div>
            )}

            {device.lastLocationUpdate && (
              <div className="flex items-center justify-between">
                <span className="text-base text-[var(--text-secondary)] font-medium">Última atualização:</span>
                <span className="text-base text-[var(--text-primary)]">
                  {formatTimestamp(device.lastLocationUpdate)}
                </span>
              </div>
            )}

            <div className="pt-6">
              <button
                onClick={() => openInMaps(device.latitude!, device.longitude!)}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-lg font-medium"
              >
                🗺️ Abrir no Google Maps
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-36">
            <div className="text-[var(--text-muted)] text-6xl mb-6">📍</div>
            <p className="text-[var(--text-secondary)] text-lg mb-3">Localização não disponível</p>
            <p className="text-base text-[var(--text-muted)]">
              {device.isLocationEnabled ? 'Aguardando dados de GPS...' : 'GPS desabilitado'}
            </p>
          </div>
        )}
      </div>

      {/* Mapa em tempo real - apenas na aba principal, não no modal */}
      {device.latitude && device.longitude && !showHistoryModal && (
        <DeviceLocationMap 
          device={device}
          className="mb-6"
          sendMessage={sendMessage}
        />
      )}

      {/* Botão do histórico de localização */}
      <div className="flex justify-center">
        <button
          onClick={handleOpenHistoryModal}
          className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-lg font-medium"
        >
          <span className="mr-2">📋</span>
          Ver Histórico Completo
        </button>
      </div>

      {/* Modal de detalhes da localização */}
      {selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Detalhes da Localização</h3>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)]">Coordenadas</label>
                <p className="font-mono text-sm text-[var(--text-primary)]">
                  {selectedLocation.latitude}, {selectedLocation.longitude}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)]">Precisão</label>
                <p className={`text-sm ${getAccuracyColor(selectedLocation.accuracy)}`}>
                  {selectedLocation.accuracy.toFixed(0)}m - {formatAccuracy(selectedLocation.accuracy)}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)]">Provedor</label>
                <p className="text-sm text-[var(--text-primary)] flex items-center">
                  {getProviderIcon(selectedLocation.provider)} {selectedLocation.provider.toUpperCase()}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)]">Data/Hora</label>
                <p className="text-sm text-[var(--text-primary)]">{formatTimestamp(selectedLocation.timestamp)}</p>
              </div>
              
              {selectedLocation.address && (
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Endereço</label>
                  <p className="text-sm text-[var(--text-primary)]">{selectedLocation.address}</p>
                </div>
              )}
            </div>
            
            <div className="flex space-x-2 mt-6">
              <button
                onClick={() => openInMaps(selectedLocation.latitude, selectedLocation.longitude)}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                🗺️ Abrir no Maps
              </button>
              <button
                onClick={() => setSelectedLocation(null)}
                className="flex-1 bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border)] px-4 py-2 rounded-lg hover:bg-[var(--border)] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Localização */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-surface rounded-xl shadow-xl max-w-4xl w-full h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-primary flex items-center">
                <span className="mr-2">📚</span>
                Histórico de Localização
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowHistoryMap(!showHistoryMap)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    showHistoryMap 
                      ? 'bg-primary text-white' 
                      : 'bg-border-light text-secondary hover:bg-border'
                  }`}
                >
                  {showHistoryMap ? '📋 Lista' : '🗺️ Mapa'}
                </button>
                <button
                  onClick={handleCloseHistoryModal}
                  className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-[var(--text-secondary)] mt-2">Carregando histórico...</p>
                  </div>
                </div>
              ) : showHistoryMap ? (
                <div className="h-full flex flex-col gap-4 p-4">
                  <div className="flex-1 min-h-0">
                    <DeviceLocationMap 
                      device={device}
                      className="h-full rounded-lg"
                      sendMessage={sendMessage}
                    />
                  </div>
                  {locationHistory.length > 0 && (
                    <div className="flex-shrink-0 bg-[var(--surface-elevated)] rounded-lg p-4 max-h-40 overflow-y-auto">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center">
                        <span className="mr-2">📋</span>
                        Entradas de Localização ({locationHistory.length})
                      </h4>
                      <div className="space-y-2">
                        {locationHistory.slice(0, 3).map((entry, index) => (
                          <div key={entry.id} className="text-xs bg-[var(--surface)] rounded p-2 border border-[var(--border)]">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm">{index === 0 ? '📍' : getProviderIcon(entry.provider)}</span>
                                <span className="font-mono text-[var(--text-primary)]">{entry.latitude.toFixed(4)}, {entry.longitude.toFixed(4)}</span>
                              </div>
                              <span className="text-[var(--text-secondary)]">{formatTimestamp(entry.timestamp)}</span>
                            </div>
                            {entry.address && (
                              <div className="text-[var(--text-secondary)] truncate" title={entry.address}>
                                {entry.address}
                              </div>
                            )}
                          </div>
                        ))}
                        {locationHistory.length > 3 && (
                          <div className="text-xs text-[var(--text-secondary)] text-center py-1">
                            +{locationHistory.length - 3} entradas adicionais
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : locationHistory.length > 0 ? (
                <div className="p-6 overflow-y-auto h-full">
                  <div className="space-y-3">
                    {locationHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className={`card p-4 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                          entry.id === 'current' 
                            ? 'ring-2 ring-primary bg-blue-500/150/150/15'
                            : 'hover:bg-[var(--surface-elevated)]'
                        }`}
                        onClick={() => setSelectedLocation(entry)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="text-xl">
                              {entry.id === 'current' ? '📍' : getProviderIcon(entry.provider)}
                            </span>
                            <div>
                              <div className="font-mono text-sm text-primary">
                                {entry.latitude.toFixed(6)}, {entry.longitude.toFixed(6)}
                              </div>
                              {entry.address && (
                                <div className="text-xs text-secondary">{entry.address}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted">
                              {formatTimestamp(entry.timestamp)}
                            </div>
                            <div className={`text-xs font-medium ${getAccuracyColor(entry.accuracy)}`}>
                              {entry.accuracy.toFixed(0)}m
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-border-light rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">📚</span>
                    </div>
                    <h4 className="text-lg font-semibold text-primary mb-2">Nenhum histórico disponível</h4>
                    <p className="text-sm text-muted">
                      O histórico de localizações será exibido aqui quando disponível
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">
                  {locationHistory.length} entrada{locationHistory.length !== 1 ? 's' : ''} de localização
                </span>
                <div className="flex items-center gap-3">
                  {locationHistory.length > 0 && (
                    <button
                      onClick={handleClearLocationHistory}
                      className="px-4 py-2 bg-red-500/150/150 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <span>🗑️</span>
                      Limpar Histórico
                    </button>
                  )}
                  <button
                    onClick={handleCloseHistoryModal}
                    className="btn btn-primary"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
