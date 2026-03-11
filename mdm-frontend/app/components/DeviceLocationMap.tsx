'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Device } from '../types/device'

interface DeviceLocationMapProps {
  device: Device
  className?: string
  sendMessage?: (message: any) => void
}

export default function DeviceLocationMap({ device, className = '', sendMessage }: DeviceLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const accuracyCircleRef = useRef<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [isSirenActive, setSirenActive] = useState(false)
  const [sirenLoading, setSirenLoading] = useState(false)

  // Ref para dados do device (evita recriar o mapa na inicialização)
  const deviceRef = useRef(device)
  deviceRef.current = device

  // Carregar Leaflet uma vez
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

  // Criar mapa apenas uma vez quando Leaflet carrega
  useEffect(() => {
    if (!isMapLoaded || !window.L || !mapRef.current) return
    if (mapInstanceRef.current) return

    try {
      const container = mapRef.current
      if (!container.offsetWidth || !container.offsetHeight) {
        requestAnimationFrame(() => {
          if (container.offsetWidth && container.offsetHeight) {
            setIsMapLoaded(false)
            setTimeout(() => setIsMapLoaded(true), 50)
          }
        })
        return
      }

      const defaultLat = -23.5505
      const defaultLng = -46.6333
      const lat = deviceRef.current.latitude || defaultLat
      const lng = deviceRef.current.longitude || defaultLng

      const map = window.L.map(container, { fadeAnimation: false }).setView([lat, lng], 15)

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map)

      const deviceIcon = createDeviceIcon(deviceRef.current.status)
      const marker = window.L.marker([lat, lng], { icon: deviceIcon }).addTo(map)
      updatePopup(marker, deviceRef.current)

      if (deviceRef.current.locationAccuracy && deviceRef.current.locationAccuracy > 0) {
        const color = deviceRef.current.status === 'online' ? '#10b981' : '#ef4444'
        accuracyCircleRef.current = window.L.circle([lat, lng], {
          color, fillColor: color, fillOpacity: 0.2,
          radius: deviceRef.current.locationAccuracy
        }).addTo(map)
      }

      mapInstanceRef.current = map
      markerRef.current = marker

      setTimeout(() => map.invalidateSize(), 100)
    } catch (error) {
      console.error('Erro ao criar mapa:', error)
      setMapError('Erro ao criar o mapa')
    }
  }, [isMapLoaded])

  // Atualizar marcador quando posição/status muda (SEM recriar o mapa)
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !window.L) return

    const lat = device.latitude
    const lng = device.longitude
    if (!lat || !lng) return

    const map = mapInstanceRef.current
    const marker = markerRef.current

    // Atualizar posição do marcador suavemente
    marker.setLatLng([lat, lng])
    marker.setIcon(createDeviceIcon(device.status))
    updatePopup(marker, device)

    // Atualizar círculo de precisão
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng([lat, lng])
      if (device.locationAccuracy && device.locationAccuracy > 0) {
        accuracyCircleRef.current.setRadius(device.locationAccuracy)
        const color = device.status === 'online' ? '#10b981' : '#ef4444'
        accuracyCircleRef.current.setStyle({ color, fillColor: color })
      }
    } else if (device.locationAccuracy && device.locationAccuracy > 0) {
      const color = device.status === 'online' ? '#10b981' : '#ef4444'
      accuracyCircleRef.current = window.L.circle([lat, lng], {
        color, fillColor: color, fillOpacity: 0.2,
        radius: device.locationAccuracy
      }).addTo(map)
    }

    // Centralizar mapa suavemente
    map.panTo([lat, lng], { animate: true, duration: 0.5 })
  }, [device.latitude, device.longitude, device.status, device.locationAccuracy])

  // Limpar mapa ao desmontar
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markerRef.current = null
        accuracyCircleRef.current = null
      }
    }
  }, [])

  // Toggle sirene via API HTTP
  const handleToggleSiren = useCallback(async () => {
    if (sirenLoading) return

    setSirenLoading(true)
    try {
      const action = isSirenActive ? 'stop-alarm' : 'start-alarm'
      const response = await fetch(`/api/devices/${device.deviceId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      if (data.success) {
        setSirenActive(!isSirenActive)
      } else {
        alert(data.error || 'Erro ao alternar sirene')
      }
    } catch (error) {
      console.error('Erro ao alternar sirene:', error)
      alert('Erro ao conectar com o servidor')
    } finally {
      setSirenLoading(false)
    }
  }, [isSirenActive, sirenLoading, device.deviceId])

  if (mapError) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`} style={{ minHeight: '300px' }}>
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">🗺️</div>
          <p className="text-lg font-medium">Erro ao carregar mapa</p>
          <p className="text-sm">{mapError}</p>
        </div>
      </div>
    )
  }

  if (!isMapLoaded) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`} style={{ minHeight: '300px' }}>
        <div className="text-center text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-lg font-medium">Carregando mapa...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg overflow-hidden shadow-lg ${className}`}>
      <div className="bg-white p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 flex items-center">
            <span className="mr-2">🗺️</span>
            Localização em Tempo Real
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {device.status === 'online' ? 'Atualizando automaticamente' : 'Última localização conhecida'}
          </p>
        </div>
        <button
          onClick={handleToggleSiren}
          disabled={sirenLoading || device.status !== 'online'}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
            ${isSirenActive
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30'
              : device.status !== 'online'
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-orange-500 hover:bg-orange-600 text-white shadow-md hover:shadow-lg'
            }
            ${sirenLoading ? 'opacity-70 cursor-wait' : ''}
          `}
          title={device.status !== 'online' ? 'Dispositivo offline' : isSirenActive ? 'Parar sirene' : 'Tocar sirene para encontrar o dispositivo'}
        >
          {sirenLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {isSirenActive ? 'Parando...' : 'Ativando...'}
            </>
          ) : isSirenActive ? (
            <>
              <span className="text-lg">🔕</span>
              Parar Sirene
            </>
          ) : (
            <>
              <span className="text-lg">🔔</span>
              Tocar Sirene
            </>
          )}
        </button>
      </div>
      <div
        ref={mapRef}
        className="w-full"
        style={{ height: '400px' }}
      />
    </div>
  )
}

function createDeviceIcon(status: string) {
  return window.L.divIcon({
    className: 'custom-device-marker',
    html: `
      <div style="
        background: ${status === 'online' ? '#10b981' : '#ef4444'};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: white;
        font-weight: bold;
      ">
        📱
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  })
}

function updatePopup(marker: any, dev: Device) {
  const popupContent = `
    <div style="min-width: 200px; padding: 4px; background: #fff !important; color: #000 !important;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #000 !important;">
        ${dev.name || dev.model}
      </h3>
      <div style="font-size: 14px; color: #000 !important;">
        <div style="color: #000 !important;"><strong>Status:</strong> <span style="color: ${dev.status === 'online' ? '#10b981' : '#ef4444'}">${dev.status === 'online' ? 'Online' : 'Offline'}</span></div>
        <div style="color: #000 !important;"><strong>Coordenadas:</strong> ${(dev.latitude || 0).toFixed(6)}, ${(dev.longitude || 0).toFixed(6)}</div>
        ${dev.locationAccuracy ? `<div style="color: #000 !important;"><strong>Precisão:</strong> ${dev.locationAccuracy.toFixed(0)}m</div>` : ''}
        ${dev.locationProvider ? `<div style="color: #000 !important;"><strong>Provedor:</strong> ${dev.locationProvider}</div>` : ''}
        ${dev.lastLocationUpdate ? `<div style="color: #000 !important;"><strong>Última atualização:</strong> ${new Date(dev.lastLocationUpdate).toLocaleString('pt-BR')}</div>` : ''}
      </div>
    </div>
  `
  marker.unbindPopup()
  const popup = marker.bindPopup(popupContent)
  popup.on('add', () => {
    const el = document.querySelector('.leaflet-popup-content-wrapper')
    if (el && el instanceof HTMLElement) {
      el.style.background = '#fff'
      el.style.color = '#000'
    }
    const pane = document.querySelector('.leaflet-popup-content')
    if (pane && pane instanceof HTMLElement) {
      pane.style.color = '#000'
    }
  })
}

// Declaração global para TypeScript
declare global {
  interface Window {
    L: any
  }
}
