'use client'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  /** Quando true, o modal aparece dentro do container pai (position: relative) em vez de tela cheia */
  insideCard?: boolean
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
  insideCard = false
}: ConfirmModalProps) {
  if (!isOpen) return null

  const confirmButtonClass = {
    danger: 'btn btn-error',
    warning: 'btn btn-warning',
    primary: 'btn btn-primary'
  }[variant]

  const overlayClass = insideCard
    ? 'absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10 rounded-xl p-4'
    : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4'

  return (
    <div
      className={overlayClass}
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
}
