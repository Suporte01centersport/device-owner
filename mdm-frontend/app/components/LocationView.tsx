'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import DeviceLocationMap from './DeviceLocationMap'

interface LocationViewProps {
  device: Device
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

export default function LocationView({ device }: LocationViewProps) {
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
        const saved = localStorage.getItem('mdm_location_history')
        const history = saved ? JSON.parse(saved) : []
        
        // Adicionar nova localização se não existir
        const exists = history.some((entry: any) => 
          entry.deviceId === device.deviceId && 
          entry.timestamp === locationData.timestamp
        )
        
        if (!exists) {
          history.unshift(locationData)
          // Manter apenas as últimas 100 localizações por dispositivo
          const deviceHistory = history.filter((entry: any) => entry.deviceId === device.deviceId)
          const otherDevices = history.filter((entry: any) => entry.deviceId !== device.deviceId)
          const limitedDeviceHistory = deviceHistory.slice(0, 100)
          
          localStorage.setItem('mdm_location_history', JSON.stringify([...otherDevices, ...limitedDeviceHistory]))
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
      
      // Filtrar histórico para este dispositivo
      const deviceHistory = savedHistory
        .filter(entry => entry.deviceId === device.deviceId)
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
      
      // Se o dispositivo tem localização atual, adicionar no topo
      if (device.latitude && device.longitude) {
        const currentLocation = {
          id: 'current',
          latitude: device.latitude,
          longitude: device.longitude,
          accuracy: device.locationAccuracy || 0,
          timestamp: device.lastLocationUpdate || Date.now(),
          provider: device.locationProvider || 'unknown',
          address: device.address
        }
        
        // Verificar se já existe uma entrada atual
        const hasCurrent = deviceHistory.some(entry => entry.id === 'current')
        if (!hasCurrent) {
          deviceHistory.unshift(currentLocation)
        }
      }
      
      // Se não há histórico salvo, usar dados mock para demonstração
      if (deviceHistory.length === 0) {
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
  }

  const handleCloseHistoryModal = () => {
    setShowHistoryModal(false)
  }

  return (
    <div className="space-y-4">
      {/* Informações atuais de localização */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-6 flex items-center">
          📍 Localização Atual
        </h3>
        
        {device.latitude && device.longitude ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-base text-gray-600 font-medium">Coordenadas:</span>
              <span className="font-mono text-base text-gray-800">
                {device.latitude.toFixed(6)}, {device.longitude.toFixed(6)}
              </span>
            </div>
            
            {device.locationAccuracy && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-600 font-medium">Precisão:</span>
                <span className={`text-base font-semibold ${getAccuracyColor(device.locationAccuracy)}`}>
                  {device.locationAccuracy.toFixed(0)}m - {formatAccuracy(device.locationAccuracy)}
                </span>
              </div>
            )}
            
            {device.locationProvider && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-600 font-medium">Provedor:</span>
                <span className="text-base flex items-center font-medium">
                  {getProviderIcon(device.locationProvider)} {device.locationProvider.toUpperCase()}
                </span>
              </div>
            )}
            
            {device.lastLocationUpdate && (
              <div className="flex items-center justify-between">
                <span className="text-base text-gray-600 font-medium">Última atualização:</span>
                <span className="text-base text-gray-800">
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
            <div className="text-gray-400 text-6xl mb-6">📍</div>
            <p className="text-gray-500 text-lg mb-3">Localização não disponível</p>
            <p className="text-base text-gray-400">
              {device.isLocationEnabled ? 'Aguardando dados de GPS...' : 'GPS desabilitado'}
            </p>
          </div>
        )}
      </div>

      {/* Mapa em tempo real */}
      {device.latitude && device.longitude && (
        <DeviceLocationMap 
          device={device}
          className="mb-6"
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
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Detalhes da Localização</h3>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600">Coordenadas</label>
                <p className="font-mono text-sm">
                  {selectedLocation.latitude}, {selectedLocation.longitude}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Precisão</label>
                <p className={`text-sm ${getAccuracyColor(selectedLocation.accuracy)}`}>
                  {selectedLocation.accuracy.toFixed(0)}m - {formatAccuracy(selectedLocation.accuracy)}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Provedor</label>
                <p className="text-sm flex items-center">
                  {getProviderIcon(selectedLocation.provider)} {selectedLocation.provider.toUpperCase()}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Data/Hora</label>
                <p className="text-sm">{formatTimestamp(selectedLocation.timestamp)}</p>
              </div>
              
              {selectedLocation.address && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Endereço</label>
                  <p className="text-sm">{selectedLocation.address}</p>
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
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
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
                    <p className="text-gray-500 mt-2">Carregando histórico...</p>
                  </div>
                </div>
              ) : showHistoryMap ? (
                <div className="h-full">
                  <DeviceLocationMap 
                    device={device}
                    className="h-full rounded-none"
                  />
                </div>
              ) : locationHistory.length > 0 ? (
                <div className="p-6 overflow-y-auto h-full">
                  <div className="space-y-3">
                    {locationHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className={`card p-4 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                          entry.id === 'current' 
                            ? 'ring-2 ring-primary bg-blue-50' 
                            : 'hover:bg-gray-50'
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
      )}
    </div>
  )
}
