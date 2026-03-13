'use client'

import { useState, useEffect } from 'react'

interface AboutPageProps {
  devices: any[]
  wsConnected: boolean
}

export default function AboutPage({ devices, wsConnected }: AboutPageProps) {
  const [uptime, setUptime] = useState('')
  const [startTime] = useState(() => Date.now())

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - startTime
      const seconds = Math.floor(diff / 1000) % 60
      const minutes = Math.floor(diff / 60000) % 60
      const hours = Math.floor(diff / 3600000) % 24
      const days = Math.floor(diff / 86400000)
      if (days > 0) {
        setUptime(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setUptime(`${hours}h ${minutes}m ${seconds}s`)
      } else {
        setUptime(`${minutes}m ${seconds}s`)
      }
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const onlineDevices = devices.filter(d => d.status === 'online').length
  const offlineDevices = devices.length - onlineDevices

  const quickStartSteps = [
    'Conecte dispositivos via QR Code ou descoberta automática',
    'Atribua usuários aos dispositivos',
    'Configure restrições globais ou por grupo',
    'Monitore pelo Dashboard em tempo real',
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Sobre o Sistema
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          Informações e status do MDM Center
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Info */}
        <div
          className="rounded-xl p-6"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Informações do Sistema
          </h2>
          <div className="space-y-4">
            <InfoRow label="Nome do Sistema" value="MDM Center" />
            <InfoRow label="Versão" value="2.0.0" />
            <InfoRow label="Node.js" value="v22" />
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Status do Servidor</span>
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: wsConnected ? '#22c55e' : '#ef4444' }}
                />
                {wsConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Banco de Dados</span>
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: wsConnected ? '#22c55e' : '#ef4444' }}
                />
                {wsConnected ? 'Operacional' : 'Indisponível'}
              </span>
            </div>
            <InfoRow label="Tempo de Sessão" value={uptime} />
          </div>
        </div>

        {/* Device Stats */}
        <div
          className="rounded-xl p-6"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Dispositivos
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="Total" value={devices.length} color="var(--primary)" />
            <StatCard label="Online" value={onlineDevices} color="#22c55e" />
            <StatCard label="Offline" value={offlineDevices} color="#ef4444" />
          </div>

          {/* Bar visualization */}
          {devices.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Distribuição
                </span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(onlineDevices / devices.length) * 100}%`,
                    background: '#22c55e',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: '#22c55e' }}>
                  {devices.length > 0 ? Math.round((onlineDevices / devices.length) * 100) : 0}% online
                </span>
                <span className="text-xs" style={{ color: '#ef4444' }}>
                  {devices.length > 0 ? Math.round((offlineDevices / devices.length) * 100) : 0}% offline
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Start Guide */}
      <div
        className="rounded-xl p-6"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Guia Rápido
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickStartSteps.map((step, index) => (
            <div
              key={index}
              className="flex gap-3 p-4 rounded-lg"
              style={{
                background: 'var(--surface-elevated, var(--border))',
                border: '1px solid var(--border)',
              }}
            >
              <span
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: 'var(--primary)' }}
              >
                {index + 1}
              </span>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="text-center p-4 rounded-lg"
      style={{
        background: 'var(--surface-elevated, var(--border))',
        border: '1px solid var(--border)',
      }}
    >
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
    </div>
  )
}
