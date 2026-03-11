'use client'

import Image from 'next/image'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  currentView: string
  onViewChange: (view: string) => void
}

export default function Sidebar({ isOpen, onClose, currentView, onViewChange }: SidebarProps) {
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
      description: 'Visão geral do sistema'
    },
    {
      id: 'devices',
      label: 'Dispositivos',
      icon: '📱',
      description: 'Gerenciar dispositivos'
    },
    {
      id: 'allowed-apps',
      label: 'Apps liberados Celular',
      icon: '📲',
      description: 'Habilitar apps nos celulares'
    },
    {
      id: 'uem',
      label: 'UEM',
      icon: '💻',
      description: 'Gerenciar computadores'
    },
    {
      id: 'policies',
      label: 'Políticas',
      icon: '📋',
      description: 'Grupos e políticas de apps'
    },
    {
      id: 'users',
      label: 'Usuários',
      icon: '👤',
      description: 'Gerenciar usuários do sistema'
    },
    {
      id: 'alerts',
      label: 'Alertas',
      icon: '🔔',
      description: 'Alertas e notificações'
    },
    {
      id: 'scheduled',
      label: 'Agendamentos',
      icon: '⏰',
      description: 'Comandos agendados'
    },
    {
      id: 'compliance',
      label: 'Compliance',
      icon: '✅',
      description: 'Relatório de conformidade'
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: '⚙️',
      description: 'Configurações do sistema'
    }
  ]

  return (
    <>
      {/* Overlay para mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Header - Logo no canto superior esquerdo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            {/* Logo da empresa */}
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-primary">MDM Center</h1>
              <p className="text-xs text-secondary">Device Management</p>
            </div>
          </div>
        </div>

        {/* Navigation - scrollable */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id)
                onClose()
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                currentView === item.id
                  ? 'bg-primary text-white shadow-md'
                  : 'text-secondary hover:bg-border-light hover:text-primary'
              }`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                <div className={`text-xs truncate ${
                  currentView === item.id ? 'text-blue-100' : 'text-muted'
                }`}>
                  {item.description}
                </div>
              </div>
            </button>
          ))}
        </nav>

        {/* Footer - fixed at bottom */}
        <div className="flex-shrink-0 p-3 border-t border-border">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-border-light">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-semibold">U</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-primary">Usuário</div>
              <div className="text-xs text-secondary truncate">admin@mdm.com</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}