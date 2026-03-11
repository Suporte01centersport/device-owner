'use client'

import { useState, useEffect } from 'react'
import { Device } from '../types/device'
import { PRESET_APPS } from '../lib/allowed-apps-preset'
import AppIcon from './AppIcon'
import { showAlert } from '../lib/dialog'

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

  // Carregar allowedApps ao selecionar dispositivo
  useEffect(() => {
    if (filterType !== 'device' || !selectedDeviceId) return
    const device = mobileDevices.find(d => d.deviceId === selectedDeviceId)
    if (device?.allowedApps) {
      let filtered = device.allowedApps.filter(p => p !== MDM_PACKAGE)

      const wmsPackage = WMS_PACKAGE
      if (!filtered.includes(wmsPackage)) {
        filtered = [wmsPackage, ...filtered]
      }

      setSelectedApps(new Set(filtered))
      const presetPkgs = new Set(PRESET_APPS.map(a => a.packageName))
      const extras = filtered.filter(p => !presetPkgs.has(p))
      setCustomApps(extras.map(p => ({ packageName: p, appName: p.split('.').pop() || p })))
    } else {
      setSelectedApps(new Set([WMS_PACKAGE]))
      setCustomApps([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      showAlert('MDM Center não pode ser adicionado (é o launcher)')
      return
    }
    if (PRESET_APPS.some(a => a.packageName === pkg) || customApps.some(a => a.packageName === pkg)) {
      showAlert('App já está na lista')
      return
    }
    setCustomApps(prev => [...prev, { packageName: pkg, appName: pkg.split('.').pop() || pkg }])
    setSelectedApps(prev => new Set(Array.from(prev).concat(pkg)))
    setCustomAppInput('')
  }

  const handleSave = async () => {
    let packageList = Array.from(selectedApps).filter(p => p !== MDM_PACKAGE)

    const wmsPackage = WMS_PACKAGE
    if (!packageList.includes(wmsPackage)) {
      packageList = [wmsPackage, ...packageList]
    }

    if (filterType === 'device') {
      if (!selectedDeviceId) {
        showAlert('Selecione um celular')
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
          const toInstall = packageList.filter(pkg => pkg !== MDM_PACKAGE && !installedPackages.has(pkg))
          for (const pkg of toInstall) {
            sendMessage({ type: 'install_app', deviceId: selectedDeviceId, packageName: pkg, timestamp: Date.now() })
          }
          const installMsg = toInstall.length > 0 ? ` Instalando ${toInstall.length} app(s) ausente(s)...` : ''
          showAlert(`Permissões salvas! O celular será atualizado em breve.${installMsg}`)
        } else {
          showAlert('Não foi possível enviar. Verifique se o dispositivo está conectado.')
        }
      } catch (e) {
        showAlert('Erro ao salvar: ' + (e instanceof Error ? e.message : 'Erro desconhecido'))
      } finally {
        setIsSaving(false)
      }
    } else {
      if (!selectedGroupId) {
        showAlert('Selecione um grupo')
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
        showAlert('Políticas salvas e aplicadas ao grupo!')
      } catch (e) {
        showAlert('Erro ao salvar: ' + (e instanceof Error ? e.message : 'Erro desconhecido'))
      } finally {
        setIsSaving(false)
      }
    }
  }

  const hasSelection = filterType === 'device' ? !!selectedDeviceId : !!selectedGroupId
  const canShowApps = hasSelection

  const allApps = [
    ...PRESET_APPS,
    ...customApps.map(a => ({ packageName: a.packageName, appName: a.appName, emoji: '📱' as const }))
  ]

  return (
    <div className="p-6">
      <div className="mb-6 bg-primary rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">Apps liberados Celular</h1>
        <p className="text-white/90 mt-1">Libere apps por celular ou por grupo. Ative os apps que deseja exibir no dispositivo.</p>
      </div>

      {/* Card de seleção */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm p-6 mb-6">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">Escolha o celular ou grupo</h3>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Liberar por:</span>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
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
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-white/10 text-[var(--text-primary)] hover:bg-white/20'
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
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-white/10 text-[var(--text-primary)] hover:bg-white/20'
                }`}
              >
                Grupo
              </button>
            </div>
          </div>

          {filterType === 'device' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">Celular:</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text-primary)] font-medium text-sm focus:border-[var(--primary)] focus:outline-none transition-colors appearance-none cursor-pointer min-w-[200px]"
              >
                <option value="" disabled>Selecione o celular</option>
                {mobileDevices.length === 0 ? (
                  <option value="" disabled>Nenhum celular conectado</option>
                ) : (
                  mobileDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name || d.model || d.deviceId} {d.status === 'online' ? '🟢' : '🔴'}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {filterType === 'group' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">Grupo:</label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text-primary)] font-medium text-sm focus:border-[var(--primary)] focus:outline-none transition-colors appearance-none cursor-pointer min-w-[200px]"
              >
                <option value="">Selecione um grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Grid de apps com toggles */}
      {canShowApps ? (
        <div className="space-y-6">
          {/* Adicionar app customizado */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customAppInput}
              onChange={(e) => setCustomAppInput(e.target.value)}
              placeholder="Package name (ex: com.exemplo.app)"
              className="flex-1 max-w-md px-4 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--primary)] focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomApp()}
            />
            <button
              type="button"
              onClick={handleAddCustomApp}
              disabled={!customAppInput.trim()}
              className="px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] font-medium rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              + Adicionar app
            </button>
          </div>

          {/* Grid no estilo dos toggles de restrições */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allApps.map((app) => {
              const mandatory = isMandatory(app.packageName)
              const checked = mandatory || selectedApps.has(app.packageName)
              const notInstalled = !mandatory && filterType === 'device' && selectedDeviceId && installedPackages.size > 0 && !installedPackages.has(app.packageName)

              return (
                <label
                  key={app.packageName}
                  className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                    mandatory
                      ? 'border-amber-500/40 bg-[var(--surface)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <AppIcon
                      packageName={app.packageName}
                      emoji={app.emoji}
                      size={36}
                      className="flex-shrink-0 rounded-lg"
                      iconUrl={(app as any).iconUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">{app.appName}</span>
                        {mandatory && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white leading-none flex-shrink-0">
                            Obrigatório
                          </span>
                        )}
                        {notInstalled && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/80 text-white leading-none flex-shrink-0">
                            Instalar
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate font-mono">
                        {app.packageName.split('.').pop()}
                      </div>
                    </div>
                  </div>
                  <div className="relative flex-shrink-0 ml-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={mandatory}
                      onChange={() => handleToggleApp(app.packageName)}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${
                      mandatory
                        ? 'bg-amber-500'
                        : 'bg-white/20 peer-checked:bg-[var(--primary)]'
                    }`}></div>
                    <div className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      checked ? 'translate-x-5' : ''
                    }`}></div>
                  </div>
                </label>
              )
            })}
          </div>

          {/* Botão salvar */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-[var(--primary)] text-black font-semibold rounded-lg hover:opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                  Salvando...
                </>
              ) : (
                'Salvar e Aplicar'
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-[var(--surface)] rounded-xl border border-[var(--border)]">
          <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📱</span>
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            {filterType === 'device' && mobileDevices.length === 0
              ? 'Nenhum celular conectado'
              : 'Selecione um celular ou grupo acima'}
          </h3>
          <p className="text-[var(--text-muted)]">
            {filterType === 'device' && mobileDevices.length === 0
              ? 'Conecte dispositivos móveis para configurar os apps liberados'
              : 'Use o seletor acima para escolher o celular ou grupo e configurar os apps'}
          </p>
        </div>
      )}
    </div>
  )
}
