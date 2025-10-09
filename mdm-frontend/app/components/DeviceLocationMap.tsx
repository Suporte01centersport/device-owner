'use client'

import { useEffect, useRef, useState } from 'react'
import { Device } from '../types/device'

interface DeviceLocationMapProps {
  device: Device
  className?: string
}

export default function DeviceLocationMap({ device, className = '' }: DeviceLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    const loadLeaflet = async () => {
      try {
        // Carregar Leaflet CSS e JS dinamicamente
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
    if (!isMapLoaded || !window.L || !mapRef.current) return

    try {
      // Limpar mapa anterior se existir
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
      }

      // Coordenadas padrão (São Paulo) se não houver localização do dispositivo
      const defaultLat = -23.5505
      const defaultLng = -46.6333
      
      const lat = device.latitude || defaultLat
      const lng = device.longitude || defaultLng

      // Criar mapa
      const map = window.L.map(mapRef.current).setView([lat, lng], 13)

      // Adicionar camada OpenStreetMap
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map)

      // Adicionar marcador do dispositivo
      const deviceIcon = window.L.divIcon({
        className: 'custom-device-marker',
        html: `
          <div style="
            background: ${device.status === 'online' ? '#10b981' : '#ef4444'};
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

      const marker = window.L.marker([lat, lng], { icon: deviceIcon }).addTo(map)

      // Adicionar popup com informações do dispositivo
      const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">
            ${device.name || device.model}
          </h3>
          <div style="font-size: 14px; color: #666;">
            <div><strong>Status:</strong> <span style="color: ${device.status === 'online' ? '#10b981' : '#ef4444'}">${device.status === 'online' ? 'Online' : 'Offline'}</span></div>
            <div><strong>Coordenadas:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
            ${device.locationAccuracy ? `<div><strong>Precisão:</strong> ${device.locationAccuracy.toFixed(0)}m</div>` : ''}
            ${device.locationProvider ? `<div><strong>Provedor:</strong> ${device.locationProvider}</div>` : ''}
            ${device.lastLocationUpdate ? `<div><strong>Última atualização:</strong> ${new Date(device.lastLocationUpdate).toLocaleString('pt-BR')}</div>` : ''}
          </div>
        </div>
      `
      marker.bindPopup(popupContent)

      // Adicionar círculo de precisão se disponível
      if (device.locationAccuracy && device.locationAccuracy > 0) {
        const accuracyCircle = window.L.circle([lat, lng], {
          color: device.status === 'online' ? '#10b981' : '#ef4444',
          fillColor: device.status === 'online' ? '#10b981' : '#ef4444',
          fillOpacity: 0.2,
          radius: device.locationAccuracy
        }).addTo(map)
      }

      mapInstanceRef.current = map
      markerRef.current = marker

    } catch (error) {
      console.error('Erro ao criar mapa:', error)
      setMapError('Erro ao criar o mapa')
    }
  }, [isMapLoaded, device])

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
      <div className="bg-white p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          <span className="mr-2">🗺️</span>
          Localização em Tempo Real
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {device.status === 'online' ? 'Atualizando automaticamente' : 'Última localização conhecida'}
        </p>
      </div>
      <div 
        ref={mapRef} 
        className="w-full" 
        style={{ height: '400px' }}
      />
    </div>
  )
}

// Declaração global para TypeScript
declare global {
  interface Window {
    L: any
  }
}
