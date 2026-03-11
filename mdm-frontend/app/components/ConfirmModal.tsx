'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  insideCard?: boolean // mantido para compatibilidade, mas sempre centraliza
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Sim',
  cancelLabel = 'Não',
  variant = 'danger',
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  const confirmButtonClass = {
    danger: 'btn btn-error',
    warning: 'btn btn-warning',
    primary: 'btn btn-primary'
  }[variant]

  const modal = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9998] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-primary mb-3">{title}</h3>
        <p className="text-secondary mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={confirmButtonClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
