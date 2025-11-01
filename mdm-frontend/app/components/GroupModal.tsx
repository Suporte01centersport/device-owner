'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Device, DeviceGroup } from '../types/device'

// Componente de mapa com Leaflet para área permitida
interface LocationMapProps {
  latitude: number | null
  longitude: number | null
  radiusKm: number | null
}

function LocationMap({ latitude, longitude, radiusKm }: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const isMountedRef = useRef(true)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Garantir que isMountedRef está true quando o componente monta
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const loadLeaflet = async () => {
      try {
        console.log('🗺️ Carregando Leaflet...')
        
        // Carregar Leaflet CSS
        const existingCss = document.querySelector('link[href*="leaflet.css"]')
        if (!existingCss) {
          const cssLink = document.createElement('link')
          cssLink.rel = 'stylesheet'
          cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
          cssLink.crossOrigin = ''
          document.head.appendChild(cssLink)
          
          // Aguardar CSS carregar
          await new Promise((resolve) => {
            if (cssLink.onload) {
              cssLink.onload = () => {
                console.log('✅ CSS do Leaflet carregado')
                resolve(true)
              }
            }
            // Timeout de segurança - CSS pode não disparar onload
            setTimeout(() => {
              console.log('✅ CSS do Leaflet (timeout)')
              resolve(true)
            }, 200)
          })
        } else {
          console.log('✅ CSS do Leaflet já existe')
          await new Promise((resolve) => setTimeout(resolve, 50))
        }

        // Carregar Leaflet JS
        if (!window.L) {
          console.log('📦 Carregando script do Leaflet...')
          const script = document.createElement('script')
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
          script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
          script.crossOrigin = ''
          document.head.appendChild(script)
          
          await new Promise((resolve, reject) => {
            script.onload = () => {
              console.log('✅ Script do Leaflet carregado')
              // Aguardar um pouco mais para garantir que L esteja totalmente disponível
              setTimeout(() => {
                if (window.L) {
                  console.log('✅ Leaflet.L disponível')
                  resolve(true)
                } else {
                  reject(new Error('Leaflet não foi carregado'))
                }
              }, 50)
            }
            script.onerror = (err) => {
              console.error('❌ Erro ao carregar script do Leaflet:', err)
              reject(err)
            }
            setTimeout(() => reject(new Error('Timeout ao carregar Leaflet')), 10000)
          })
        } else {
          console.log('✅ Leaflet já estava carregado')
        }

        setIsMapLoaded(true)
        console.log('✅ Leaflet pronto!')
      } catch (error) {
        console.error('❌ Erro ao carregar Leaflet:', error)
        setMapError('Erro ao carregar o mapa')
      }
    }

    loadLeaflet()
  }, [])

  useEffect(() => {
    console.log('🔍 useEffect do mapa executado:', {
      isMapLoaded,
      hasWindowL: !!window.L,
      hasMapRef: !!mapRef.current,
      latitude,
      longitude,
      radiusKm,
      isMounted: isMountedRef.current
    })

    if (!isMapLoaded || !window.L) {
      console.log('⚠️ Leaflet não está carregado ainda')
      return
    }

    if (!mapRef.current) {
      console.log('⚠️ mapRef.current não está disponível ainda')
      return
    }

    if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
      console.log('⚠️ Coordenadas inválidas:', { latitude, longitude })
      return
    }

    // Não verificar isMounted aqui - o componente está montado se chegou até aqui
    // O ref pode não estar sincronizado corretamente durante re-renders
    
    console.log('✅ Todas as condições básicas atendidas, verificando visibilidade do container...')
    
    // Função para criar o mapa
    const createMap = () => {
      if (!isMountedRef.current || !mapRef.current || !window.L) return
      
      // Verificar visibilidade do container
      const rect = mapRef.current.getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0
      
      console.log('👁️ Container visibilidade:', { 
        width: rect.width, 
        height: rect.height, 
        isVisible,
        top: rect.top,
        left: rect.left
      })

      if (!isVisible) {
        console.log('⚠️ Container não está visível ainda')
        return false
      }

      console.log('✅ Container está visível, criando mapa...')
      return true
    }

    // Tentar criar o mapa imediatamente ou aguardar até que o container esteja visível
    let retryCount = 0
    const maxRetries = 10
    
    const tryCreateMap = () => {
      if (!createMap()) {
        retryCount++
        if (retryCount < maxRetries) {
          console.log(`🔄 Tentativa ${retryCount}/${maxRetries}, aguardando container ficar visível...`)
          setTimeout(tryCreateMap, 200)
          return
        } else {
          console.error('❌ Container não ficou visível após várias tentativas')
          return
        }
      }
      
      // Container está visível - o código abaixo vai criar o mapa
    }

    // Iniciar tentativa de criação (que vai verificar visibilidade antes do timeout)
    tryCreateMap()

    let timeoutId: NodeJS.Timeout | null = null

    const cleanup = () => {
      // Parar todas as transições e limpar camadas antes de remover
      if (mapInstanceRef.current) {
        try {
          // Parar qualquer animação/transição
          if (mapInstanceRef.current.stop) {
            mapInstanceRef.current.stop()
          }
          
          // Remover camadas se existirem
          if (circleRef.current && mapInstanceRef.current.hasLayer(circleRef.current)) {
            mapInstanceRef.current.removeLayer(circleRef.current)
          }
          if (markerRef.current && mapInstanceRef.current.hasLayer(markerRef.current)) {
            mapInstanceRef.current.removeLayer(markerRef.current)
          }
          if (tileLayerRef.current && mapInstanceRef.current.hasLayer(tileLayerRef.current)) {
            mapInstanceRef.current.removeLayer(tileLayerRef.current)
          }
          
          // Remover o mapa
          mapInstanceRef.current.remove()
        } catch (e) {
          // Ignorar erros de limpeza
        }
      }

      // Limpar referências
      circleRef.current = null
      markerRef.current = null
      tileLayerRef.current = null
      mapInstanceRef.current = null

      // Limpar o conteúdo do container
      if (mapRef.current) {
        mapRef.current.innerHTML = ''
      }
    }

    // Verificar se já existe um mapa válido antes de criar um novo
    if (mapInstanceRef.current && mapRef.current) {
      try {
        // Verificar se o mapa ainda está válido (tem o mesmo container e coordenadas)
        const existingMap = mapInstanceRef.current
        if (existingMap.getContainer() === mapRef.current && 
            Math.abs(existingMap.getCenter().lat - latitude) < 0.0001 &&
            Math.abs(existingMap.getCenter().lng - longitude) < 0.0001) {
          console.log('✅ Mapa já existe e está válido, não precisa recriar')
          return
        }
      } catch (e) {
        // Mapa inválido, precisa limpar
        console.log('⚠️ Mapa existente inválido, limpando...')
        cleanup()
      }
    }

    // Limpar mapa anterior apenas se já existe um mapa
    if (mapInstanceRef.current) {
      cleanup()
    }

    // Aguardar para garantir que a limpeza terminou completamente e que o container está visível
    timeoutId = setTimeout(() => {
      // Verificar novamente se o container está visível antes de criar
      if (!mapRef.current) return
      const rect = mapRef.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        console.log('⚠️ Container ainda não está visível no timeout, pulando criação')
        return
      }
      if (!isMountedRef.current || !mapRef.current || !window.L) {
        console.log('⚠️ Condições não atendidas para criar mapa:', {
          isMounted: isMountedRef.current,
          mapRef: !!mapRef.current,
          windowL: !!window.L
        })
        return
      }
      
      // Verificar novamente se o mapa já foi criado (evitar race condition)
      if (mapInstanceRef.current) {
        console.log('⚠️ Mapa já foi criado por outra execução, cancelando...')
        return
      }

      const lat = latitude
      const lng = longitude

      console.log('🗺️ Criando mapa com coordenadas:', { lat, lng, radiusKm })

      // Calcular zoom baseado no raio
      const getZoom = (radius: number | null) => {
        if (!radius) return 13
        if (radius <= 1) return 15
        if (radius <= 3) return 14
        if (radius <= 5) return 13
        if (radius <= 10) return 12
        return 11
      }

      try {
        if (!mapRef.current) {
          console.error('❌ mapRef.current é null')
          return
        }

        // Verificar se o container está visível
        const containerRect = mapRef.current.getBoundingClientRect()
        if (containerRect.width === 0 || containerRect.height === 0) {
          console.warn('⚠️ Container não está visível, tentando novamente...')
          setTimeout(() => {
            if (mapRef.current && isMountedRef.current) {
              // Tentar novamente
            }
          }, 200)
          return
        }

        console.log('✅ Container visível:', { width: containerRect.width, height: containerRect.height })

        // Limpar container completamente
        mapRef.current.innerHTML = ''

        // Aguardar um frame para garantir que o DOM foi atualizado
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!isMountedRef.current || !mapRef.current || !window.L) return

            try {
              console.log('🗺️ Inicializando mapa Leaflet...')
              
              // Criar mapa de forma simples
              const map = window.L.map(mapRef.current).setView([lat, lng], getZoom(radiusKm))
              mapInstanceRef.current = map

              console.log('✅ Mapa criado, adicionando tiles...')

              // Adicionar camada OpenStreetMap
              const tileLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
              }).addTo(map)

              tileLayerRef.current = tileLayer

              console.log('✅ TileLayer adicionado')

              // Aguardar que o mapa esteja pronto antes de adicionar elementos
              map.whenReady(() => {
                console.log('✅ Mapa pronto (whenReady)')
                
                if (!isMountedRef.current || mapInstanceRef.current !== map) {
                  try {
                    map.remove()
                  } catch (e) {}
                  return
                }

                // Forçar invalidateSize após o mapa estar pronto
                setTimeout(() => {
                  if (!isMountedRef.current || mapInstanceRef.current !== map) return
                  
                  try {
                    console.log('🔄 Invalidando tamanho do mapa...')
                    map.invalidateSize()

                    // Adicionar marcador no ponto central
                    const centerIcon = window.L.divIcon({
                      className: 'custom-center-marker',
                      html: `
                        <div style="
                          background: #3B82F6;
                          width: 16px;
                          height: 16px;
                          border-radius: 50%;
                          border: 3px solid white;
                          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                        "></div>
                      `,
                      iconSize: [16, 16],
                      iconAnchor: [8, 8]
                    })

                    const marker = window.L.marker([lat, lng], { icon: centerIcon }).addTo(map)
                    markerRef.current = marker

                    // Adicionar popup no marcador
                    marker.bindPopup(`
                      <div style="min-width: 200px;">
                        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
                          📍 Ponto Escolhido
                        </h3>
                        <p style="margin: 4px 0; font-size: 12px; font-family: monospace;">
                          ${lat.toFixed(4)}, ${lng.toFixed(4)}
                        </p>
                        ${radiusKm ? `<p style="margin: 4px 0; font-size: 12px;">Raio: ${radiusKm} km</p>` : ''}
                      </div>
                    `)

                    // Adicionar círculo da área permitida (se houver raio)
                    if (radiusKm && !isNaN(radiusKm) && radiusKm > 0) {
                      // Converter raio de km para metros
                      const radiusMeters = radiusKm * 1000

                      const circle = window.L.circle([lat, lng], {
                        color: '#3B82F6',
                        fillColor: '#3B82F6',
                        fillOpacity: 0.2,
                        radius: radiusMeters,
                        weight: 3
                      }).addTo(map)

                      circleRef.current = circle

                      // Adicionar popup no círculo
                      circle.bindPopup(`
                        <div style="min-width: 200px;">
                          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
                            ⭕ Área Permitida
                          </h3>
                          <p style="margin: 4px 0; font-size: 12px;">
                            Raio: <strong>${radiusKm} km</strong>
                          </p>
                          <p style="margin: 4px 0; font-size: 12px; color: #666;">
                            Centro: ${lat.toFixed(4)}, ${lng.toFixed(4)}
                          </p>
                        </div>
                      `)

                      // Ajustar view para mostrar o círculo completo
                      try {
                        map.fitBounds(circle.getBounds(), { 
                          padding: [20, 20]
                        })
                      } catch (e) {
                        // Se falhar, apenas centralizar
                        map.setView([lat, lng], getZoom(radiusKm))
                      }
                    }

                    console.log('✅ Mapa completamente inicializado!')
                  } catch (error) {
                    console.error('❌ Erro ao adicionar elementos ao mapa:', error)
                  }
                }, 200)
              })
            } catch (error) {
              console.error('❌ Erro ao criar mapa:', error)
              setMapError('Erro ao criar o mapa: ' + (error instanceof Error ? error.message : String(error)))
            }
          })
        })
      } catch (error) {
        console.error('❌ Erro ao preparar mapa:', error)
      }
    }, 200)

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      cleanup()
    }
  }, [isMapLoaded, latitude, longitude, radiusKm])

  if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
    return (
      <div className="border border-gray-200 rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: '300px' }}>
        <div className="text-center text-secondary">
          <div className="text-4xl mb-2">🗺️</div>
          <div className="text-sm">Preencha latitude e longitude para ver o mapa</div>
        </div>
      </div>
    )
  }

  if (mapError) {
    return (
      <div className="border border-gray-200 rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: '300px' }}>
        <div className="text-center text-secondary">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm font-semibold mb-1">Erro ao carregar mapa</div>
          <div className="text-xs">{mapError}</div>
        </div>
      </div>
    )
  }

  if (!isMapLoaded) {
    return (
      <div className="border border-gray-200 rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: '300px' }}>
        <div className="text-center text-secondary">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <div className="text-sm">Carregando mapa...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ position: 'relative' }}>
      <div 
        ref={mapRef} 
        className="w-full" 
        style={{ 
          height: '300px',
          minHeight: '300px',
          position: 'relative',
          zIndex: 1,
          backgroundColor: '#e5e7eb'
        }}
      />
      {/* Overlay com informações */}
      <div className="absolute top-2 left-2 bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200 z-[1000]" style={{ pointerEvents: 'none' }}>
        <div className="text-xs font-semibold text-primary">📍 Ponto Escolhido</div>
        <div className="text-xs text-secondary font-mono">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </div>
        {radiusKm && !isNaN(radiusKm) && (
          <div className="text-xs text-secondary mt-1">
            Raio: {radiusKm} km
          </div>
        )}
      </div>
      {/* Link para abrir no Google Maps */}
      <a
        href={`https://www.google.com/maps?q=${latitude},${longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs font-medium text-primary flex items-center gap-1 z-[1000]"
        style={{ pointerEvents: 'auto' }}
      >
        🔗 Abrir no Google Maps
      </a>
      
    </div>
  )
}

// Declaração global para TypeScript
declare global {
  interface Window {
    L: any
  }
}

interface GroupModalProps {
  group: DeviceGroup | null
  isOpen: boolean
  onClose: () => void
}

type TabKey = 'overview' | 'devices' | 'policies' | 'monitoring'

export default function GroupModal({ group, isOpen, onClose }: GroupModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState<any | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string; user_id: string; devices_count: number; device_ids: string[] }>>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [groupPolicies, setGroupPolicies] = useState<Array<{ id: string; package_name: string; app_name: string; policy_type: string }>>([])
  const [availableApps, setAvailableApps] = useState<Array<{ packageName: string; appName: string; icon?: string }>>([])
  const [selectedApps, setSelectedApps] = useState<string[]>([])
  const [isSavingPolicies, setIsSavingPolicies] = useState(false)
  const [appSearchQuery, setAppSearchQuery] = useState('')
  const [allowedNetworks, setAllowedNetworks] = useState<string[]>([])
  const [allowedLocation, setAllowedLocation] = useState<{ latitude: number; longitude: number; radius_km: number } | null>(null)
  const [configModalOpen, setConfigModalOpen] = useState<'networks' | 'location' | null>(null)

  // Fechar modais internos ao pressionar ESC (prioridade sobre o modal principal)
  useEffect(() => {
    if (!configModalOpen) return
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // Prevenir que o handler do modal principal também execute
        setConfigModalOpen(null)
      }
    }
    // Usar capture phase para garantir que executa primeiro
    document.addEventListener('keydown', handleEsc, true)
    return () => document.removeEventListener('keydown', handleEsc, true)
  }, [configModalOpen])
  const [newNetworkName, setNewNetworkName] = useState('')
  const [locationLat, setLocationLat] = useState('')
  const [locationLon, setLocationLon] = useState('')
  const [locationRadius, setLocationRadius] = useState('5')

  useEffect(() => {
    if (!group || !isOpen) return
    setActiveTab('overview')
    loadData(group.id)
  }, [group, isOpen])

  // Função para recarregar apenas stats e devices (usado para atualizações rápidas)
  const refreshMonitoringData = useCallback(async () => {
    if (!group?.id) return
    
    try {
      const [statsRes, devicesRes] = await Promise.all([
        fetch(`/api/groups/${group.id}/stats`),
        fetch(`/api/groups/${group.id}/devices`)
      ])
      
      if (statsRes.ok) {
        const s = await statsRes.json()
        setStats(s.data || null)
      }
      
      if (devicesRes.ok) {
        const d = await devicesRes.json()
        const devicesData = d.data || []
        setDevices(devicesData)
      }
    } catch (error) {
      console.error('Erro ao atualizar dados de monitoramento:', error)
    }
  }, [group])

  // Atualização periódica dos dados (especialmente para monitoramento)
  useEffect(() => {
    if (!group || !isOpen) return
    
    // Recarregar dados a cada 5 segundos quando o modal estiver aberto
    const interval = setInterval(() => {
      if (group.id) {
        loadData(group.id, true) // skipLoadingState = true para evitar flicker
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [group, isOpen])

  // Listener para atualizações de dispositivos via eventos customizados
  useEffect(() => {
    if (!isOpen || !group) return

    const handleDeviceUpdate = (event: CustomEvent) => {
      // Sempre recarregar quando houver atualização
      refreshMonitoringData()
    }

    window.addEventListener('device-updated', handleDeviceUpdate as EventListener)
    
    return () => {
      window.removeEventListener('device-updated', handleDeviceUpdate as EventListener)
    }
  }, [isOpen, group, refreshMonitoringData])

  async function loadData(groupId: string, skipLoadingState = false) {
    try {
      if (!skipLoadingState) {
        setIsLoading(true)
      }
      const [statsRes, devicesRes, usersRes, policiesRes, availableAppsRes, restrictionsRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/stats`),
        fetch(`/api/groups/${groupId}/devices`),
        fetch(`/api/device-users`),
        fetch(`/api/groups/${groupId}/policies`),
        fetch(`/api/groups/${groupId}/available-apps`),
        fetch(`/api/groups/${groupId}/restrictions`)
      ])
      if (statsRes.ok) {
        const s = await statsRes.json()
        setStats(s.data || null)
      }
      if (devicesRes.ok) {
        const d = await devicesRes.json()
        setDevices(d.data || [])
        
        // Sincronizar apps: Buscar apps armazenados do banco primeiro
        let appsFromDb: any[] = []
        if (availableAppsRes.ok) {
          const appsData = await availableAppsRes.json()
          appsFromDb = appsData.data || []
        }
        
        // Buscar apps de TODOS os dispositivos online do grupo
        const onlineDevices = d.data?.filter((dev: any) => 
          (dev.status === 'online' || dev.status === 'Online') && 
          dev.installedApps && 
          Array.isArray(dev.installedApps) && 
          dev.installedApps.length > 0
        ) || []
        
        // Consolidar apps de todos os dispositivos online
        const appsMap = new Map()
        onlineDevices.forEach((device: any) => {
          device.installedApps.forEach((app: any) => {
            const packageName = app.packageName
            if (!packageName) return
            
            if (!appsMap.has(packageName)) {
              appsMap.set(packageName, {
                packageName: packageName,
                appName: app.appName || packageName,
                icon: app.icon || app.iconBase64 || app.icon_base64
              })
            } else {
              // Preferir appName mais completo e ícone se disponível
              const existing = appsMap.get(packageName)
              if (app.appName && app.appName.length > (existing.appName?.length || 0)) {
                existing.appName = app.appName
              }
              if (!existing.icon && (app.icon || app.iconBase64 || app.icon_base64)) {
                existing.icon = app.icon || app.iconBase64 || app.icon_base64
              }
            }
          })
        })
        
        const appsFromDevices = Array.from(appsMap.values())
        
        // Se há apps dos dispositivos online, sincronizar com o banco
        if (appsFromDevices.length > 0) {
          const deviceAppsData = onlineDevices.map((device: any) => ({
            deviceId: device.deviceId || device.device_id,
            apps: device.installedApps.map((app: any) => ({
              packageName: app.packageName,
              appName: app.appName || app.packageName,
              icon: app.icon || app.iconBase64 || app.icon_base64
            }))
          }))
          
          // Sincronizar no banco (em background, não bloqueia a UI)
          fetch(`/api/groups/${groupId}/available-apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceApps: deviceAppsData })
          }).catch(err => console.error('Erro ao sincronizar apps:', err))
        }
        
        // Combinar apps do banco com apps dos dispositivos (priorizar apps dos dispositivos se houver)
        const combinedApps = new Map()
        
        // Função helper para normalizar ícone (garantir formato data URL se for base64)
        const normalizeIcon = (icon: string | undefined | null | any): string | undefined => {
          if (!icon) return undefined
          
          // Se for um objeto (JSON serializado incorretamente), ignorar silenciosamente
          if (typeof icon === 'object') {
            return undefined
          }
          
          // Se for string mas contém JSON serializado (objeto Bitmap/Drawable do Android)
          if (typeof icon === 'string') {
            // Detectar objetos JSON serializados comuns do Android
            if (icon.startsWith('{') || icon.startsWith('[')) {
              // Silenciosamente ignorar ícones JSON inválidos (erro comum do Android)
              return undefined
            }
            
            // Detectar objetos JSON mesmo se não começar com {
            // Isso pode acontecer quando o JSON é inserido em uma string maior
            if (icon.includes('"mBitmapState"') || icon.includes('"mSrcDensityOverride"') || 
                icon.includes('{"m') || icon.match(/^\s*\{.*\}\s*$/)) {
              // Silenciosamente ignorar ícones JSON inválidos
              return undefined
            }
            
            // Se já é uma data URL válida, validar se não contém JSON
            if (icon.startsWith('data:image/')) {
              // Verificar se não é um objeto JSON malformado após o prefixo
              const afterPrefix = icon.substring(icon.indexOf(',') + 1)
              if (afterPrefix.startsWith('{') || afterPrefix.includes('"mBitmapState"')) {
                // Silenciosamente ignorar data URLs inválidas
                return undefined
              }
              return icon
            }
            
            // Se parece ser base64 válido (string longa sem caracteres especiais de JSON)
            // Base64 válido: apenas A-Z, a-z, 0-9, +, /, = (e pode ter espaços/newlines, mas vamos ignorar)
            const base64Regex = /^[A-Za-z0-9+/=\s\n\r]+$/
            if (icon.length > 50 && base64Regex.test(icon) && !icon.includes('{') && !icon.includes('[') && 
                !icon.includes('http') && !icon.includes('"m')) {
              // Remover espaços e newlines que podem estar no base64
              const cleanBase64 = icon.replace(/[\s\n\r]/g, '')
              return `data:image/png;base64,${cleanBase64}`
            }
            
            // Se é URL HTTP/HTTPS, retornar como está
            if (icon.startsWith('http://') || icon.startsWith('https://')) {
              return icon
            }
          }
          
          // Caso contrário, ignorar
          return undefined
        }
        
        // Adicionar apps do banco
        appsFromDb.forEach((app: any) => {
          combinedApps.set(app.packageName, {
            packageName: app.packageName,
            appName: app.appName || app.packageName,
            icon: normalizeIcon(app.icon || app.icon_base64)
          })
        })
        
        // Adicionar/atualizar com apps dos dispositivos online
        appsFromDevices.forEach((app: any) => {
          const existing = combinedApps.get(app.packageName)
          combinedApps.set(app.packageName, {
            packageName: app.packageName,
            appName: app.appName || app.packageName,
            icon: normalizeIcon(app.icon || app.iconBase64 || app.icon_base64) || existing?.icon
          })
        })
        
        setAvailableApps(Array.from(combinedApps.values()))
      }
      if (usersRes.ok) {
        const u = await usersRes.json()
        setUsers(u.data || [])
      }
      if (policiesRes.ok) {
        const p = await policiesRes.json()
        setGroupPolicies(p.data || [])
        setSelectedApps((p.data || []).map((pol: any) => pol.package_name))
      }
      if (restrictionsRes.ok) {
        const r = await restrictionsRes.json()
        if (r.success) {
          setAllowedNetworks(r.data.allowedNetworks || [])
          setAllowedLocation(r.data.allowedLocation || null)
          if (r.data.allowedLocation) {
            setLocationLat(r.data.allowedLocation.latitude?.toString() || '')
            setLocationLon(r.data.allowedLocation.longitude?.toString() || '')
            setLocationRadius(r.data.allowedLocation.radius_km?.toString() || '5')
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      if (!skipLoadingState) {
        setIsLoading(false)
      }
    }
  }

  // Atualização mais frequente quando estiver na aba de monitoramento
  useEffect(() => {
    if (!group || !isOpen || activeTab !== 'monitoring') return

    // Recarregar dados de monitoramento a cada 3 segundos quando na aba de monitoramento
    const interval = setInterval(() => {
      refreshMonitoringData()
    }, 3000)

    return () => clearInterval(interval)
  }, [group, isOpen, activeTab, refreshMonitoringData])

  // Manter marcado automaticamente o usuário cuja regra já esteja aplicada (todos os seus devices no grupo)
  const parsePgArray = (value: any): string[] => {
    if (!value) return []
    if (Array.isArray(value)) return value.filter(Boolean)
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const inner = trimmed.slice(1, -1)
        if (!inner) return []
        return inner.split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean)
      }
      return [trimmed]
    }
    return []
  }

  const isUserApplied = (u: { id?: string; user_id?: string; device_ids?: any }) => {
    const deviceIdSet = new Set((devices || []).map(d => (d as any).deviceId || (d as any).device_id))
    const userDeviceIds = parsePgArray((u as any).device_ids)
    // Regra 1: pelo menos um device desse usuário presente no grupo
    const byDeviceIds = userDeviceIds.some((id: string) => deviceIdSet.has(id))
    if (byDeviceIds) return true
    // Regra 2: checar relacionamento direto por usuário nos devices do grupo
    const uid = (u as any).id
    const ucode = (u as any).user_id
    const byUserBinding = (devices || []).some(d => {
      const assignedUuid = (d as any).assignedDeviceUserId || (d as any).assigned_device_user_id
      const assignedCode = (d as any).assignedUserId || (d as any).user_id
      return (uid && assignedUuid === uid) || (ucode && assignedCode === ucode)
    })
    return byUserBinding
  }

  const hasPolicies = useMemo(() => (group?.appPolicies?.length || 0) > 0, [group])

  // Interface para avisos
  interface Alert {
    id: string
    type: 'warning' | 'error' | 'info'
    title: string
    message: string
    deviceId?: string
    deviceName?: string
    timestamp?: number
  }

  // Função para calcular distância entre duas coordenadas (Haversine)
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371 // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }, [])

  // Função para detectar avisos nos dispositivos
  const detectAlerts = useMemo((): Alert[] => {
    const alerts: Alert[] = []

    if (!devices || devices.length === 0) return alerts

    const now = Date.now()

    devices.forEach((device) => {
      const deviceName = device.name || device.deviceId || 'Dispositivo desconhecido'
      
      // 1. Bateria baixa (< 10%)
      if (device.batteryLevel !== undefined && device.batteryLevel !== null) {
        if (device.batteryLevel < 10 && !device.isCharging) {
          alerts.push({
            id: `battery-low-${device.deviceId}`,
            type: 'warning',
            title: 'Bateria baixa',
            message: `${deviceName} está com apenas ${device.batteryLevel}% de bateria`,
            deviceId: device.deviceId,
            deviceName: deviceName,
            timestamp: device.lastSeen
          })
        }
      }

      // 2. Sem localização há muito tempo (se dispositivo está online)
      if (device.status === 'online') {
        if (!device.latitude || !device.longitude || !device.lastLocationUpdate) {
          alerts.push({
            id: `no-location-${device.deviceId}`,
            type: 'info',
            title: 'Localização indisponível',
            message: `${deviceName} não está enviando informações de localização`,
            deviceId: device.deviceId,
            deviceName: deviceName
          })
        }
      }

      // 4. Dispositivo sem WiFi conectado (mas WiFi está habilitado)
      if (device.status === 'online' && device.isWifiEnabled && !device.wifiSSID) {
        alerts.push({
          id: `no-wifi-${device.deviceId}`,
          type: 'warning',
          title: 'WiFi desconectado',
          message: `${deviceName} tem WiFi habilitado mas não está conectado a nenhuma rede`,
          deviceId: device.deviceId,
          deviceName: deviceName
        })
      }

      // 5. Rede não permitida
      if (device.wifiSSID && allowedNetworks.length > 0 && !allowedNetworks.includes(device.wifiSSID)) {
        alerts.push({
          id: `unauthorized-network-${device.deviceId}`,
          type: 'error',
          title: 'Rede não permitida',
          message: `${deviceName} está conectado à rede "${device.wifiSSID}" que não está na lista de redes permitidas`,
          deviceId: device.deviceId,
          deviceName: deviceName
        })
      }

      // 6. Fora da área permitida
      if (device.latitude && device.longitude && allowedLocation) {
        const distance = calculateDistance(
          device.latitude,
          device.longitude,
          allowedLocation.latitude,
          allowedLocation.longitude
        )
        if (distance > allowedLocation.radius_km) {
          alerts.push({
            id: `outside-area-${device.deviceId}`,
            type: 'error',
            title: 'Fora da área permitida',
            message: `${deviceName} está ${distance.toFixed(2)} km fora da área permitida (raio: ${allowedLocation.radius_km} km)`,
            deviceId: device.deviceId,
            deviceName: deviceName
          })
        }
      }
    })

    // Ordenar avisos por tipo (error > warning > info) e depois por timestamp
    return alerts.sort((a, b) => {
      const typeOrder = { error: 0, warning: 1, info: 2 }
      if (typeOrder[a.type] !== typeOrder[b.type]) {
        return typeOrder[a.type] - typeOrder[b.type]
      }
      return (b.timestamp || 0) - (a.timestamp || 0)
    })
  }, [devices, allowedNetworks, allowedLocation])


  // Funções para salvar configurações
  const handleSaveNetworks = async () => {
    try {
      const res = await fetch(`/api/groups/${group.id}/restrictions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedNetworks })
      })
      if (res.ok) {
        alert('Redes permitidas atualizadas com sucesso!')
        setConfigModalOpen(null)
      } else {
        alert('Erro ao salvar redes permitidas')
      }
    } catch (error) {
      console.error('Erro ao salvar redes:', error)
      alert('Erro ao salvar redes permitidas')
    }
  }

  const handleSaveLocation = async () => {
    try {
      const lat = parseFloat(locationLat)
      const lon = parseFloat(locationLon)
      const radius = parseFloat(locationRadius)

      if (isNaN(lat) || isNaN(lon) || isNaN(radius)) {
        alert('Por favor, preencha todos os campos com valores válidos')
        return
      }

      const location = { latitude: lat, longitude: lon, radius_km: radius }
      
      const res = await fetch(`/api/groups/${group.id}/restrictions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedLocation: location })
      })
      if (res.ok) {
        setAllowedLocation(location)
        alert('Área permitida atualizada com sucesso!')
        setConfigModalOpen(null)
      } else {
        alert('Erro ao salvar área permitida')
      }
    } catch (error) {
      console.error('Erro ao salvar localização:', error)
      alert('Erro ao salvar área permitida')
    }
  }

  // Função para formatar user_id: user_1 -> usuário.1
  const formatUserId = (userId: string | undefined | null): string => {
    if (!userId) return ''
    
    // Se já está no formato "usuário.X", retornar como está
    if (userId.startsWith('usuário.')) {
      return userId
    }
    
    // Se está no formato "user_X" ou "userX", converter para "usuário.X"
    const match = userId.match(/^user[_\s]?(\d+)$/i)
    if (match) {
      return `usuário.${match[1]}`
    }
    
    // Se não corresponder ao padrão, retornar como está
    return userId
  }

  // Fechar ao pressionar ESC (modal principal) - só fecha se não houver modais internos abertos
  useEffect(() => {
    if (!isOpen) return
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Se há um modal interno aberto, não fechar o modal principal
        // O handler do modal interno já fechou ele (com stopPropagation)
        if (!configModalOpen) {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose, configModalOpen])

  if (!isOpen || !group) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Só fecha o modal principal se não houver modal interno aberto
        if (!configModalOpen) {
          onClose()
        }
      }}
    >
      <div 
        className="bg-surface rounded-xl shadow-xl max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex justify-between items-start">
          <div className="flex items-start">
            <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: group.color }}></div>
            <div>
              <h3 className="text-2xl font-bold text-primary">{group.name}</h3>
              <p className="text-secondary">{group.description}</p>
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
            {[
              { id: 'overview', label: 'Visão Geral', icon: '📊' },
              { id: 'devices', label: 'Dispositivos', icon: '📱' },
              { id: 'policies', label: 'Políticas', icon: '📋' },
              { id: 'monitoring', label: 'Monitoramento', icon: '📈' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabKey)}
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
          {isLoading && (
            <div className="text-center text-secondary">Carregando...</div>
          )}

          {!isLoading && activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Cards de Estatísticas */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="card p-4">
                  <div className="text-secondary">Total de Dispositivos</div>
                  <div className="text-2xl font-semibold text-primary">{stats?.total_devices ?? group.deviceCount}</div>
                </div>
                <div className="card p-4">
                  <div className="text-secondary">Online agora</div>
                  <div className="text-2xl font-semibold text-primary">{stats?.online_devices ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-secondary">Média de Bateria</div>
                  <div className="text-2xl font-semibold text-primary">{Math.round(Number(stats?.avg_battery_level || 0))}%</div>
                </div>
                <div className="card p-4">
                  <div className="text-secondary">Políticas</div>
                  <div className="text-2xl font-semibold text-primary">{group.appPolicies.length}</div>
                  <div className={`text-xs mt-1 ${hasPolicies ? 'text-green-600' : 'text-secondary'}`}>{hasPolicies ? 'Com regras ativas' : 'Sem regras'}</div>
                </div>
              </div>

              {/* Configurações de Segurança */}
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">Configurações de Segurança</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card de Redes Permitidas */}
                  <div
                    onClick={() => setConfigModalOpen('networks')}
                    className="card p-4 cursor-pointer hover:shadow-lg transition-all border-2 border-gray-200 hover:border-primary"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">📶</span>
                          <h4 className="font-semibold text-primary">Redes Permitidas</h4>
                        </div>
                        <p className="text-sm text-secondary mb-3">
                          Configure quais redes WiFi os dispositivos podem conectar
                        </p>
                        {allowedNetworks.length > 0 ? (
                          <div className="space-y-1">
                            <div className="text-xs text-secondary">Redes configuradas:</div>
                            <div className="flex flex-wrap gap-1">
                              {allowedNetworks.slice(0, 3).map((network, idx) => (
                                <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                  {network}
                                </span>
                              ))}
                              {allowedNetworks.length > 3 && (
                                <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                  +{allowedNetworks.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-secondary italic">Nenhuma rede configurada</div>
                        )}
                      </div>
                      <button className="ml-2 text-primary hover:text-blue-600">
                        ✏️
                      </button>
                    </div>
                  </div>

                  {/* Card de Localização Permitida */}
                  <div
                    onClick={() => setConfigModalOpen('location')}
                    className="card p-4 cursor-pointer hover:shadow-lg transition-all border-2 border-gray-200 hover:border-primary"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">📍</span>
                          <h4 className="font-semibold text-primary">Área Permitida</h4>
                        </div>
                        <p className="text-sm text-secondary mb-3">
                          Defina uma área geográfica permitida para os dispositivos
                        </p>
                        {allowedLocation ? (
                          <div className="space-y-1">
                            <div className="text-xs text-secondary">
                              Centro: {allowedLocation.latitude?.toFixed(4)}, {allowedLocation.longitude?.toFixed(4)}
                            </div>
                            <div className="text-xs text-secondary">
                              Raio: {allowedLocation.radius_km} km
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-secondary italic">Nenhuma área configurada</div>
                        )}
                      </div>
                      <button className="ml-2 text-primary hover:text-blue-600">
                        ✏️
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção de Avisos */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-primary">Avisos e Alertas</h3>
                  {detectAlerts.length > 0 && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                      {detectAlerts.length} aviso{detectAlerts.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                
                {detectAlerts.length === 0 ? (
                  <div className="card p-8 text-center">
                    <div className="text-4xl mb-2">✅</div>
                    <div className="text-secondary font-medium">Nenhum aviso no momento</div>
                    <div className="text-xs text-secondary mt-1">Todos os dispositivos estão operando normalmente</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detectAlerts.map((alert) => {
                      const getAlertIcon = () => {
                        if (alert.type === 'error') return '🔴'
                        if (alert.type === 'warning') return '⚠️'
                        return 'ℹ️'
                      }

                      const getAlertColor = () => {
                        if (alert.type === 'error') return 'border-red-200 bg-red-50'
                        if (alert.type === 'warning') return 'border-yellow-200 bg-yellow-50'
                        return 'border-blue-200 bg-blue-50'
                      }

                      const getAlertTextColor = () => {
                        if (alert.type === 'error') return 'text-red-700'
                        if (alert.type === 'warning') return 'text-yellow-700'
                        return 'text-blue-700'
                      }

                      const formatTime = (timestamp?: number) => {
                        if (!timestamp) return ''
                        const diff = Date.now() - timestamp
                        const minutes = Math.floor(diff / 60000)
                        const hours = Math.floor(minutes / 60)
                        
                        if (hours > 0) return `${hours}h atrás`
                        if (minutes > 0) return `${minutes}min atrás`
                        return 'Agora'
                      }

                      return (
                        <div
                          key={alert.id}
                          className={`card p-4 border-2 ${getAlertColor()} ${getAlertTextColor()}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-2xl flex-shrink-0">{getAlertIcon()}</div>
                            <div className="flex-1">
                              <div className="font-semibold text-primary mb-1">{alert.title}</div>
                              <div className="text-sm text-secondary">{alert.message}</div>
                              {alert.timestamp && (
                                <div className="text-xs text-secondary mt-1 opacity-75">
                                  {formatTime(alert.timestamp)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isLoading && activeTab === 'devices' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-secondary mb-2">Usuários do sistema</h4>
                {users.length === 0 ? (
                  <div className="text-secondary text-center py-6">Nenhum usuário registrado</div>
                ) : (
                  users.map((u, idx) => (
                    <label key={u.id || u.user_id || `user_${idx}`} className="card p-3 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id) || isUserApplied(u as any)}
                          onChange={async (e) => {
                            const checked = e.currentTarget.checked
                            setSelectedUserIds((prev) => {
                              const base = new Set(prev)
                              if (checked) base.add(u.id); else base.delete(u.id)
                              return Array.from(base)
                            })
                            try {
                              // Aplicar/remover regras: adicionar/remover todos devices do usuário ao grupo
                              await Promise.all(
                                (u.device_ids || []).map(async (deviceId) => {
                                  if (checked) {
                                    await fetch(`/api/groups/${group.id}/devices`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ deviceId })
                                    })
                                  } else {
                                    await fetch(`/api/groups/${group.id}/devices?deviceId=${encodeURIComponent(deviceId)}`, {
                                      method: 'DELETE'
                                    })
                                  }
                                })
                              )
                              // Refresh dispositivos do grupo após aplicar
                              const ref = await fetch(`/api/groups/${group.id}/devices`)
                              if (ref.ok) {
                                const d = await ref.json()
                                setDevices(d.data || [])
                              }
                            } catch (err) {
                              console.error('Erro ao aplicar regras por usuário:', err)
                            }
                          }}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <div>
                          <div className="font-medium text-primary">{u.name}</div>
                          <div className="text-xs text-secondary">{formatUserId(u.user_id)} • {u.devices_count} dispositivo(s)</div>
                        </div>
                      </div>
                      <div className="text-xs text-secondary">Aplicar regras do grupo</div>
                    </label>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-secondary mb-2">Dispositivos no grupo</h4>
                {devices.length === 0 ? (
                  <div className="text-secondary text-center py-6">Nenhum dispositivo no grupo</div>
                ) : (
                  devices.map((d, idx) => {
                    const devId = (d as any).deviceId || (d as any).device_id
                    const model = (d as any).model
                    const androidVersion = (d as any).androidVersion || (d as any).android_version
                    const battery = (d as any).batteryLevel ?? (d as any).battery_level ?? 0
                    return (
                    <div key={(d as any).id || devId || `dev_${idx}`} className="card p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-primary">{(d as any).name}</div>
                        <div className="text-sm text-secondary">{devId} • {model} • Android {androidVersion}</div>
                      </div>
                      <div className="text-sm text-secondary">Bateria: {battery}%</div>
                    </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {!isLoading && activeTab === 'policies' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-primary mb-2">Políticas de Apps do Grupo</h3>
                <p className="text-sm text-secondary mb-4">
                  Selecione os apps que serão forçados para exibição em todos os dispositivos deste grupo. 
                  As políticas do grupo têm prioridade sobre políticas individuais de dispositivos.
                </p>
              </div>

              {devices.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-secondary">Adicione dispositivos ao grupo para configurar políticas de apps.</div>
                </div>
              ) : availableApps.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-secondary">Nenhum app disponível. Certifique-se de que pelo menos um dispositivo está online.</div>
                </div>
              ) : (
                <>
                  {/* Barra de busca e botão desmarcar tudo */}
                  <div className="flex gap-3 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Buscar apps..."
                        value={appSearchQuery}
                        onChange={(e) => setAppSearchQuery(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    {selectedApps.length > 0 && (
                      <button
                        onClick={() => setSelectedApps([])}
                        className="px-4 py-2.5 text-sm font-medium text-secondary hover:text-primary border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors whitespace-nowrap"
                      >
                        Desmarcar tudo
                      </button>
                    )}
                  </div>

                  {/* Lista de apps */}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {availableApps
                      .filter((app) => 
                        app.appName.toLowerCase().includes(appSearchQuery.toLowerCase()) ||
                        app.packageName.toLowerCase().includes(appSearchQuery.toLowerCase())
                      )
                      .map((app) => {
                        const isSelected = selectedApps.includes(app.packageName)
                        return (
                          <label
                            key={app.packageName}
                            className="card p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedApps([...selectedApps, app.packageName])
                                } else {
                                  setSelectedApps(selectedApps.filter((pkg) => pkg !== app.packageName))
                                }
                              }}
                              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                            />
                            {app.icon && (
                              <img
                                src={(() => {
                                  // Validar e normalizar ícone antes de usar
                                  const icon = app.icon
                                  if (!icon || typeof icon !== 'string') return ''
                                  
                                  // Detectar objetos JSON malformados do Android
                                  if (icon.startsWith('{') || icon.startsWith('[') || 
                                      icon.includes('"mBitmapState"') || icon.includes('"mSrcDensityOverride"') ||
                                      icon.match(/^\s*\{.*\}\s*$/)) {
                                    return ''
                                  }
                                  
                                  // Verificar se data URL contém JSON inválido
                                  if (icon.startsWith('data:image/')) {
                                    const afterComma = icon.substring(icon.indexOf(',') + 1)
                                    if (afterComma.startsWith('{') || afterComma.includes('"mBitmapState"')) {
                                      return ''
                                    }
                                    return icon
                                  }
                                  
                                  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon
                                  
                                  // Se parece ser base64 válido, adicionar prefixo
                                  const base64Regex = /^[A-Za-z0-9+/=\s\n\r]+$/
                                  if (icon.length > 50 && base64Regex.test(icon) && !icon.includes('{') && !icon.includes('"m')) {
                                    return `data:image/png;base64,${icon.replace(/[\s\n\r]/g, '')}`
                                  }
                                  
                                  return ''
                                })()}
                                alt={app.appName}
                                className="w-10 h-10 rounded-lg object-cover"
                                onError={(e) => {
                                  // Silenciosamente esconder imagem inválida e mostrar placeholder
                                  e.currentTarget.style.display = 'none'
                                  const placeholder = e.currentTarget.nextElementSibling as HTMLElement
                                  if (placeholder) placeholder.style.display = 'flex'
                                }}
                              />
                            )}
                            <div 
                              className={`w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${app.icon ? 'hidden' : ''}`}
                            >
                              <span className="text-white text-sm font-bold">
                                {app.appName?.charAt(0)?.toUpperCase() || '📱'}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-primary">{app.appName}</div>
                              <div className="text-xs text-secondary font-mono">{app.packageName}</div>
                            </div>
                          </label>
                        )
                      })}
                  </div>

                  {/* Botão salvar */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-secondary hover:text-primary transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          setIsSavingPolicies(true)
                          
                          // ✅ Aplicar políticas ANTES de atualizar o banco
                          // IMPORTANTE: Apps individuais têm prioridade sobre política de grupo
                          // Se um app está configurado individualmente no dispositivo, ele será ignorado pela política de grupo
                          
                          // Aplicar políticas a todos os dispositivos do grupo via API
                          // O servidor vai filtrar os apps que já estão configurados individualmente
                          // Apenas apps que não estão individuais serão aplicados pela política de grupo
                          const policyPackages = selectedApps
                          
                          const applyRes = await fetch(`/api/groups/${group.id}/apply-policies`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              allowedApps: policyPackages // Apps selecionados na política de grupo (serão filtrados: apps individuais serão ignorados)
                            })
                          })
                          
                          let successMessage = ''
                          if (applyRes.ok) {
                            const applyResult = await applyRes.json()
                            console.log('Políticas aplicadas:', applyResult)
                            const data = applyResult.data || {}
                            const successCount = data.success || 0
                            const failedCount = data.failed || 0
                            const total = data.total || 0
                            
                            if (successCount > 0) {
                              successMessage = `✅ Políticas aplicadas com sucesso!\n\n`
                              successMessage += `📱 Dispositivos: ${successCount}/${total} receberam as políticas\n`
                              if (failedCount > 0) {
                                successMessage += `⚠️ ${failedCount} dispositivo(s) offline ou desconectado(s)`
                              }
                            } else {
                              successMessage = `⚠️ Nenhum dispositivo online para receber as políticas.\n${total} dispositivo(s) no grupo estão offline.`
                            }
                          } else {
                            const errorText = await applyRes.text()
                            console.error('Erro ao aplicar políticas:', errorText)
                            successMessage = `❌ Erro ao aplicar políticas: ${errorText}`
                          }
                          
                          // SÓ DEPOIS de aplicar, atualizar o banco
                          // Remover políticas que não estão mais selecionadas
                          const policiesToRemove = groupPolicies
                            .filter((p) => !selectedApps.includes(p.package_name))
                            .map((p) => p.package_name)

                          await Promise.all(
                            policiesToRemove.map((pkgName) =>
                              fetch(`/api/groups/${group.id}/policies?packageName=${encodeURIComponent(pkgName)}`, {
                                method: 'DELETE'
                              })
                            )
                          )

                          // Adicionar novas políticas
                          const appsToAdd = availableApps.filter(
                            (app) => selectedApps.includes(app.packageName) && 
                            !groupPolicies.some((p) => p.package_name === app.packageName)
                          )

                          await Promise.all(
                            appsToAdd.map((app) =>
                              fetch(`/api/groups/${group.id}/policies`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  packageName: app.packageName,
                                  appName: app.appName,
                                  policyType: 'allow'
                                })
                              })
                            )
                          )

                          // Recarregar políticas
                          const policiesRes = await fetch(`/api/groups/${group.id}/policies`)
                          if (policiesRes.ok) {
                            const p = await policiesRes.json()
                            setGroupPolicies(p.data || [])
                          }

                          alert(successMessage || 'Políticas processadas')
                        } catch (error) {
                          console.error('Erro ao salvar políticas:', error)
                          alert('Erro ao salvar políticas. Verifique o console.')
                        } finally {
                          setIsSavingPolicies(false)
                        }
                      }}
                      disabled={isSavingPolicies}
                      className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingPolicies ? 'Salvando...' : `Aplicar a ${devices.length} dispositivo(s)`}
                    </button>
                  </div>

                  {/* Lista de políticas ativas */}
                  {groupPolicies.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <h4 className="text-sm font-semibold text-primary mb-3">Políticas Ativas ({groupPolicies.length})</h4>
                      <div className="flex flex-wrap gap-2">
                        {groupPolicies.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {p.app_name}
                            <button
                              onClick={async () => {
                                try {
                                  await fetch(`/api/groups/${group.id}/policies?packageName=${encodeURIComponent(p.package_name)}`, {
                                    method: 'DELETE'
                                  })
                                  setSelectedApps(selectedApps.filter((pkg) => pkg !== p.package_name))
                                  const policiesRes = await fetch(`/api/groups/${group.id}/policies`)
                                  if (policiesRes.ok) {
                                    const pol = await policiesRes.json()
                                    setGroupPolicies(pol.data || [])
                                  }
                                } catch (error) {
                                  console.error('Erro ao remover política:', error)
                                }
                              }}
                              className="ml-2 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!isLoading && activeTab === 'monitoring' && (
            <div className="space-y-6">
              {/* Visão Geral */}
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">Visão Geral do Grupo</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <span className="text-green-600 text-xl">✓</span>
                      </div>
                      <div>
                        <div className="text-xs text-secondary mb-1">Dispositivos Online</div>
                        <div className="text-xl font-bold text-primary">{stats?.online_devices ?? 0}</div>
                      </div>
                    </div>
                  </div>
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-gray-600 text-xl">○</span>
                      </div>
                      <div>
                        <div className="text-xs text-secondary mb-1">Dispositivos Offline</div>
                        <div className="text-xl font-bold text-primary">{stats?.offline_devices ?? 0}</div>
                      </div>
                    </div>
                  </div>
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 text-xl">📱</span>
                      </div>
                      <div>
                        <div className="text-xs text-secondary mb-1">Total de Dispositivos</div>
                        <div className="text-xl font-bold text-primary">{stats?.total_devices ?? 0}</div>
                      </div>
                    </div>
                  </div>
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <span className="text-yellow-600 text-xl">⚠️</span>
                      </div>
                      <div>
                        <div className="text-xs text-secondary mb-1">Bateria Baixa</div>
                        <div className="text-xl font-bold text-primary">{stats?.low_battery_count ?? 0}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monitoramento de Dispositivos */}
              <div>
                <h3 className="text-lg font-semibold text-primary mb-4">Monitoramento de Dispositivos</h3>
                {devices.length === 0 ? (
                  <div className="card p-8 text-center">
                    <div className="text-secondary">Nenhum dispositivo no grupo</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {devices.map((device, index) => {
                      const getBatteryColor = (level: number) => {
                        if (level < 20) return 'text-red-600'
                        if (level < 50) return 'text-yellow-600'
                        return 'text-green-600'
                      }

                      const getBatteryBgColor = (level: number) => {
                        if (level < 20) return 'bg-red-100'
                        if (level < 50) return 'bg-yellow-100'
                        return 'bg-green-100'
                      }

                      const getBatteryProgressColor = (level: number) => {
                        if (level < 20) return 'bg-red-500'
                        if (level < 50) return 'bg-yellow-500'
                        return 'bg-green-500'
                      }

                      const formatLastSeen = (lastSeen: number) => {
                        if (!lastSeen) return 'Nunca'
                        const diff = Date.now() - lastSeen
                        const minutes = Math.floor(diff / 60000)
                        const hours = Math.floor(minutes / 60)
                        const days = Math.floor(hours / 24)
                        
                        if (days > 0) return `${days}d atrás`
                        if (hours > 0) return `${hours}h atrás`
                        if (minutes > 0) return `${minutes}min atrás`
                        return 'Agora'
                      }

                      const formatBatteryStatus = (status: string | undefined | null) => {
                        if (!status) return 'Desconhecido'
                        const normalizedStatus = status.toLowerCase().trim()
                        
                        // Mapear status comuns para português
                        if (normalizedStatus === 'not_charging' || normalizedStatus === 'not charging') {
                          return 'Normal'
                        }
                        if (normalizedStatus === 'charging') {
                          return 'Carregando'
                        }
                        if (normalizedStatus === 'discharging') {
                          return 'Descarregando'
                        }
                        if (normalizedStatus === 'full') {
                          return 'Completa'
                        }
                        
                        // Se não reconhecer, capitalizar primeira letra
                        return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
                      }

                      return (
                        <div key={device.deviceId || `device-${index}`} className="card p-5">
                          {/* Cabeçalho do Dispositivo */}
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${
                                device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                              }`} />
                              <div>
                                <h4 className="font-semibold text-primary text-lg">
                                  {device.assignedUserName ? `${device.name} • ${device.assignedUserName}` : device.name}
                                </h4>
                                <p className="text-sm text-secondary">{device.model} • {device.manufacturer}</p>
                              </div>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                              device.status === 'online' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {device.status === 'online' ? 'Online' : 'Offline'}
                            </div>
                          </div>

                          {/* Grid de Informações */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Status */}
                            <div className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">📊</span>
                                <span className="text-xs font-medium text-secondary uppercase">Status</span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-secondary">Estado:</span>
                                  <span className={`text-xs font-semibold ${
                                    device.status === 'online' ? 'text-green-600' : 'text-gray-600'
                                  }`}>
                                    {device.status === 'online' ? 'Conectado' : 'Desconectado'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-secondary">Última conexão:</span>
                                  <span className="text-xs font-medium text-primary">
                                    {formatLastSeen(device.lastSeen)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Bateria */}
                            <div className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">🔋</span>
                                <span className="text-xs font-medium text-secondary uppercase">Bateria</span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-secondary">Nível:</span>
                                  <span className={`text-xs font-bold ${getBatteryColor(device.batteryLevel || 0)}`}>
                                    {device.batteryLevel !== undefined && device.batteryLevel !== null ? `${device.batteryLevel}%` : 'N/A'}
                                  </span>
                                </div>
                                {device.batteryLevel !== undefined && device.batteryLevel !== null && (
                                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                    <div
                                      className={`h-2 rounded-full ${getBatteryProgressColor(device.batteryLevel)}`}
                                      style={{ width: `${Math.min(Math.max(device.batteryLevel, 0), 100)}%` }}
                                    />
                                  </div>
                                )}
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-xs text-secondary">Estado:</span>
                                  <span className="text-xs font-medium text-primary">
                                    {device.isCharging ? '⚡ Carregando' : formatBatteryStatus(device.batteryStatus)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Localização */}
                            <div className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">📍</span>
                                <span className="text-xs font-medium text-secondary uppercase">Localização</span>
                              </div>
                              <div className="space-y-1">
                                {(() => {
                                  const hasAddress = device.address && device.address.trim().length > 0;
                                  const hasLatLon = device.latitude !== undefined && device.latitude !== null && 
                                                    device.longitude !== undefined && device.longitude !== null;
                                  
                                  if (hasAddress) {
                                    // Extrair rua do endereço completo (primeira parte antes da vírgula)
                                    const addressParts = device.address.split(',');
                                    const street = addressParts[0]?.trim();
                                    const rest = addressParts.slice(1).join(',').trim();
                                    return (
                                      <>
                                        <div className="text-xs font-semibold text-primary mb-1">
                                          {street}
                                        </div>
                                        {rest && (
                                          <div className="text-xs text-secondary text-opacity-80 line-clamp-2">
                                            {rest}
                                          </div>
                                        )}
                                        {device.lastLocationUpdate && (
                                          <div className="text-xs text-muted mt-1">
                                            Atualizado: {formatLastSeen(device.lastLocationUpdate)}
                                          </div>
                                        )}
                                      </>
                                    );
                                  } else if (hasLatLon) {
                                    return (
                                      <>
                                        <div className="text-xs text-secondary mt-1 font-mono">
                                          {typeof device.latitude === 'number' ? device.latitude.toFixed(4) : device.latitude}, {typeof device.longitude === 'number' ? device.longitude.toFixed(4) : device.longitude}
                                        </div>
                                        {device.lastLocationUpdate && (
                                          <div className="text-xs text-muted mt-1">
                                            Atualizado: {formatLastSeen(device.lastLocationUpdate)}
                                          </div>
                                        )}
                                      </>
                                    );
                                  } else {
                                    return (
                                      <div className="text-xs text-secondary">Localização não disponível</div>
                                    );
                                  }
                                })()}
                              </div>
                            </div>

                            {/* Rede WiFi */}
                            <div className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">📶</span>
                                <span className="text-xs font-medium text-secondary uppercase">Rede</span>
                              </div>
                              <div className="space-y-1">
                                {device.wifiSSID ? (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-secondary">WiFi:</span>
                                      <span className="text-xs font-medium text-primary truncate ml-2" title={device.wifiSSID}>
                                        {device.wifiSSID}
                                      </span>
                                    </div>
                                    {device.networkType && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-secondary">Tipo:</span>
                                        <span className="text-xs font-medium text-primary capitalize">
                                          {device.networkType}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                ) : device.isWifiEnabled ? (
                                  <div className="text-xs text-secondary">WiFi ativado mas não conectado</div>
                                ) : (
                                  <div className="text-xs text-secondary">WiFi não conectado</div>
                                )}
                                {device.ipAddress && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-secondary">IP:</span>
                                    <span className="text-xs font-mono text-primary">
                                      {device.ipAddress}
                                    </span>
                                  </div>
                                )}
                                {device.isWifiEnabled !== undefined && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-secondary">Status WiFi:</span>
                                    <span className={`text-xs font-medium ${
                                      device.isWifiEnabled ? 'text-green-600' : 'text-gray-600'
                                    }`}>
                                      {device.isWifiEnabled ? 'Ativado' : 'Desativado'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Configuração de Redes Permitidas */}
      {configModalOpen === 'networks' && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setConfigModalOpen(false)}
        >
          <div 
            className="bg-surface rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-primary">Redes WiFi Permitidas</h3>
                  <p className="text-secondary mt-1">Configure quais redes WiFi os dispositivos podem conectar</p>
                </div>
                <button
                  onClick={() => setConfigModalOpen(null)}
                  className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Adicionar nova rede */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome da rede WiFi (SSID)"
                  value={newNetworkName}
                  onChange={(e) => setNewNetworkName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && newNetworkName.trim()) {
                      setAllowedNetworks([...allowedNetworks, newNetworkName.trim()])
                      setNewNetworkName('')
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newNetworkName.trim()) {
                      setAllowedNetworks([...allowedNetworks, newNetworkName.trim()])
                      setNewNetworkName('')
                    }
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Adicionar
                </button>
              </div>

              {/* Lista de redes */}
              {allowedNetworks.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-primary">Redes configuradas:</div>
                  {allowedNetworks.map((network, idx) => (
                    <div key={idx} className="card p-3 flex items-center justify-between">
                      <span className="font-medium text-primary">{network}</span>
                      <button
                        onClick={() => {
                          setAllowedNetworks(allowedNetworks.filter((_, i) => i !== idx))
                        }}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-secondary">
                  Nenhuma rede configurada. Adicione redes permitidas acima.
                </div>
              )}

              {/* Redes dos dispositivos online (sugestões) */}
              {devices.length > 0 && (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-primary mb-2">Redes detectadas nos dispositivos:</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {Array.from(new Set(devices.map(d => d.wifiSSID).filter(Boolean))).map((ssid, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (ssid && !allowedNetworks.includes(ssid)) {
                            setAllowedNetworks([...allowedNetworks, ssid])
                          }
                        }}
                        disabled={allowedNetworks.includes(ssid || '')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          allowedNetworks.includes(ssid || '')
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer'
                        }`}
                      >
                        + {ssid}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setConfigModalOpen(null)
                  // Recarregar restrições do servidor para reverter mudanças não salvas
                  if (group?.id) {
                    fetch(`/api/groups/${group.id}/restrictions`).then(res => res.json()).then(r => {
                      if (r.success) {
                        setAllowedNetworks(r.data.allowedNetworks || [])
                      }
                    })
                  }
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNetworks}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuração de Localização Permitida */}
      {configModalOpen === 'location' && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setConfigModalOpen(null)}
        >
          <div 
            className="bg-surface rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-primary">Área Geográfica Permitida</h3>
                  <p className="text-secondary mt-1">Defina uma área geográfica permitida para os dispositivos (geofencing)</p>
                </div>
                <button
                  onClick={() => setConfigModalOpen(null)}
                  className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-lg hover:bg-border-light"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Formulário */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Latitude (centro da área)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: -23.5505"
                      value={locationLat}
                      onChange={(e) => setLocationLat(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Longitude (centro da área)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: -46.6333"
                      value={locationLon}
                      onChange={(e) => setLocationLon(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">
                      Raio em quilômetros
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      placeholder="Ex: 5"
                      value={locationRadius}
                      onChange={(e) => setLocationRadius(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <p className="text-xs text-secondary mt-1">
                      Defina o raio máximo permitido a partir do ponto central
                    </p>
                  </div>
                </div>

                {/* Mapa Visual com Leaflet */}
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Visualização do Mapa
                  </label>
                  <LocationMap
                    latitude={locationLat ? parseFloat(locationLat) : null}
                    longitude={locationLon ? parseFloat(locationLon) : null}
                    radiusKm={locationRadius ? parseFloat(locationRadius) : null}
                  />
                  <p className="text-xs text-secondary mt-2">
                    💡 O círculo azul marca o <strong>ponto exato escolhido</strong> e permanece fixo nas coordenadas, mesmo quando você move a câmera do mapa.
                  </p>
                </div>
              </div>

              {/* Sugestão: usar localização de um dispositivo */}
              {devices.length > 0 && devices.some(d => d.latitude && d.longitude) && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm font-semibold text-primary mb-2">
                    💡 Sugestão: Usar localização de um dispositivo
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {devices
                      .filter(d => d.latitude && d.longitude)
                      .slice(0, 5)
                      .map((device, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setLocationLat(device.latitude!.toString())
                            setLocationLon(device.longitude!.toString())
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white hover:bg-blue-100 transition-colors"
                        >
                          📍 {device.name} - {device.latitude?.toFixed(4)}, {device.longitude?.toFixed(4)}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {allowedLocation && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg">
                  <div className="text-sm font-semibold text-green-700 mb-1">✅ Área configurada:</div>
                  <div className="text-sm text-green-600">
                    Centro: {allowedLocation.latitude.toFixed(4)}, {allowedLocation.longitude.toFixed(4)}
                  </div>
                  <div className="text-sm text-green-600">
                    Raio: {allowedLocation.radius_km} km
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => {
                  // Limpar área permitida
                  fetch(`/api/groups/${group.id}/restrictions`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ allowedLocation: null })
                  }).then(res => {
                    if (res.ok) {
                      setAllowedLocation(null)
                      setLocationLat('')
                      setLocationLon('')
                      setLocationRadius('5')
                    }
                  })
                }}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                Remover Área
              </button>
              <button
                onClick={() => {
                  setConfigModalOpen(null)
                  // Recarregar restrições do servidor
                  if (group?.id) {
                    fetch(`/api/groups/${group.id}/restrictions`).then(res => res.json()).then(r => {
                      if (r.success) {
                        setAllowedLocation(r.data.allowedLocation || null)
                        if (r.data.allowedLocation) {
                          setLocationLat(r.data.allowedLocation.latitude?.toString() || '')
                          setLocationLon(r.data.allowedLocation.longitude?.toString() || '')
                          setLocationRadius(r.data.allowedLocation.radius_km?.toString() || '5')
                        }
                      }
                    })
                  }
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveLocation}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


