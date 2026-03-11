'use client'

import { DeviceGroup } from '../types/device'

interface PoliciesOverviewModalProps {
  groups: DeviceGroup[]
  isOpen: boolean
  onClose: () => void
  onSelectGroup: (group: DeviceGroup) => void
}

export default function PoliciesOverviewModal({
  groups,
  isOpen,
  onClose,
  onSelectGroup
}: PoliciesOverviewModalProps) {
  if (!isOpen) return null

  const totalPolicies = groups.reduce((sum, g) => sum + (g.appPolicies?.length || 0), 0)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold text-primary">Políticas de Aplicativos</h3>
            <p className="text-sm text-secondary">
              Total: {totalPolicies} políticas em {groups.length} grupos
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="p-4 border border-border rounded-lg flex items-center justify-between hover:bg-[var(--surface-elevated)] cursor-pointer"
              onClick={() => {
                onSelectGroup(group)
                onClose()
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: group.color || '#3B82F6' }}
                >
                  📋
                </div>
                <div>
                  <span className="font-medium text-primary">{group.name}</span>
                  <p className="text-sm text-secondary">{group.appPolicies?.length || 0} políticas</p>
                </div>
              </div>
              <span className="text-primary font-medium">Gerenciar →</span>
            </div>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="text-center py-12 text-secondary">
            Nenhum grupo cadastrado. Crie um grupo primeiro.
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
