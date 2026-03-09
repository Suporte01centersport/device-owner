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

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id)
                onClose()
              }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                currentView === item.id
                  ? 'bg-primary text-white shadow-md'
                  : 'text-secondary hover:bg-border-light hover:text-primary'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <div className="flex-1">
                <div className="font-medium">{item.label}</div>
                <div className={`text-xs ${
                  currentView === item.id ? 'text-blue-100' : 'text-muted'
                }`}>
                  {item.description}
                </div>
              </div>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-border-light">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">U</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-primary">Usuário</div>
              <div className="text-xs text-secondary">admin@mdm.com</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}