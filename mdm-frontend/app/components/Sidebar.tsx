'use client'

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
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white text-xl font-bold">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary">MDM Pro</h1>
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