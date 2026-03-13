'use client'

import { useState, useEffect, useMemo } from 'react'
import { Device } from '../types/device'

interface ComplianceDevice {
  device: Device
  isOnline: boolean
  hasRestrictions: boolean
  hasUser: boolean
  isNotRooted: boolean
  batteryOk: boolean
  seenRecently: boolean
  score: number
  isCompliant: boolean
}

export default function CompliancePage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/devices')
        if (!res.ok) throw new Error('Erro ao buscar dispositivos')
        const data = await res.json()
        setDevices(data.data || data.devices || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchDevices()
  }, [])

  const complianceData = useMemo<ComplianceDevice[]>(() => {
    const now = Date.now()
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
    return devices
      .filter(d => d.deviceType !== 'computer')
      .map(device => {
        const isOnline = device.status === 'online'
        const restrictions = device.restrictions || {} as any
        const hasRestrictions = Object.values(restrictions).some(v => v === true)
        const hasUser = !!(device.assignedUser || device.assignedUserName || device.assignedDeviceUserId)
        const isNotRooted = !device.isDeveloperOptionsEnabled
        const batteryOk = (device.batteryLevel ?? 100) >= 10
        const seenRecently = device.lastSeen ? (now - device.lastSeen) < TWENTY_FOUR_HOURS : false

        // Weighted scoring: Online 25, User 20, Restrictions 25, Battery 15, LastSeen 15
        let score = 0
        if (isOnline) score += 25
        if (hasUser) score += 20
        if (hasRestrictions) score += 25
        if (batteryOk) score += 15
        if (seenRecently) score += 15

        const isCompliant = score >= 100
        return { device, isOnline, hasRestrictions, hasUser, isNotRooted, batteryOk, seenRecently, score, isCompliant }
      })
  }, [devices])

  const totalDevices = complianceData.length
  const compliantCount = complianceData.filter(d => d.isCompliant).length
  const nonCompliantCount = totalDevices - compliantCount
  const avgScore = totalDevices > 0 ? Math.round(complianceData.reduce((sum, d) => sum + d.score, 0) / totalDevices) : 0
  const compliancePercent = totalDevices > 0 ? Math.round((compliantCount / totalDevices) * 100) : 0

  const issues = useMemo(() => {
    const counts = { offline: 0, noRestrictions: 0, noUser: 0, rooted: 0, batteryCritical: 0, notSeenRecently: 0 }
    complianceData.forEach(d => {
      if (!d.isOnline) counts.offline++
      if (!d.hasRestrictions) counts.noRestrictions++
      if (!d.hasUser) counts.noUser++
      if (!d.isNotRooted) counts.rooted++
      if (!d.batteryOk) counts.batteryCritical++
      if (!d.seenRecently) counts.notSeenRecently++
    })
    return [
      { label: 'Dispositivos offline', count: counts.offline },
      { label: 'Sem restrições aplicadas', count: counts.noRestrictions },
      { label: 'Sem usuário atribuído', count: counts.noUser },
      { label: 'Opções de desenvolvedor ativas (Root)', count: counts.rooted },
      { label: 'Bateria crítica (< 10%)', count: counts.batteryCritical },
      { label: 'Sem comunicação há mais de 24h', count: counts.notSeenRecently },
    ].sort((a, b) => b.count - a.count)
  }, [complianceData])

  const needsAttention = complianceData.filter(d => !d.isCompliant)

  const handleExportPDF = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const compliant = complianceData.filter(d => d.isCompliant).length
    const nonCompliant = complianceData.filter(d => !d.isCompliant).length
    const avgScore = complianceData.length > 0 ? Math.round(complianceData.reduce((s, d) => s + d.score, 0) / complianceData.length) : 0
    const tableRows = complianceData.map(d => `
      <tr>
        <td>${d.device.name || d.device.deviceId}</td>
        <td>${d.device.model || '-'}</td>
        <td style="color:${d.isOnline ? '#16a34a' : '#dc2626'};font-weight:600;">${d.isOnline ? 'Online' : 'Offline'}</td>
        <td>${d.hasRestrictions ? '✓' : '✗'}</td>
        <td>${d.hasUser ? (d.device.assignedUser?.name || d.device.assignedUserName || 'Sim') : '✗'}</td>
        <td>${d.batteryOk ? 'OK' : 'Crítica'}</td>
        <td style="font-weight:700;color:${d.score >= 80 ? '#16a34a' : d.score >= 50 ? '#d97706' : '#dc2626'};">${d.score}/100</td>
        <td><span style="padding:3px 10px;border-radius:4px;font-weight:600;font-size:12px;${d.isCompliant ? 'background:#d1fae5;color:#065f46;' : 'background:#fee2e2;color:#991b1b;'}">${d.isCompliant ? 'Conforme' : 'Não conforme'}</span></td>
      </tr>
    `).join('')
    win.document.write(`
      <html>
      <head>
        <title>Relatório de Compliance - MDM Center</title>
        <style>
          @page { size: landscape; margin: 15mm; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 30px; color: #222; }
          h1 { font-size: 26px; color: #1e293b; margin: 0 0 6px 0; }
          .meta { color: #555; font-size: 14px; margin-bottom: 20px; }
          .summary { display: flex; gap: 24px; margin-bottom: 24px; }
          .summary-card { padding: 16px 24px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center; }
          .summary-card .value { font-size: 28px; font-weight: 700; }
          .summary-card .label { font-size: 12px; color: #64748b; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #1e293b; color: #fff; font-size: 13px; font-weight: 600; padding: 10px 12px; text-align: left; }
          td { border-bottom: 1px solid #e2e8f0; padding: 9px 12px; font-size: 13px; }
          tr:nth-child(even) { background: #f8fafc; }
          .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <h1>Relatório de Compliance — MDM Center</h1>
        <div class="meta">Gerado em: ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; Total: ${complianceData.length} dispositivos</div>
        <div class="summary">
          <div class="summary-card"><div class="value" style="color:#16a34a;">${compliant}</div><div class="label">Conformes</div></div>
          <div class="summary-card"><div class="value" style="color:#dc2626;">${nonCompliant}</div><div class="label">Não Conformes</div></div>
          <div class="summary-card"><div class="value" style="color:${avgScore >= 80 ? '#16a34a' : avgScore >= 50 ? '#d97706' : '#dc2626'};">${avgScore}</div><div class="label">Score Médio</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Modelo</th>
              <th>Status</th>
              <th>Restrições</th>
              <th>Usuário</th>
              <th>Bateria</th>
              <th>Score</th>
              <th>Compliance</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="footer">MDM Center — Relatório de Compliance gerado automaticamente</div>
      </body>
      </html>
    `)
    win.document.close()
    win.print()
  }

  const handleExportCSV = () => {
    const headers = ['Dispositivo', 'Modelo', 'Status', 'Restrições', 'Usuário', 'Root', 'Bateria', 'Última conexão', 'Score', 'Compliance']
    const rows = complianceData.map(d => [
      d.device.name || d.device.deviceId,
      d.device.model || '-',
      d.isOnline ? 'Online' : 'Offline',
      d.hasRestrictions ? 'Sim' : 'Não',
      d.hasUser ? (d.device.assignedUser?.name || d.device.assignedUserName || 'Sim') : 'Não',
      d.isNotRooted ? 'Não' : 'Sim',
      d.batteryOk ? 'OK' : 'Crítica',
      d.seenRecently ? 'Sim' : 'Não',
      `${d.score}/100`,
      d.isCompliant ? 'Conforme' : 'Não conforme',
    ])
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compliance_report_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const CheckIcon = () => <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '18px' }}>&#10003;</span>
  const XIcon = () => <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '18px' }}>&#10007;</span>

  // Circular progress SVG
  const CircularProgress = ({ percent }: { percent: number }) => {
    const radius = 70
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (percent / 100) * circumference
    const color = percent >= 80 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#ef4444'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--border)" strokeWidth="12" />
          <circle
            cx="90" cy="90" r={radius} fill="none"
            stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 90 90)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
          <text x="90" y="82" textAnchor="middle" fill="var(--text-primary)" fontSize="36" fontWeight="bold">
            {percent}%
          </text>
          <text x="90" y="108" textAnchor="middle" fill="var(--text-secondary)" fontSize="14">
            conforme
          </text>
        </svg>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9203;</div>
          <p style={{ color: 'var(--text-secondary)' }}>Carregando dados de compliance...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div style={{ background: 'var(--surface)', border: '1px solid #ef4444', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: '18px' }}>Erro: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Compliance</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Relatório de conformidade dos dispositivos</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleExportCSV} className="btn btn-secondary" style={{ color: 'white' }}>
            <span>&#128196;</span> Exportar CSV
          </button>
          <button onClick={handleExportPDF} className="btn btn-primary">
            <span>&#128424;</span> Exportar PDF
          </button>
        </div>
      </div>

      <div id="compliance-report">
        {/* Overall Score + Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '24px' }}>
          {/* Circular Score */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
            padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              Score Geral
            </h2>
            <CircularProgress percent={compliancePercent} />
            <p style={{ color: 'var(--text-secondary)', marginTop: '12px', fontSize: '14px' }}>
              {compliantCount} de {totalDevices} dispositivos conformes
            </p>
          </div>

          {/* Statistics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Compliant */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                  &#10003;
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Conformes</span>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#10b981' }}>{compliantCount}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>dispositivos</div>
            </div>

            {/* Non-compliant */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#ef4444' }}>
                  &#10007;
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Não conformes</span>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ef4444' }}>{nonCompliantCount}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>dispositivos</div>
            </div>

            {/* Average Score */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px',
              gridColumn: '1 / -1'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#6366f1' }}>
                  &#9733;
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Score Médio</span>
              </div>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: avgScore >= 80 ? '#10b981' : avgScore >= 50 ? '#f59e0b' : '#ef4444' }}>{avgScore}/100</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>pontos (Online: 25, Restrições: 25, Usuário: 20, Bateria: 15, Última conexão: 15)</div>
            </div>

            {/* Most common issues */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px',
              gridColumn: '1 / -1'
            }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>
                Problemas mais comuns
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {issues.map((issue, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{issue.label}</span>
                    <span style={{
                      padding: '2px 10px', borderRadius: '9999px', fontSize: '13px', fontWeight: '600',
                      background: issue.count > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                      color: issue.count > 0 ? '#ef4444' : '#10b981'
                    }}>
                      {issue.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Devices needing attention */}
        {needsAttention.length > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
            padding: '24px', marginBottom: '24px'
          }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              Dispositivos que precisam de atenção ({needsAttention.length})
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {needsAttention.map((d, i) => (
                <span key={i} style={{
                  padding: '6px 14px', borderRadius: '8px', fontSize: '13px',
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)'
                }}>
                  {d.device.name || d.device.deviceId}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Compliance Breakdown Table */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
          padding: '24px', overflow: 'auto'
        }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Detalhamento por Dispositivo
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Dispositivo', 'Status', 'Restrições', 'Usuário', 'Root', 'Bateria', 'Visto 24h', 'Score', 'Compliance'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600',
                    color: 'var(--text-secondary)', borderBottom: '2px solid var(--border)',
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {complianceData.map((d, i) => (
                <tr key={i} style={{
                  background: d.isCompliant ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                  transition: 'background 0.2s'
                }}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                      {d.device.name || d.device.deviceId}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {d.device.model} {d.device.manufacturer ? `- ${d.device.manufacturer}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {d.isOnline ? <CheckIcon /> : <XIcon />}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {d.hasRestrictions ? <CheckIcon /> : <XIcon />}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {d.hasUser ? <CheckIcon /> : <XIcon />}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {d.isNotRooted ? <CheckIcon /> : <XIcon />}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {d.batteryOk ? <CheckIcon /> : <XIcon />}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {d.seenRecently ? <CheckIcon /> : <XIcon />}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600',
                      background: d.score >= 80 ? 'rgba(16,185,129,0.15)' : d.score >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      color: d.score >= 80 ? '#10b981' : d.score >= 50 ? '#f59e0b' : '#ef4444'
                    }}>
                      {d.score}/100
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600',
                      background: d.isCompliant ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: d.isCompliant ? '#10b981' : '#ef4444'
                    }}>
                      {d.isCompliant ? 'Conforme' : 'Não conforme'}
                    </span>
                  </td>
                </tr>
              ))}
              {complianceData.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Nenhum dispositivo encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
