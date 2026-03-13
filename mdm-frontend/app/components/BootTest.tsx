'use client'

import { useState, useCallback } from 'react'

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'warn' | 'running' | 'pending'
  message?: string
  duration?: number
}

export default function BootTest() {
  const [isRunning, setIsRunning] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [tests, setTests] = useState<TestResult[]>([])
  const [progress, setProgress] = useState(0)

  const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const backendUrl = `http://${wsHost}:3001`

  const runTest = async (name: string, fn: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>): Promise<TestResult> => {
    const start = Date.now()
    try {
      const result = await fn()
      return { name, ...result, duration: Date.now() - start }
    } catch (err: any) {
      return { name, status: 'fail', message: err.message || String(err), duration: Date.now() - start }
    }
  }

  const runAllTests = useCallback(async () => {
    setIsRunning(true)
    setShowResults(true)
    setProgress(0)

    const token = localStorage.getItem('mdm_auth_token')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    // Fetch devices first for device-specific tests
    let devices: any[] = []
    try {
      const r = await fetch(`${backendUrl}/api/devices/realtime`, { headers, signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        const d = await r.json()
        devices = Array.isArray(d) ? d : (d.devices || [])
      }
    } catch (_) {}

    const onlineDevices = devices.filter((d: any) => d.status === 'online' || d.isOnline)
    const offlineDevices = devices.filter((d: any) => d.status !== 'online' && !d.isOnline)

    const testDefs: { name: string; fn: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }> }[] = [
      // === SERVIDOR ===
      {
        name: '[Servidor] Backend online',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/apk-checksum`, { signal: AbortSignal.timeout(5000) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return { status: 'pass', message: 'Backend rodando na porta 3001' }
        }
      },
      {
        name: '[Servidor] Autenticação JWT',
        fn: async () => {
          if (!token) return { status: 'fail', message: 'Sem token no localStorage — faça login' }
          const r = await fetch(`${backendUrl}/api/auth/me`, { headers, signal: AbortSignal.timeout(5000) })
          const d = await r.json()
          if (!d.success) return { status: 'fail', message: d.error || 'Token inválido' }
          return { status: 'pass', message: `Logado como: ${d.user?.username || d.user?.name}` }
        }
      },
      {
        name: '[Servidor] Banco de dados',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/devices/realtime`, { headers, signal: AbortSignal.timeout(5000) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return { status: 'pass', message: `${devices.length} dispositivo(s) cadastrado(s)` }
        }
      },
      {
        name: '[Servidor] WebSocket URL',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/websocket-url`, { signal: AbortSignal.timeout(5000) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const d = await r.json()
          return { status: 'pass', message: `${d.url || d.wsUrl || 'configurado'}` }
        }
      },
      {
        name: '[Servidor] QR Code MDM',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/apk-qr-image`, { signal: AbortSignal.timeout(10000) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const blob = await r.blob()
          return { status: 'pass', message: `PNG gerado (${Math.round(blob.size / 1024)}KB)` }
        }
      },
      {
        name: '[Servidor] QR Code Formatar',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/wipe-qr-image`, { signal: AbortSignal.timeout(10000) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const blob = await r.blob()
          return { status: 'pass', message: `PNG gerado (${Math.round(blob.size / 1024)}KB)` }
        }
      },
      {
        name: '[Servidor] APK disponível',
        fn: async () => {
          const controller = new AbortController()
          const r = await fetch(`${backendUrl}/apk/mdm.apk`, { signal: controller.signal })
          const size = r.headers.get('content-length')
          controller.abort()
          if (!r.ok) return { status: 'fail', message: `HTTP ${r.status} — APK não encontrado no servidor` }
          return { status: 'pass', message: `${size ? `${(parseInt(size) / 1024 / 1024).toFixed(1)}MB` : 'disponível'}` }
        }
      },
      {
        name: '[Servidor] Backup',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/backup`, {
            method: 'POST', headers,
            body: JSON.stringify({ test: true }),
            signal: AbortSignal.timeout(10000)
          })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const d = await r.json()
          if (!d.success) throw new Error(d.error)
          return { status: 'pass', message: d.filename || 'backup gerado' }
        }
      },
      {
        name: '[Servidor] Wallpaper config',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/config/wallpaper`, { signal: AbortSignal.timeout(5000) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const d = await r.json()
          return { status: 'pass', message: d.url ? `Definido: ${d.url.substring(0, 40)}...` : 'Nenhum definido' }
        }
      },

      // === DISPOSITIVOS ===
      {
        name: '[Dispositivos] Total cadastrados',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Nenhum dispositivo cadastrado' }
          return { status: 'pass', message: `${devices.length} dispositivo(s)` }
        }
      },
      {
        name: '[Dispositivos] Online vs Offline',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          if (onlineDevices.length === 0) return { status: 'warn', message: `0 online, ${offlineDevices.length} offline — todos desconectados` }
          return { status: 'pass', message: `${onlineDevices.length} online, ${offlineDevices.length} offline` }
        }
      },
      {
        name: '[Dispositivos] Bateria',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const issues: string[] = []
          devices.forEach((d: any) => {
            const bat = d.batteryLevel ?? d.battery
            if (bat !== null && bat !== undefined && bat < 15) {
              issues.push(`${d.name || d.model}: ${bat}%`)
            }
          })
          if (issues.length > 0) return { status: 'warn', message: `Bateria baixa: ${issues.join(', ')}` }
          const batLevels = devices.map((d: any) => d.batteryLevel ?? d.battery).filter((b: any) => b != null)
          if (batLevels.length === 0) return { status: 'warn', message: 'Sem dados de bateria' }
          return { status: 'pass', message: `Todos OK (min: ${Math.min(...batLevels)}%, max: ${Math.max(...batLevels)}%)` }
        }
      },
      {
        name: '[Dispositivos] Armazenamento',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const issues: string[] = []
          devices.forEach((d: any) => {
            const free = d.freeStorage ?? d.storageAvailable
            const total = d.totalStorage ?? d.storageTotal
            if (free != null && total != null && total > 0) {
              const pctFree = (free / total) * 100
              if (pctFree < 10) {
                issues.push(`${d.name || d.model}: ${pctFree.toFixed(0)}% livre`)
              }
            }
          })
          if (issues.length > 0) return { status: 'warn', message: `Pouco espaço: ${issues.join(', ')}` }
          return { status: 'pass', message: 'Armazenamento OK em todos' }
        }
      },
      {
        name: '[Dispositivos] GPS/Localização',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const withGps = devices.filter((d: any) => d.latitude && d.longitude)
          const withoutGps = devices.filter((d: any) => !d.latitude || !d.longitude)
          if (withGps.length === 0) return { status: 'warn', message: 'Nenhum dispositivo com localização registrada' }
          if (withoutGps.length > 0) {
            const names = withoutGps.map((d: any) => d.name || d.model).join(', ')
            return { status: 'warn', message: `${withGps.length} com GPS, ${withoutGps.length} sem: ${names}` }
          }
          return { status: 'pass', message: `Todos ${withGps.length} com localização` }
        }
      },
      {
        name: '[Dispositivos] Última comunicação',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const now = Date.now()
          const stale: string[] = []
          devices.forEach((d: any) => {
            const last = d.lastSeen || d.lastUpdate || d.updatedAt
            if (last) {
              const diff = now - new Date(last).getTime()
              const hours = diff / (1000 * 60 * 60)
              if (hours > 24) {
                stale.push(`${d.name || d.model}: ${Math.floor(hours)}h atrás`)
              }
            }
          })
          if (stale.length > 0) return { status: 'warn', message: `Sem comunicação há 24h+: ${stale.join(', ')}` }
          return { status: 'pass', message: 'Todos comunicaram nas últimas 24h' }
        }
      },
      {
        name: '[Dispositivos] Versão Android',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const versions = new Map<string, number>()
          devices.forEach((d: any) => {
            const v = d.androidVersion || d.osVersion || 'desconhecido'
            versions.set(v, (versions.get(v) || 0) + 1)
          })
          const summary = Array.from(versions.entries()).map(([v, c]) => `Android ${v} (${c})`).join(', ')
          return { status: 'pass', message: summary }
        }
      },
      {
        name: '[Dispositivos] MDM como Device Owner',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const notOwner = devices.filter((d: any) => d.isDeviceOwner === false)
          if (notOwner.length > 0) {
            const names = notOwner.map((d: any) => d.name || d.model).join(', ')
            return { status: 'fail', message: `SEM Device Owner: ${names}` }
          }
          return { status: 'pass', message: 'Todos configurados como Device Owner' }
        }
      },
      {
        name: '[Dispositivos] Apps instalados',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const noApps = devices.filter((d: any) => !d.installedApps || d.installedApps.length === 0)
          if (noApps.length === devices.length) return { status: 'warn', message: 'Sem dados de apps instalados' }
          const withApps = devices.filter((d: any) => d.installedApps && d.installedApps.length > 0)
          const avgApps = Math.round(withApps.reduce((s: number, d: any) => s + d.installedApps.length, 0) / withApps.length)
          return { status: 'pass', message: `${withApps.length} device(s) com dados, média ${avgApps} apps` }
        }
      },
      {
        name: '[Dispositivos] NF cadastrada',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const withNf = devices.filter((d: any) => d.nfKey || d.nf_key)
          const withDate = devices.filter((d: any) => d.purchaseDate || d.purchase_date)
          if (withNf.length === 0 && withDate.length === 0) return { status: 'warn', message: 'Nenhum dispositivo com NF cadastrada' }
          return { status: 'pass', message: `${withNf.length} com NF, ${withDate.length} com data de compra` }
        }
      },

      // === HISTÓRICO ===
      {
        name: '[Histórico] Localização',
        fn: async () => {
          if (devices.length === 0) return { status: 'warn', message: 'Sem dispositivos' }
          const deviceId = devices[0]?.deviceId || devices[0]?.device_id
          if (!deviceId) return { status: 'warn', message: 'Sem ID de dispositivo' }
          const r = await fetch(`${backendUrl}/api/devices/location-history?deviceId=${encodeURIComponent(deviceId)}&limit=5`, {
            headers, signal: AbortSignal.timeout(5000)
          })
          if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`)
          if (r.status === 404) return { status: 'warn', message: 'Endpoint de histórico não encontrado' }
          const d = await r.json()
          const count = Array.isArray(d) ? d.length : (d.locations?.length || d.history?.length || 0)
          if (count === 0) return { status: 'warn', message: `Sem histórico para ${devices[0].name || devices[0].model}` }
          return { status: 'pass', message: `${count}+ registros para ${devices[0].name || devices[0].model}` }
        }
      },
      {
        name: '[Logs] Auditoria',
        fn: async () => {
          const r = await fetch(`${backendUrl}/api/audit-logs`, { headers, signal: AbortSignal.timeout(5000) })
          if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`)
          return { status: 'pass', message: `HTTP ${r.status}` }
        }
      },
    ]

    const initialTests: TestResult[] = testDefs.map(t => ({ name: t.name, status: 'pending' as const }))
    setTests(initialTests)

    for (let i = 0; i < testDefs.length; i++) {
      setTests(prev => prev.map((t, idx) => idx === i ? { ...t, status: 'running' } : t))
      setProgress(Math.round(((i) / testDefs.length) * 100))
      const result = await runTest(testDefs[i].name, testDefs[i].fn)
      setTests(prev => prev.map((t, idx) => idx === i ? result : t))
    }

    setProgress(100)
    setIsRunning(false)
  }, [backendUrl])

  const passCount = tests.filter(t => t.status === 'pass').length
  const failCount = tests.filter(t => t.status === 'fail').length
  const warnCount = tests.filter(t => t.status === 'warn').length
  const totalCount = tests.length

  return (
    <div className="relative">
      <button
        onClick={isRunning ? undefined : runAllTests}
        disabled={isRunning}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium border ${
          isRunning
            ? 'bg-yellow-600/20 border-yellow-500/30 text-yellow-400 cursor-wait'
            : 'bg-blue-600/20 border-blue-500/30 text-blue-400 hover:bg-blue-600/30'
        }`}
        title="Testar servidor e dispositivos"
      >
        {isRunning ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Testando... {progress}%
          </>
        ) : (
          <>
            <span>🧪</span>
            Boot de Teste
          </>
        )}
      </button>

      {showResults && tests.length > 0 && (
        <div className="absolute top-full right-0 mt-2 w-[520px] max-h-[75vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-2xl z-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white flex items-center gap-2">
                <span>🧪</span> Boot de Teste
              </h3>
              <div className="flex items-center gap-3">
                {!isRunning && (
                  <span className="text-xs">
                    <span className="text-green-400 font-bold">{passCount}✓</span>
                    {warnCount > 0 && <span className="text-yellow-400 font-bold ml-1">{warnCount}⚠</span>}
                    {failCount > 0 && <span className="text-red-400 font-bold ml-1">{failCount}✗</span>}
                    <span className="text-[var(--text-muted)] ml-1">/ {totalCount}</span>
                  </span>
                )}
                <button onClick={() => setShowResults(false)} className="text-[var(--text-muted)] hover:text-white text-lg">✕</button>
              </div>
            </div>

            {isRunning && (
              <div className="w-full h-1.5 bg-[var(--background)] rounded-full mb-3 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            )}

            {!isRunning && totalCount > 0 && (
              <div className={`px-3 py-2 rounded-lg mb-3 text-sm font-medium ${
                failCount === 0 && warnCount === 0
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : failCount > 0
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                  : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
              }`}>
                {failCount === 0 && warnCount === 0
                  ? `Tudo OK! ${totalCount} testes passaram`
                  : failCount > 0
                  ? `${failCount} erro(s), ${warnCount} aviso(s) de ${totalCount} testes`
                  : `${warnCount} aviso(s) de ${totalCount} testes — sem erros críticos`
                }
              </div>
            )}

            <div className="space-y-1">
              {tests.map((test, i) => (
                <div key={i} className={`px-3 py-1.5 rounded text-xs flex items-start gap-2 ${
                  test.status === 'fail' ? 'bg-red-500/10' :
                  test.status === 'warn' ? 'bg-yellow-500/10' :
                  test.status === 'pass' ? 'bg-green-500/5' :
                  test.status === 'running' ? 'bg-blue-500/10' :
                  'bg-[var(--background)]/30'
                }`}>
                  <span className="flex-shrink-0 mt-0.5">
                    {test.status === 'pass' ? '✅' :
                     test.status === 'fail' ? '❌' :
                     test.status === 'warn' ? '⚠️' :
                     test.status === 'running' ? '⏳' : '⬜'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${
                        test.status === 'fail' ? 'text-red-400' :
                        test.status === 'warn' ? 'text-yellow-400' :
                        test.status === 'pass' ? 'text-green-400' :
                        test.status === 'running' ? 'text-blue-400' :
                        'text-[var(--text-muted)]'
                      }`}>
                        {test.name}
                      </span>
                      {test.duration !== undefined && (
                        <span className="text-[var(--text-muted)] ml-2 flex-shrink-0">{test.duration}ms</span>
                      )}
                    </div>
                    {test.message && (
                      <div className={`mt-0.5 ${
                        test.status === 'fail' ? 'text-red-300/80' :
                        test.status === 'warn' ? 'text-yellow-300/80' :
                        'text-[var(--text-secondary)]'
                      }`}>
                        {test.message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!isRunning && (
              <button
                onClick={runAllTests}
                className="mt-3 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Rodar novamente
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
