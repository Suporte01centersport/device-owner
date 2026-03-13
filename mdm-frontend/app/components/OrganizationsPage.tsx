'use client'

import { useState, useEffect, useCallback } from 'react'
import { showAlert, showConfirm } from '../lib/dialog'

interface Organization {
  id: string
  name: string
  description: string
  color: string
  deviceCount: number
  createdAt: string
}

interface OrgFormData {
  name: string
  description: string
  color: string
}

const STORAGE_KEY = 'mdm_organizations'

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
]

function generateId(): string {
  return `org_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function loadOrganizations(): Organization[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveOrganizations(orgs: Organization[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orgs))
}

const emptyForm: OrgFormData = { name: '', description: '', color: '#3b82f6' }

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [formData, setFormData] = useState<OrgFormData>({ ...emptyForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    setOrganizations(loadOrganizations())
  }, [])

  const persist = useCallback((orgs: Organization[]) => {
    setOrganizations(orgs)
    saveOrganizations(orgs)
  }, [])

  const resetForm = useCallback(() => {
    setFormData({ ...emptyForm })
    setEditingId(null)
    setShowForm(false)
  }, [])

  const handleSubmit = useCallback(async () => {
    const name = formData.name.trim()
    if (!name) {
      await showAlert('O nome da organização é obrigatório.')
      return
    }

    const current = loadOrganizations()

    if (editingId) {
      const updated = current.map((org) =>
        org.id === editingId
          ? { ...org, name, description: formData.description.trim(), color: formData.color }
          : org
      )
      persist(updated)
      await showAlert('Organização atualizada com sucesso.')
    } else {
      const newOrg: Organization = {
        id: generateId(),
        name,
        description: formData.description.trim(),
        color: formData.color,
        deviceCount: 0,
        createdAt: new Date().toISOString(),
      }
      const updated = [...current, newOrg]
      persist(updated)
      await showAlert('Organização criada com sucesso.')
    }

    resetForm()
  }, [formData, editingId, persist, resetForm])

  const handleEdit = useCallback((org: Organization) => {
    setFormData({ name: org.name, description: org.description, color: org.color })
    setEditingId(org.id)
    setShowForm(true)
  }, [])

  const handleDelete = useCallback(async (org: Organization) => {
    const confirmed = await showConfirm(
      `Tem certeza que deseja excluir a organização "${org.name}"? Esta ação não pode ser desfeita.`
    )
    if (!confirmed) return

    const current = loadOrganizations()
    const updated = current.filter((o) => o.id !== org.id)
    persist(updated)
    await showAlert('Organização excluída com sucesso.')
  }, [persist])

  const filtered = searchTerm
    ? organizations.filter(
        (org) =>
          org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          org.description.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : organizations

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Organizações</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Gerencie as organizações e seus dispositivos
          </p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova Organização
        </button>
      </div>

      {/* Search */}
      {organizations.length > 0 && (
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Buscar organizações..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 pl-10 pr-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          />
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {editingId ? 'Editar Organização' : 'Nova Organização'}
              </h2>
              <button
                onClick={resetForm}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Nome *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome da organização"
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Descrição
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição da organização (opcional)"
                rows={3}
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Cor
              </label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormData((f) => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.color === c
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent hover:border-white/40'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <label className="text-xs text-[var(--text-secondary)]">Personalizada:</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                />
                <span className="text-xs text-[var(--text-secondary)] font-mono">{formData.color}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--background)] border border-[var(--border)] rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                {editingId ? 'Salvar Alterações' : 'Criar Organização'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {organizations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 mb-4 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
            Nenhuma organização cadastrada
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-sm">
            Crie sua primeira organização para começar a gerenciar dispositivos em múltiplos ambientes.
          </p>
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Criar Organização
          </button>
        </div>
      )}

      {/* Grid of Organization Cards */}
      {organizations.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--text-secondary)] text-sm">
            Nenhuma organização encontrada para &quot;{searchTerm}&quot;
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((org) => (
            <div
              key={org.id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--border-hover)] transition-colors group"
            >
              {/* Color Bar */}
              <div className="h-1.5" style={{ backgroundColor: org.color }} />

              <div className="p-4 space-y-3">
                {/* Name & Color Dot */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: org.color }}
                    />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {org.name}
                    </h3>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => handleEdit(org)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
                      title="Editar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(org)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                      title="Excluir"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Description */}
                {org.description && (
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                    {org.description}
                  </p>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <span>
                      {org.deviceCount} {org.deviceCount === 1 ? 'dispositivo' : 'dispositivos'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span>{formatDate(org.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {organizations.length > 0 && (
        <div className="text-xs text-[var(--text-secondary)] text-center pt-2">
          {organizations.length} {organizations.length === 1 ? 'organização' : 'organizações'} cadastrada{organizations.length !== 1 ? 's' : ''}
          {searchTerm && ` (${filtered.length} encontrada${filtered.length !== 1 ? 's' : ''})`}
        </div>
      )}
    </div>
  )
}
