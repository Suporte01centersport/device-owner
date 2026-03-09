'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import { PRESET_APPS } from '../lib/allowed-apps-preset'
import AppIcon from './AppIcon'

const MDM_PACKAGE = 'com.mdm.launcher'
const WMS_PACKAGE = 'com.centersporti.wmsmobile'

interface DeviceGroup {
  id: string
  name: string
  appPolicies?: { package_name: string }[]
}

interface AllowedAppsPageProps {
  devices: Device[]
  sendMessage: (msg: any) => boolean | Promise<boolean>
}

export default function AllowedAppsPage({ devices, sendMessage }: AllowedAppsPageProps) {
  const [filterType, setFilterType] = useState<'device' | 'group'>('device')
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [groups, setGroups] = useState<DeviceGroup[]>([])
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set())
  const [customAppInput, setCustomAppInput] = useState('')
  const [customApps, setCustomApps] = useState<Array<{ packageName: string; appName: string }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const mobileDevices = devices.filter(
    d => (d.deviceType === 'mobile' || d.deviceType !== 'computer') &&
         d.osType !== 'Windows' && d.osType !== 'Linux' && d.osType !== 'macOS'
  )

  // Set de packages instalados no dispositivo selecionado
  const selectedDevice = filterType === 'device' ? mobileDevices.find(d => d.deviceId === selectedDeviceId) : null
  const installedPackages = new Set((selectedDevice?.installedApps || []).map(a => a.packageName))

  // Carregar grupos
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const res = await fetch('/api/groups')
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            setGroups(data.data)
          }
        }
      } catch (e) {
        console.error('Erro ao carregar grupos:', e)
      } finally {
        setLoading(false)
      }
    }
    loadGroups()
  }, [])

  // Carregar políticas ao selecionar grupo
  useEffect(() => {
    if (filterType !== 'group' || !selectedGroupId) return
    const loadPolicies = async () => {
      try {
        const res = await fetch(`/api/groups/${selectedGroupId}/policies`)
        if (res.ok) {
          const data = await res.json()
          let packages = (data.data || []).map((p: any) => p.package_name).filter((p: string) => p !== MDM_PACKAGE)
          
          // Garantir que WMS sempre está incluído
          const wmsPackage = WMS_PACKAGE
          if (!packages.includes(wmsPackage)) {
            packages = [wmsPackage, ...packages]
          }
          
          setSelectedApps(new Set(packages))
          const presetPkgs = new Set(PRESET_APPS.map(a => a.packageName))
          const extras = packages.filter((p: string) => !presetPkgs.has(p))
          setCustomApps(extras.map((p: string) => ({ packageName: p, appName: p.split('.').pop() || p })))
        }
      } catch (e) {
        console.error('Erro ao carregar políticas:', e)
      }
    }
    loadPolicies()
  }, [filterType, selectedGroupId])

  // Carregar allowedApps ao selecionar dispositivo (apenas quando a seleção muda, não quando devices atualiza)
  useEffect(() => {
    if (filterType !== 'device' || !selectedDeviceId) return
    const device = mobileDevices.find(d => d.deviceId === selectedDeviceId)
    if (device?.allowedApps) {
      let filtered = device.allowedApps.filter(p => p !== MDM_PACKAGE)
      
      // Garantir que WMS sempre está incluído
      const wmsPackage = WMS_PACKAGE
      if (!filtered.includes(wmsPackage)) {
        filtered = [wmsPackage, ...filtered]
      }
      
      setSelectedApps(new Set(filtered))
      const presetPkgs = new Set(PRESET_APPS.map(a => a.packageName))
      const extras = filtered.filter(p => !presetPkgs.has(p))
      setCustomApps(extras.map(p => ({ packageName: p, appName: p.split('.').pop() || p })))
    } else {
      // Se não tiver allowedApps, começar com WMS obrigatório
      setSelectedApps(new Set([WMS_PACKAGE]))
      setCustomApps([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só carregar quando seleção muda, não quando devices atualiza (evita sobrescrever checkboxes)
  }, [filterType, selectedDeviceId])

  const isMandatory = (packageName: string) =>
    PRESET_APPS.find(a => a.packageName === packageName)?.mandatory === true

  const handleToggleApp = (packageName: string) => {
    if (isMandatory(packageName)) return
    setSelectedApps(prev => {
      const next = new Set(prev)
      if (next.has(packageName)) {
        next.delete(packageName)
      } else {
        next.add(packageName)
      }
      return next
    })
  }

  const handleAddCustomApp = () => {
    const pkg = customAppInput.trim()
    if (!pkg) return
    if (pkg === MDM_PACKAGE) {
      alert('MDM Center não pode ser adicionado (é o launcher)')
      return
    }
    if (PRESET_APPS.some(a => a.packageName === pkg) || customApps.some(a => a.packageName === pkg)) {
      alert('App já está na lista')
      return
    }
    setCustomApps(prev => [...prev, { packageName: pkg, appName: pkg.split('.').pop() || pkg }])
    setSelectedApps(prev => new Set(Array.from(prev).concat(pkg)))
    setCustomAppInput('')
  }

  const handleSave = async () => {
    let packageList = Array.from(selectedApps).filter(p => p !== MDM_PACKAGE)
    
    // Garantir que WMS sempre está incluído (é obrigatório)
    const wmsPackage = WMS_PACKAGE
    if (!packageList.includes(wmsPackage)) {
      packageList = [wmsPackage, ...packageList]
    }
    
    if (filterType === 'device') {
      if (!selectedDeviceId) {
        alert('Selecione um celular')
        return
      }
      setIsSaving(true)
      try {
        const result = sendMessage({
          type: 'update_app_permissions',
          deviceId: selectedDeviceId,
          allowedApps: packageList,
          individualApps: packageList,
          isIndividual: true,
          timestamp: Date.now()
        })
        const sent = await Promise.resolve(result)
        if (sent) {
          // Instalar apps selecionados que não estão no celular
          const toInstall = packageList.filter(pkg => pkg !== MDM_PACKAGE && !installedPackages.has(pkg))
          for (const pkg of toInstall) {
            sendMessage({ type: 'install_app', deviceId: selectedDeviceId, packageName: pkg, timestamp: Date.now() })
          }
          const installMsg = toInstall.length > 0 ? ` Instalando ${toInstall.length} app(s) ausente(s)...` : ''
          alert(`Permissões salvas! O celular será atualizado em breve.${installMsg}`)
        } else {
          alert('Não foi possível enviar. Verifique se o dispositivo está conectado.')
        }
      } catch (e) {
        alert('Erro ao salvar: ' + (e instanceof Error ? e.message : 'Erro desconhecido'))
      } finally {
        setIsSaving(false)
      }
    } else {
      if (!selectedGroupId) {
        alert('Selecione um grupo')
        return
      }
      setIsSaving(true)
      try {
        const apps = packageList.map(pkg => {
          const preset = PRESET_APPS.find(a => a.packageName === pkg)
          return { packageName: pkg, appName: preset?.appName || pkg }
        })
        const putRes = await fetch(`/api/groups/${selectedGroupId}/policies`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apps })
        })
        if (!putRes.ok) {
          const err = await putRes.json()
          throw new Error(err.detail || 'Erro ao salvar políticas')
        }
        const applyRes = await fetch(`/api/groups/${selectedGroupId}/apply-policies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowedApps: packageList })
        })
        if (!applyRes.ok) {
          const err = await applyRes.json()
          throw new Error(err.detail || 'Erro ao aplicar políticas nos dispositivos')
        }
        alert('Políticas salvas e aplicadas ao grupo!')
      } catch (e) {
        alert('Erro ao salvar: ' + (e instanceof Error ? e.message : 'Erro desconhecido'))
      } finally {
        setIsSaving(false)
      }
    }
  }

  const hasSelection = filterType === 'device' ? !!selectedDeviceId : !!selectedGroupId
  const canShowApps = hasSelection

  return (
    <div className="p-6">
      <div className="mb-6 bg-primary rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">Apps liberados Celular</h1>
        <p className="text-white/90 mt-1">Libere apps por celular ou por grupo. Marque os apps que deseja exibir.</p>
      </div>

      {/* Card de seleção - sempre visível */}
      <div className="bg-background rounded-xl border border-white/20 shadow-sm p-6 mb-6">
        <h3 className="text-base font-semibold text-white mb-4">Escolha o celular ou grupo</h3>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">Liberar por:</span>
            <div className="flex rounded-lg border border-white/30 overflow-hidden">
              <button
                type="button"
              onClick={() => {
                setFilterType('device')
                setSelectedDeviceId('')
                setSelectedGroupId('')
                setCustomApps([])
              }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filterType === 'device'
                    ? 'bg-primary text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Celular
              </button>
              <button
                type="button"
              onClick={() => {
                setFilterType('group')
                setSelectedDeviceId('')
                setSelectedGroupId('')
                setCustomApps([])
              }}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filterType === 'group'
                    ? 'bg-primary text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Grupo
              </button>
            </div>
          </div>

          {filterType === 'device' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-white whitespace-nowrap">Celular:</label>
              <div className="relative flex-1 max-w-md">
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-white/40 rounded-lg bg-background text-white font-medium text-base hover:border-white/60 focus:border-primary focus:outline-none transition-colors [&_option]:text-white [&_option]:bg-background appearance-none cursor-pointer select-none"
                >
                  {/* Opção placeholder só para evitar valor inválido */}
                  <option
                    value=""
                    disabled
                    className="text-white/60 bg-background"
                  >
                    Selecione o celular
                  </option>
                  {mobileDevices.length === 0 ? (
                    <option value="" disabled className="text-white/60 bg-background">Nenhum celular conectado</option>
                  ) : (
                    mobileDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="text-white bg-background font-medium">
                        {d.name || d.model || d.deviceId} {d.status === 'online' ? '🟢' : '🔴'}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          )}

          {filterType === 'group' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-white whitespace-nowrap">Grupo:</label>
              <div className="relative flex-1 max-w-md">
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-white/40 rounded-lg bg-background text-white font-medium text-base hover:border-white/60 focus:border-primary focus:outline-none transition-colors [&_option]:text-white [&_option]:bg-background appearance-none cursor-pointer"
                >
                  <option value="" className="text-white/60 bg-background">Selecione um grupo</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} className="text-white bg-background font-medium">
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid de apps com checkboxes */}
      {canShowApps ? (
        <div className="space-y-4">
          <p className="text-sm text-white">
            Marque os apps que deseja liberar. Desmarque para não exibir.
          </p>
          {/* Adicionar app customizado */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={customAppInput}
              onChange={(e) => setCustomAppInput(e.target.value)}
              placeholder="Package name (ex: com.exemplo.app)"
              className="input flex-1 max-w-md px-3 py-2 border border-white/30 rounded-lg bg-background text-white placeholder:text-white/60"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomApp()}
            />
            <button
              type="button"
              onClick={handleAddCustomApp}
              disabled={!customAppInput.trim()}
              className="btn btn-secondary"
            >
              + Adicionar app
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...PRESET_APPS, ...customApps.map(a => ({ packageName: a.packageName, appName: a.appName, emoji: '📱' as const }))].map((app) => {
              const mandatory = isMandatory(app.packageName)
              const checked = mandatory || selectedApps.has(app.packageName)
              const notInstalled = !mandatory && filterType === 'device' && selectedDeviceId && installedPackages.size > 0 && !installedPackages.has(app.packageName)
              return (
                <label
                  key={app.packageName}
                  onClick={() => handleToggleApp(app.packageName)}
                  onKeyDown={(e) => !mandatory && e.key === 'Enter' && handleToggleApp(app.packageName)}
                  role="button"
                  tabIndex={0}
                  className={`group relative flex flex-col gap-2 p-4 rounded-2xl border-2 transition-all duration-200 shadow-sm select-none ${
                    mandatory
                      ? 'border-amber-500/60 bg-background ring-2 ring-amber-500/30 cursor-not-allowed'
                      : checked
                        ? 'border-primary bg-background ring-2 ring-primary/40 shadow-primary/10 cursor-pointer hover:shadow-md'
                        : 'border-white/20 bg-background hover:border-white/40 cursor-pointer hover:shadow-md'
                  }`}
                >
                  {mandatory && (
                    <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white leading-none">
                      Obrigatório
                    </span>
                  )}
                  {notInstalled && (
                    <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/80 text-white leading-none">
                      Instalar
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={mandatory}
                      onChange={() => handleToggleApp(app.packageName)}
                      className="w-5 h-5 text-primary border-white/30 rounded-md focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
                    />
                    <AppIcon
                      packageName={app.packageName}
                      emoji={app.emoji}
                      size={40}
                      className="ring-1 ring-white/10"
                      iconUrl={(app as any).iconUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white truncate text-sm">{app.appName}</div>
                      <div className="text-[10px] text-white/50 truncate font-mono">{app.packageName.split('.').pop()}</div>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="btn btn-primary"
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-background rounded-xl border border-white/20">
          <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📱</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {filterType === 'device' && mobileDevices.length === 0
              ? 'Nenhum celular conectado'
              : 'Selecione um celular ou grupo acima'}
          </h3>
          <p className="text-white/80">
            {filterType === 'device' && mobileDevices.length === 0
              ? 'Conecte dispositivos móveis para configurar os apps liberados'
              : 'Use o seletor acima para escolher o celular ou grupo e configurar os apps'}
          </p>
        </div>
      )}
    </div>
  )
}
