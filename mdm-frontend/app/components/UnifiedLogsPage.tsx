'use client'

import { useState } from 'react'
import AuditLogsPage from './AuditLogsPage'
import DeviceLogsPage from './DeviceLogsPage'

interface UnifiedLogsPageProps {
  devices: any[]
  sendMessage: (msg: any) => void
}

export default function UnifiedLogsPage({ devices, sendMessage }: UnifiedLogsPageProps) {
  const [activeTab, setActiveTab] = useState<'audit' | 'device'>('audit')

  return (
    <div className="h-full flex flex-col">
      {/* Tab header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Logs</h1>
            <p className="text-white/60 text-sm mt-1">Auditoria do sistema e logs de dispositivos</p>
          </div>
        </div>
        <div className="flex gap-1 bg-[var(--surface)]/30 border border-white/10 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📝</span>
            Auditoria
          </button>
          <button
            onClick={() => setActiveTab('device')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'device'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📡</span>
            Dispositivo
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'audit' ? (
          <AuditLogsPage />
        ) : (
          <DeviceLogsPage devices={devices} sendMessage={sendMessage} />
        )}
      </div>
    </div>
  )
}
