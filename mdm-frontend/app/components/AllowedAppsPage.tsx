'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import { PRESET_APPS } from '../lib/allowed-apps-preset'
import AppIcon from './AppIcon'

const MDM_PACKAGE = 'com.mdm.launcher'

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
          const packages = (data.data || []).map((p: any) => p.package_name).filter((p: string) => p !== MDM_PACKAGE)
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
      const filtered = device.allowedApps.filter(p => p !== MDM_PACKAGE)
      setSelectedApps(new Set(filtered))
      const presetPkgs = new Set(PRESET_APPS.map(a => a.packageName))
      const extras = filtered.filter(p => !presetPkgs.has(p))
      setCustomApps(extras.map(p => ({ packageName: p, appName: p.split('.').pop() || p })))
    } else {
      setSelectedApps(new Set())
      setCustomApps([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só carregar quando seleção muda, não quando devices atualiza (evita sobrescrever checkboxes)
  }, [filterType, selectedDeviceId])

  const handleToggleApp = (packageName: string) => {
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
    const packageList = Array.from(selectedApps).filter(p => p !== MDM_PACKAGE)
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
          alert('Permissões salvas! O celular será atualizado em breve.')
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
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="input w-auto min-w-[220px] px-3 py-2 border border-white/30 rounded-lg bg-background text-white"
              >
                <option value="">Selecione um celular</option>
                {mobileDevices.length === 0 ? (
                  <option value="" disabled>Nenhum celular conectado</option>
                ) : (
                  mobileDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name || d.model || d.deviceId} {d.status === 'online' ? '(online)' : '(offline)'}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {filterType === 'group' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-white whitespace-nowrap">Grupo:</label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="input w-auto min-w-[220px] px-3 py-2 border border-white/30 rounded-lg bg-background text-white"
              >
                <option value="">Selecione um grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
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
            {[...PRESET_APPS, ...customApps.map(a => ({ packageName: a.packageName, appName: a.appName, emoji: '📱' as const }))].filter(app => app.packageName !== MDM_PACKAGE).map((app) => {
              const checked = selectedApps.has(app.packageName)
              return (
                <label
                  key={app.packageName}
                  onClick={() => handleToggleApp(app.packageName)}
                  onKeyDown={(e) => e.key === 'Enter' && handleToggleApp(app.packageName)}
                  role="button"
                  tabIndex={0}
                  className={`group flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md select-none ${
                    checked
                      ? 'border-primary bg-background ring-2 ring-primary/40 shadow-primary/10'
                      : 'border-white/20 bg-background hover:border-white/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleApp(app.packageName)}
                    className="w-5 h-5 text-primary border-white/30 rounded-md focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background shrink-0"
                  />
                  <AppIcon
                    packageName={app.packageName}
                    emoji={app.emoji}
                    size={48}
                    className="ring-1 ring-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate">{app.appName}</div>
                    <div className="text-xs text-white/70 truncate mt-0.5 font-mono">{app.packageName}</div>
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
