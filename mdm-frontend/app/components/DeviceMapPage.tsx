'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Device } from '../types/device'

interface DeviceMapPageProps {
  devices: Device[]
}

declare global {
  interface Window {
    L: any
  }
}

export default function DeviceMapPage({ devices }: DeviceMapPageProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [locationHistory, setLocationHistory] = useState<Array<{latitude: number, longitude: number, created_at: string}>>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const polylineRef = useRef<any>(null)
  const historyMarkersRef = useRef<any[]>([])
  const heatLayerRef = useRef<any>(null)
  const stationaryMarkersRef = useRef<any[]>([])

  const onlineCount = useMemo(() => devices.filter(d => d.status === 'online').length, [devices])

  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices
    const q = searchQuery.toLowerCase()
    return devices.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.model || '').toLowerCase().includes(q) ||
      (d.deviceId || '').toLowerCase().includes(q)
    )
  }, [devices, searchQuery])

  // Load Leaflet once
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

        // Carregar plugin Leaflet.heat para mapa de calor
        if (!document.querySelector('script[src*="leaflet-heat"]')) {
          const heatScript = document.createElement('script')
          heatScript.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
          document.head.appendChild(heatScript)
          await new Promise((resolve, reject) => {
            heatScript.onload = resolve
            heatScript.onerror = () => { console.warn('Leaflet.heat não carregou'); resolve(null) }
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

  // Create map once
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

      const map = window.L.map(container, { fadeAnimation: false }).setView([-22.0, -49.5], 7)

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map)

      mapInstanceRef.current = map
      setTimeout(() => map.invalidateSize(), 100)
    } catch (error) {
      console.error('Erro ao criar mapa:', error)
      setMapError('Erro ao criar o mapa')
    }
  }, [isMapLoaded])

  // Update markers when devices change
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return

    const map = mapInstanceRef.current
    const currentMarkers = markersRef.current
    const activeDeviceIds = new Set<string>()

    devices.forEach(device => {
      const lat = device.latitude
      const lng = device.longitude
      if (!lat || !lng) return

      activeDeviceIds.add(device.deviceId)
      const icon = createDeviceIcon(device.status)
      const popupContent = buildPopupContent(device)

      if (currentMarkers.has(device.deviceId)) {
        const marker = currentMarkers.get(device.deviceId)
        marker.setLatLng([lat, lng])
        marker.setIcon(icon)
        marker.unbindPopup()
        marker.bindPopup(popupContent)
      } else {
        const marker = window.L.marker([lat, lng], { icon }).addTo(map)
        marker.bindPopup(popupContent)
        currentMarkers.set(device.deviceId, marker)
      }
    })

    // Remove markers for devices no longer present
    currentMarkers.forEach((marker, deviceId) => {
      if (!activeDeviceIds.has(deviceId)) {
        map.removeLayer(marker)
        currentMarkers.delete(deviceId)
      }
    })
  }, [devices, isMapLoaded])

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markersRef.current.clear()
      }
    }
  }, [])

  const fitAllMarkers = useCallback(() => {
    if (!mapInstanceRef.current || !window.L) return

    const devicesWithLocation = devices.filter(d => d.latitude && d.longitude)
    if (devicesWithLocation.length === 0) return

    const bounds = window.L.latLngBounds(
      devicesWithLocation.map((d: Device) => [d.latitude, d.longitude])
    )
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
  }, [devices])

  const clearHistoryFromMap = useCallback(() => {
    if (polylineRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(polylineRef.current)
      polylineRef.current = null
    }
    historyMarkersRef.current.forEach(m => {
      if (mapInstanceRef.current) mapInstanceRef.current.removeLayer(m)
    })
    historyMarkersRef.current = []
    if (heatLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current)
      heatLayerRef.current = null
    }
    stationaryMarkersRef.current.forEach(m => {
      if (mapInstanceRef.current) mapInstanceRef.current.removeLayer(m)
    })
    stationaryMarkersRef.current = []
  }, [])

  const fetchLocationHistory = useCallback(async (deviceId: string) => {
    setLoadingHistory(true)
    clearHistoryFromMap()
    try {
      const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
      const res = await fetch(`http://${wsHost}:3001/api/devices/${encodeURIComponent(deviceId)}/location-history`)
      const data = await res.json()
      if (data.success && data.locations && data.locations.length > 0) {
        setLocationHistory(data.locations)
        const map = mapInstanceRef.current
        if (map && window.L) {
          // Locations come newest-first, reverse to chronological order
          const locs = [...data.locations].reverse()
          const points = locs.map((loc: any) => [loc.latitude, loc.longitude] as [number, number])

          // --- 1. Trajeto (polyline com setas de direção) ---
          const polyline = window.L.polyline(points, {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.85,
            lineJoin: 'round'
          }).addTo(map)
          polylineRef.current = polyline

          // Setas de direção ao longo do trajeto (a cada N pontos)
          const arrowInterval = Math.max(1, Math.floor(points.length / 15))
          for (let i = arrowInterval; i < points.length; i += arrowInterval) {
            const prev = points[i - 1]
            const curr = points[i]
            const angle = Math.atan2(curr[1] - prev[1], curr[0] - prev[0]) * (180 / Math.PI)
            const arrowIcon = window.L.divIcon({
              html: `<div style="transform:rotate(${90 - angle}deg);color:#3b82f6;font-size:16px;font-weight:bold;text-shadow:0 0 3px rgba(0,0,0,0.5);">▲</div>`,
              className: '',
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })
            const arrowMarker = window.L.marker(curr, { icon: arrowIcon, interactive: false }).addTo(map)
            historyMarkersRef.current.push(arrowMarker)
          }

          // --- 2. Marcadores de passos (pontos do trajeto) ---
          points.forEach((pt: [number, number], i: number) => {
            const isFirst = i === 0
            const isLast = i === points.length - 1
            const locData = locs[i]
            const time = new Date(locData.created_at).toLocaleString('pt-BR')

            if (isFirst || isLast) {
              // Início e fim com ícones especiais
              const icon = window.L.divIcon({
                html: `<div style="
                  width:28px;height:28px;border-radius:50%;
                  background:${isLast ? '#10b981' : '#f59e0b'};
                  border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);
                  display:flex;align-items:center;justify-content:center;
                  color:white;font-size:14px;font-weight:bold;
                ">${isLast ? '📍' : '🏁'}</div>`,
                className: '',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
              })
              const marker = window.L.marker(pt, { icon }).addTo(map)
              marker.bindPopup(`<div style="color:#000"><strong>${isFirst ? 'Início do Trajeto' : 'Posição Atual'}</strong><br/>Passo ${i + 1} de ${points.length}<br/>${time}</div>`)
              historyMarkersRef.current.push(marker)
            } else {
              // Pontos intermediários pequenos
              const circle = window.L.circleMarker(pt, {
                radius: 4,
                color: '#3b82f6',
                fillColor: '#93c5fd',
                fillOpacity: 0.9,
                weight: 2
              }).addTo(map)
              circle.bindPopup(`<div style="color:#000"><strong>Passo ${i + 1}</strong> de ${points.length}<br/>${time}</div>`)
              historyMarkersRef.current.push(circle)
            }
          })

          // --- 3. Detectar pontos estacionários (parado por muito tempo) ---
          // Agrupar pontos próximos (<30m) consecutivos como "parada"
          const STATIONARY_DIST = 0.0003 // ~30m
          const MIN_STATIONARY_POINTS = 3 // mínimo 3 registros no mesmo lugar = parada significativa
          const stationaryZones: { lat: number; lng: number; count: number; startTime: string; endTime: string }[] = []
          let zoneStart = 0
          for (let i = 1; i <= locs.length; i++) {
            const inZone = i < locs.length &&
              Math.abs(locs[i].latitude - locs[zoneStart].latitude) < STATIONARY_DIST &&
              Math.abs(locs[i].longitude - locs[zoneStart].longitude) < STATIONARY_DIST
            if (!inZone) {
              const zoneLength = i - zoneStart
              if (zoneLength >= MIN_STATIONARY_POINTS) {
                const zoneLocs = locs.slice(zoneStart, i)
                const avgLat = zoneLocs.reduce((s: number, l: any) => s + l.latitude, 0) / zoneLocs.length
                const avgLng = zoneLocs.reduce((s: number, l: any) => s + l.longitude, 0) / zoneLocs.length
                stationaryZones.push({
                  lat: avgLat,
                  lng: avgLng,
                  count: zoneLength,
                  startTime: zoneLocs[0].created_at,
                  endTime: zoneLocs[zoneLocs.length - 1].created_at
                })
              }
              zoneStart = i
            }
          }

          // Marcadores roxos para zonas estacionárias
          stationaryZones.forEach(zone => {
            const sizeBase = Math.min(zone.count * 4, 40)
            const icon = window.L.divIcon({
              html: `<div style="
                width:${sizeBase}px;height:${sizeBase}px;border-radius:50%;
                background:rgba(139,92,246,0.35);
                border:3px solid #8b5cf6;
                display:flex;align-items:center;justify-content:center;
                color:white;font-size:${Math.max(14, sizeBase * 0.45)}px;
                box-shadow:0 0 12px rgba(139,92,246,0.6);
              ">⏸</div>`,
              className: '',
              iconSize: [sizeBase, sizeBase],
              iconAnchor: [sizeBase / 2, sizeBase / 2]
            })
            const start = new Date(zone.startTime).toLocaleString('pt-BR')
            const end = new Date(zone.endTime).toLocaleString('pt-BR')
            const startMs = new Date(zone.startTime).getTime()
            const endMs = new Date(zone.endTime).getTime()
            const durationMin = Math.round((endMs - startMs) / 60000)
            const durationText = durationMin >= 60
              ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}min`
              : `${durationMin} min`
            const marker = window.L.marker([zone.lat, zone.lng], { icon }).addTo(map)
            marker.bindPopup(`<div style="color:#000">
              <strong style="color:#7c3aed;">⏸ Parada Detectada</strong><br/>
              <strong>Duração:</strong> ${durationText}<br/>
              <strong>Registros:</strong> ${zone.count} pontos<br/>
              <strong>De:</strong> ${start}<br/>
              <strong>Até:</strong> ${end}
            </div>`)
            stationaryMarkersRef.current.push(marker)
          })

          // --- 4. Mapa de calor - onde o dispositivo mais esteve ---
          if (window.L.heatLayer && points.length > 1) {
            const heatPoints: [number, number, number][] = []
            const gridSize = 0.0003 // ~30m grid (mais preciso)
            const freq: Record<string, { lat: number; lng: number; count: number }> = {}
            points.forEach((pt: [number, number]) => {
              const key = `${Math.round(pt[0] / gridSize) * gridSize}_${Math.round(pt[1] / gridSize) * gridSize}`
              if (!freq[key]) freq[key] = { lat: pt[0], lng: pt[1], count: 0 }
              freq[key].count++
            })
            const maxCount = Math.max(...Object.values(freq).map(f => f.count))
            Object.values(freq).forEach(f => {
              heatPoints.push([f.lat, f.lng, f.count / maxCount])
            })
            const heat = window.L.heatLayer(heatPoints, {
              radius: 25,
              blur: 15,
              maxZoom: 19,
              max: 1.0,
              gradient: { 0.1: '#3b82f6', 0.3: '#06b6d4', 0.5: '#10b981', 0.7: '#f59e0b', 0.85: '#ef4444', 1.0: '#7c3aed' }
            }).addTo(map)
            heatLayerRef.current = heat
          }
        }
      } else {
        setLocationHistory([])
      }
    } catch (e) {
      console.error('Erro ao buscar histórico:', e)
      setLocationHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [clearHistoryFromMap])

  const exportHeatMapReport = useCallback(async (deviceId: string) => {
    if (!mapInstanceRef.current || !mapRef.current) return

    const device = devices.find(d => d.deviceId === deviceId)
    if (!device) return

    // Carregar html2canvas dinamicamente
    let h2c: any = (window as any).html2canvas
    if (!h2c) {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
      document.head.appendChild(script)
      await new Promise((resolve) => { script.onload = resolve; script.onerror = resolve })
      h2c = (window as any).html2canvas
    }

    if (!h2c) {
      alert('Erro ao carregar html2canvas')
      return
    }

    try {
      // Capturar o mapa como imagem
      const canvas = await h2c(mapRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        logging: false
      })
      const mapImage = canvas.toDataURL('image/png')

      // Abrir janela de relatório
      const pw = window.open('', '_blank')
      if (!pw) return

      pw.document.write(`
        <html>
        <head>
          <title>Relatório Mapa de Calor - ${device.name || device.model}</title>
          <style>
            @page { size: landscape; margin: 15mm; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #222; margin: 0; }
            h1 { font-size: 22px; color: #1e293b; margin: 0 0 4px 0; }
            .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
            .map-container { text-align: center; margin: 16px 0; }
            .map-container img { max-width: 100%; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
            .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .info-card h3 { font-size: 13px; color: #64748b; margin: 0 0 4px 0; }
            .info-card p { font-size: 15px; color: #1e293b; margin: 0; font-weight: 600; }
            .legend { display: flex; align-items: center; gap: 8px; margin-top: 12px; justify-content: center; }
            .legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #555; }
            .legend-color { width: 16px; height: 10px; border-radius: 2px; }
            .footer { margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Mapa de Calor — ${device.name || device.model}</h1>
          <div class="meta">
            ${device.model} • ${device.manufacturer || ''} •
            Gerado em: ${new Date().toLocaleString('pt-BR')} •
            ${locationHistory.length} pontos de localização
          </div>

          <div class="map-container">
            <img src="${mapImage}" alt="Mapa de Calor" />
          </div>

          <div class="legend">
            <span style="font-size:12px;font-weight:600;color:#333;">Intensidade:</span>
            <div class="legend-item"><div class="legend-color" style="background:#2196F3;"></div>Baixa</div>
            <div class="legend-item"><div class="legend-color" style="background:#4CAF50;"></div>Média</div>
            <div class="legend-item"><div class="legend-color" style="background:#FFEB3B;"></div>Alta</div>
            <div class="legend-item"><div class="legend-color" style="background:#FF9800;"></div>Muito Alta</div>
            <div class="legend-item"><div class="legend-color" style="background:#F44336;"></div>Máxima</div>
          </div>

          <div class="info-grid">
            <div class="info-card">
              <h3>Dispositivo</h3>
              <p>${device.name || device.model}</p>
            </div>
            <div class="info-card">
              <h3>Status</h3>
              <p style="color:${device.status === 'online' ? '#16a34a' : '#dc2626'};">${device.status === 'online' ? 'Online' : 'Offline'}</p>
            </div>
            <div class="info-card">
              <h3>Última Posição</h3>
              <p>${device.latitude?.toFixed(6)}, ${device.longitude?.toFixed(6)}</p>
            </div>
            <div class="info-card">
              <h3>Pontos Registrados</h3>
              <p>${locationHistory.length} localizações</p>
            </div>
            ${device.assignedUser?.name ? `
            <div class="info-card">
              <h3>Usuário</h3>
              <p>${device.assignedUser.name}</p>
            </div>` : ''}
            <div class="info-card">
              <h3>Bateria</h3>
              <p>${device.batteryLevel !== undefined ? device.batteryLevel + '%' : 'N/A'}</p>
            </div>
          </div>

          <div class="footer">MDM Center — Relatório de Mapa de Calor gerado automaticamente</div>
          <script>setTimeout(() => window.print(), 500);</script>
        </body>
        </html>
      `)
      pw.document.close()
    } catch (e) {
      console.error('Erro ao exportar mapa:', e)
      alert('Erro ao capturar mapa para o relatório')
    }
  }, [devices, locationHistory])

  const panToDevice = useCallback((device: Device) => {
    if (!mapInstanceRef.current || !device.latitude || !device.longitude) return

    mapInstanceRef.current.setView([device.latitude, device.longitude], 18, {
      animate: true,
      duration: 0.5
    })

    const marker = markersRef.current.get(device.deviceId)
    if (marker) {
      marker.openPopup()
    }

    // Fetch and show location history
    setSelectedDeviceId(device.deviceId)
    fetchLocationHistory(device.deviceId)
  }, [fetchLocationHistory])

  if (mapError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface)]">
        <div className="text-center text-[var(--text-secondary)]">
          <div className="text-4xl mb-2">🗺️</div>
          <p className="text-lg font-medium">Erro ao carregar mapa</p>
          <p className="text-sm">{mapError}</p>
        </div>
      </div>
    )
  }

  if (!isMapLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface)]">
        <div className="text-center text-[var(--text-secondary)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-lg font-medium">Carregando mapa...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 flex flex-col" style={{ height: 'calc(100vh - 64px)', maxHeight: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Top: Map + Sidebar */}
      <div className="relative flex flex-1 min-h-0">
        {/* Map */}
        <div ref={mapRef} className="flex-1" style={{ height: '100%' }} />

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-3 left-3 z-[1000] bg-[var(--surface)] text-[var(--text-primary)] px-2.5 py-1.5 rounded-lg shadow-lg hover:bg-[var(--surface-elevated)] transition-colors border border-[var(--border)] text-sm"
          title={sidebarOpen ? 'Fechar painel' : 'Abrir painel'}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-72 bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col overflow-hidden flex-shrink-0">
            {/* Header */}
            <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-elevated)]">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Dispositivos</h2>
                <span className="text-xs text-[var(--text-secondary)]">
                  <span className="text-green-500 font-bold">{onlineCount}</span>
                  {' / '}
                  <span className="font-bold">{devices.length}</span>
                </span>
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Buscar dispositivo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Fit All button */}
              <button
                onClick={() => {
                  fitAllMarkers()
                  setSelectedDeviceId(null)
                  clearHistoryFromMap()
                  setLocationHistory([])
                }}
                className="mt-2 w-full px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Mostrar Todos no Mapa
              </button>

              {/* History info + export */}
              {selectedDeviceId && (
                <div className="mt-2 space-y-1.5">
                  <div className="px-2 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded text-[11px] text-[var(--text-secondary)]">
                    {loadingHistory ? (
                      <span>Carregando trajeto...</span>
                    ) : locationHistory.length > 0 ? (
                      <span>📍 {locationHistory.length} pontos {heatLayerRef.current ? '| 🔥 Calor ativo' : ''}</span>
                    ) : (
                      <span>Sem histórico de localização</span>
                    )}
                  </div>
                  {locationHistory.length > 0 && (
                    <button
                      onClick={() => exportHeatMapReport(selectedDeviceId)}
                      className="w-full px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                    >
                      📄 Exportar PDF
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Device list */}
            <div className="flex-1 overflow-y-auto">
              {filteredDevices.length === 0 ? (
                <div className="p-3 text-center text-[var(--text-secondary)] text-xs">
                  Nenhum dispositivo encontrado.
                </div>
              ) : (
                filteredDevices.map(device => (
                  <button
                    key={device.deviceId}
                    onClick={() => panToDevice(device)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-colors ${
                      selectedDeviceId === device.deviceId ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          device.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {device.name || device.model}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate">
                          {device.model}
                          {device.batteryLevel !== undefined && ` • ${device.batteryLevel}%`}
                        </p>
                      </div>
                      {(!device.latitude || !device.longitude) && (
                        <span className="text-[10px] text-[var(--text-secondary)] flex-shrink-0" title="Sem localização">
                          📍?
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Legend bar */}
      <div className="flex-shrink-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center gap-5 text-sm text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)] text-sm">Legenda:</span>
            <span><span style={{color:'#f59e0b'}}>🏁</span> Início</span>
            <span><span style={{color:'#10b981'}}>📍</span> Atual</span>
            <span><span style={{color:'#3b82f6'}}>●</span> Passo</span>
            <span><span style={{color:'#3b82f6'}}>▲</span> Direção</span>
            <span><span style={{color:'#8b5cf6'}}>⏸</span> <span className="text-purple-400 font-medium">Parada</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">Calor:</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-5 h-3 rounded-sm inline-block" style={{background:'#3b82f6'}} />
              <span>pouco</span>
            </span>
            <span>→</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-5 h-3 rounded-sm inline-block" style={{background:'#10b981'}} />
            </span>
            <span>→</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-5 h-3 rounded-sm inline-block" style={{background:'#f59e0b'}} />
            </span>
            <span>→</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-5 h-3 rounded-sm inline-block" style={{background:'#ef4444'}} />
            </span>
            <span>→</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-5 h-3 rounded-sm inline-block" style={{background:'#7c3aed'}} />
              <span>muito</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function createDeviceIcon(status: string) {
  const color = status === 'online' ? '#10b981' : '#ef4444'
  return window.L.divIcon({
    className: 'custom-device-marker',
    html: `
      <div style="
        background: ${color};
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: white;
        font-weight: bold;
      ">
        📱
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

function buildPopupContent(device: Device): string {
  const statusColor = device.status === 'online' ? '#10b981' : '#ef4444'
  const statusText = device.status === 'online' ? 'Online' : 'Offline'

  return `
    <div style="min-width: 220px; padding: 4px; background: #fff !important; color: #000 !important;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #000 !important;">
        ${device.name || device.model}
      </h3>
      <div style="font-size: 13px; color: #000 !important; line-height: 1.6;">
        <div style="color: #000 !important;">
          <strong>Status:</strong> <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span>
        </div>
        <div style="color: #000 !important;">
          <strong>Bateria:</strong> ${device.batteryLevel !== undefined ? device.batteryLevel + '%' : 'N/A'}
        </div>
        <div style="color: #000 !important;">
          <strong>Coordenadas:</strong> ${(device.latitude || 0).toFixed(6)}, ${(device.longitude || 0).toFixed(6)}
        </div>
        ${device.locationAccuracy ? `<div style="color: #000 !important;"><strong>Precisão:</strong> ${device.locationAccuracy.toFixed(0)}m</div>` : ''}
        ${device.locationProvider ? `<div style="color: #000 !important;"><strong>Provedor:</strong> ${device.locationProvider}</div>` : ''}
        ${device.lastLocationUpdate ? `<div style="color: #000 !important;"><strong>Última atualização:</strong> ${new Date(device.lastLocationUpdate).toLocaleString('pt-BR')}</div>` : ''}
      </div>
    </div>
  `
}
