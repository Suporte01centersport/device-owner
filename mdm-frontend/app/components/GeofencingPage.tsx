'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Device } from '../types/device'

interface GeofencingPageProps {
  devices: Device[]
  sendMessage?: (message: any) => void
}

interface Geofence {
  id: string
  name: string
  latitude: number
  longitude: number
  radius: number
  alertType: 'entry' | 'exit' | 'both'
  color: string
  createdAt: number
}

const STORAGE_KEY = 'mdm_geofences'

const GEOFENCE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function loadGeofences(): Geofence[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveGeofences(geofences: Geofence[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(geofences))
}

export default function GeofencingPage({ devices, sendMessage }: GeofencingPageProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const circlesRef = useRef<Map<string, any>>(new Map())
  const tempMarkerRef = useRef<any>(null)
  const tempCircleRef = useRef<any>(null)

  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [geofences, setGeofences] = useState<Geofence[]>([])

  // Form state
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [formName, setFormName] = useState('')
  const [formRadius, setFormRadius] = useState(500)
  const [formAlertType, setFormAlertType] = useState<'entry' | 'exit' | 'both'>('both')
  const [formColor, setFormColor] = useState(GEOFENCE_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Load geofences from localStorage
  useEffect(() => {
    setGeofences(loadGeofences())
  }, [])

  // Load Leaflet
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

  // Initialize map
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
      const map = window.L.map(container, { fadeAnimation: false }).setView([defaultLat, defaultLng], 12)

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng
        setSelectedPoint({ lat, lng })
        setShowForm(true)

        // Temp marker
        if (tempMarkerRef.current) {
          tempMarkerRef.current.setLatLng([lat, lng])
        } else {
          tempMarkerRef.current = window.L.marker([lat, lng], {
            icon: window.L.divIcon({
              className: 'geofence-temp-marker',
              html: '<div style="width:14px;height:14px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            }),
          }).addTo(map)
        }
      })

      mapInstanceRef.current = map
      setTimeout(() => map.invalidateSize(), 100)
    } catch (error) {
      console.error('Erro ao criar mapa:', error)
      setMapError('Erro ao criar o mapa')
    }
  }, [isMapLoaded])

  // Update temp circle preview when radius or selected point changes
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !selectedPoint) return

    if (tempCircleRef.current) {
      tempCircleRef.current.remove()
    }

    tempCircleRef.current = window.L.circle([selectedPoint.lat, selectedPoint.lng], {
      color: formColor,
      fillColor: formColor,
      fillOpacity: 0.15,
      radius: formRadius,
      dashArray: '8, 6',
    }).addTo(mapInstanceRef.current)
  }, [selectedPoint, formRadius, formColor])

  // Draw geofence circles on map
  const drawGeofences = useCallback(() => {
    if (!mapInstanceRef.current || !window.L) return

    // Remove old circles
    circlesRef.current.forEach((circle) => circle.remove())
    circlesRef.current.clear()

    geofences.forEach((gf) => {
      const circle = window.L.circle([gf.latitude, gf.longitude], {
        color: gf.color,
        fillColor: gf.color,
        fillOpacity: 0.15,
        radius: gf.radius,
        weight: 2,
      }).addTo(mapInstanceRef.current)

      const devicesInside = getDevicesInGeofence(gf)
      circle.bindPopup(`
        <div style="min-width:160px">
          <strong>${gf.name}</strong><br/>
          <span style="font-size:12px;color:#888">Raio: ${gf.radius}m | Alerta: ${gf.alertType === 'entry' ? 'Entrada' : gf.alertType === 'exit' ? 'Saída' : 'Ambos'}</span><br/>
          <span style="font-size:12px;color:#888">Dispositivos dentro: ${devicesInside.length}</span>
        </div>
      `)

      circlesRef.current.set(gf.id, circle)
    })
  }, [geofences, devices])

  useEffect(() => {
    drawGeofences()
  }, [drawGeofences])

  // Draw device markers
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return

    // We use a layerGroup to manage device markers
    const markersGroup = window.L.layerGroup().addTo(mapInstanceRef.current)

    devices.forEach((device) => {
      if (!device.latitude || !device.longitude) return

      const color = device.status === 'online' ? '#10b981' : '#ef4444'
      const marker = window.L.marker([device.latitude, device.longitude], {
        icon: window.L.divIcon({
          className: 'device-marker-geofence',
          html: `<div style="width:10px;height:10px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        }),
      }).addTo(markersGroup)

      marker.bindPopup(`<strong>${device.name || device.model}</strong><br/><span style="font-size:12px">${device.status}</span>`)
    })

    return () => {
      markersGroup.clearLayers()
      mapInstanceRef.current?.removeLayer(markersGroup)
    }
  }, [devices, isMapLoaded])

  function getDevicesInGeofence(gf: Geofence): Device[] {
    return devices.filter((d) => {
      if (!d.latitude || !d.longitude) return false
      return getDistance(gf.latitude, gf.longitude, d.latitude, d.longitude) <= gf.radius
    })
  }

  function handleSaveGeofence() {
    if (!selectedPoint || !formName.trim()) return

    let updated: Geofence[]

    if (editingId) {
      updated = geofences.map((gf) =>
        gf.id === editingId
          ? {
              ...gf,
              name: formName.trim(),
              latitude: selectedPoint.lat,
              longitude: selectedPoint.lng,
              radius: formRadius,
              alertType: formAlertType,
              color: formColor,
            }
          : gf
      )
    } else {
      const newGeofence: Geofence = {
        id: generateId(),
        name: formName.trim(),
        latitude: selectedPoint.lat,
        longitude: selectedPoint.lng,
        radius: formRadius,
        alertType: formAlertType,
        color: formColor,
        createdAt: Date.now(),
      }
      updated = [...geofences, newGeofence]
    }

    setGeofences(updated)
    saveGeofences(updated)
    resetForm()
  }

  function handleEditGeofence(gf: Geofence) {
    setEditingId(gf.id)
    setFormName(gf.name)
    setFormRadius(gf.radius)
    setFormAlertType(gf.alertType)
    setFormColor(gf.color)
    setSelectedPoint({ lat: gf.latitude, lng: gf.longitude })
    setShowForm(true)

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([gf.latitude, gf.longitude], 14)

      if (tempMarkerRef.current) {
        tempMarkerRef.current.setLatLng([gf.latitude, gf.longitude])
      } else if (window.L) {
        tempMarkerRef.current = window.L.marker([gf.latitude, gf.longitude], {
          icon: window.L.divIcon({
            className: 'geofence-temp-marker',
            html: '<div style="width:14px;height:14px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        }).addTo(mapInstanceRef.current)
      }
    }
  }

  function handleDeleteGeofence(id: string) {
    const updated = geofences.filter((gf) => gf.id !== id)
    setGeofences(updated)
    saveGeofences(updated)
  }

  function resetForm() {
    setFormName('')
    setFormRadius(500)
    setFormAlertType('both')
    setFormColor(GEOFENCE_COLORS[Math.floor(Math.random() * GEOFENCE_COLORS.length)])
    setSelectedPoint(null)
    setEditingId(null)
    setShowForm(false)

    if (tempMarkerRef.current) {
      tempMarkerRef.current.remove()
      tempMarkerRef.current = null
    }
    if (tempCircleRef.current) {
      tempCircleRef.current.remove()
      tempCircleRef.current = null
    }
  }

  function handleSendToDevices() {
    if (!sendMessage) return
    sendMessage({
      type: 'SET_GEOFENCES',
      geofences: geofences.map((gf) => ({
        id: gf.id,
        name: gf.name,
        latitude: gf.latitude,
        longitude: gf.longitude,
        radius: gf.radius,
        alertType: gf.alertType,
      })),
    })
  }

  const alertTypeLabel = (t: string) => {
    switch (t) {
      case 'entry': return 'Entrada'
      case 'exit': return 'Saída'
      case 'both': return 'Ambos'
      default: return t
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Geofences</h2>
          <div className="flex gap-2">
            {sendMessage && geofences.length > 0 && (
              <button
                onClick={handleSendToDevices}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Enviar para Dispositivos
              </button>
            )}
          </div>
        </div>

        {/* Instructions */}
        {geofences.length === 0 && !showForm && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            Clique no mapa para definir o ponto central de uma nova geofence.
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--foreground)]">
                {editingId ? 'Editar Geofence' : 'Nova Geofence'}
              </span>
              <button onClick={resetForm} className="text-[var(--muted)] hover:text-[var(--foreground)] text-lg leading-none">
                &times;
              </button>
            </div>

            {selectedPoint && (
              <div className="text-xs text-[var(--muted)]">
                Lat: {selectedPoint.lat.toFixed(6)}, Lng: {selectedPoint.lng.toFixed(6)}
              </div>
            )}

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nome</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Escritório Central"
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Raio (metros)</label>
              <input
                type="number"
                value={formRadius}
                onChange={(e) => setFormRadius(Math.max(50, Number(e.target.value)))}
                min={50}
                step={50}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="range"
                value={formRadius}
                onChange={(e) => setFormRadius(Number(e.target.value))}
                min={50}
                max={10000}
                step={50}
                className="w-full mt-1 accent-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tipo de Alerta</label>
              <div className="flex gap-2">
                {(['entry', 'exit', 'both'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFormAlertType(t)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                      formAlertType === t
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {alertTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Cor</label>
              <div className="flex gap-1.5 flex-wrap">
                {GEOFENCE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      formColor === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveGeofence}
                disabled={!selectedPoint || !formName.trim()}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                {editingId ? 'Salvar' : 'Criar Geofence'}
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Geofence list */}
        <div className="space-y-2">
          {geofences.map((gf) => {
            const devicesInside = getDevicesInGeofence(gf)
            return (
              <div
                key={gf.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: gf.color }} />
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{gf.name}</span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEditGeofence(gf)}
                      className="p-1 text-[var(--muted)] hover:text-blue-400 transition-colors"
                      title="Editar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteGeofence(gf.id)}
                      className="p-1 text-[var(--muted)] hover:text-red-400 transition-colors"
                      title="Excluir"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                  <span>Raio: {gf.radius}m</span>
                  <span>Alerta: {alertTypeLabel(gf.alertType)}</span>
                </div>

                {devicesInside.length > 0 && (
                  <div className="pt-1 border-t border-[var(--border)]">
                    <span className="text-xs text-[var(--muted)]">Dispositivos dentro ({devicesInside.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {devicesInside.map((d) => (
                        <span
                          key={d.id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                            d.status === 'online'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {d.name || d.model}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {devicesInside.length === 0 && (
                  <div className="text-xs text-[var(--muted)] italic">Nenhum dispositivo nesta zona</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative rounded-lg overflow-hidden border border-[var(--border)]">
        {mapError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)] text-red-400 text-sm">
            {mapError}
          </div>
        ) : !isMapLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] text-sm">
            Carregando mapa...
          </div>
        ) : null}
        <div ref={mapRef} className="w-full h-full min-h-[500px]" />
      </div>
    </div>
  )
}
