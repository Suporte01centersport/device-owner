'use client'

import { useEffect, useState, useCallback } from 'react'
import { registerDialogFns } from '../lib/dialog'

interface DialogState {
  type: 'alert' | 'confirm'
  message: string
  resolve: (val: boolean) => void
}

export default function DialogProvider() {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [animating, setAnimating] = useState(false)

  const doAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      setDialog({ type: 'alert', message, resolve: () => resolve() })
      setAnimating(true)
    })
  }, [])

  const doConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ type: 'confirm', message, resolve })
      setAnimating(true)
    })
  }, [])

  useEffect(() => {
    registerDialogFns(doAlert, doConfirm)
  }, [doAlert, doConfirm])

  useEffect(() => {
    if (dialog) {
      requestAnimationFrame(() => setAnimating(true))
    }
  }, [dialog])

  const close = (val: boolean) => {
    setAnimating(false)
    setTimeout(() => {
      dialog?.resolve(val)
      setDialog(null)
    }, 150)
  }

  // Fechar com ESC
  useEffect(() => {
    if (!dialog) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(dialog.type === 'confirm' ? true : true)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dialog])

  if (!dialog) return null

  const isConfirm = dialog.type === 'confirm'
  const msg = dialog.message
  const isError = msg.startsWith('❌') || msg.toLowerCase().includes('erro') || msg.toLowerCase().includes('falha')
  const isSuccess = msg.startsWith('✅') || msg.toLowerCase().includes('sucesso') || msg.toLowerCase().includes('salvo')
  const isWarning = isConfirm || msg.startsWith('⚠️')

  // Limpar emojis do início da mensagem
  const cleanMessage = msg.replace(/^[✅❌⚠️ℹ️🔄💾]\s*/, '')

  // Cores do ícone
  const iconBg = isError ? 'rgba(239, 68, 68, 0.2)'
    : isSuccess ? 'rgba(53, 232, 21, 0.15)'
    : isWarning ? 'rgba(245, 158, 11, 0.2)'
    : 'rgba(59, 130, 246, 0.2)'

  const iconBorder = isError ? 'rgba(239, 68, 68, 0.4)'
    : isSuccess ? 'rgba(53, 232, 21, 0.3)'
    : isWarning ? 'rgba(245, 158, 11, 0.4)'
    : 'rgba(59, 130, 246, 0.4)'

  const icon = isError ? '❌' : isSuccess ? '✅' : isWarning ? '⚠️' : 'ℹ️'

  // Cor do botão principal
  const btnBg = isError ? '#ef4444'
    : isSuccess ? '#35E815'
    : isWarning ? '#f59e0b'
    : '#3b82f6'

  const btnHover = isError ? '#dc2626'
    : isSuccess ? '#2bc711'
    : isWarning ? '#d97706'
    : '#2563eb'

  const btnText = isSuccess ? '#000' : '#fff'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        padding: '1rem',
        opacity: animating ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
      onClick={() => close(false)}
    >
      <div
        style={{
          background: 'var(--surface, #1e293b)',
          border: '1px solid var(--border, #334155)',
          borderRadius: '1rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          padding: '2rem',
          maxWidth: '420px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          transform: animating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
          transition: 'transform 0.2s ease, opacity 0.2s ease',
          opacity: animating ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ícone */}
        <div
          style={{
            width: '3.5rem',
            height: '3.5rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            background: iconBg,
            border: `1px solid ${iconBorder}`,
          }}
        >
          {icon}
        </div>

        {/* Mensagem */}
        <p
          style={{
            color: 'var(--text-primary, #f1f5f9)',
            textAlign: 'center',
            fontSize: '0.9375rem',
            lineHeight: '1.6',
            whiteSpace: 'pre-line',
            margin: 0,
            maxWidth: '100%',
            wordBreak: 'break-word',
          }}
        >
          {cleanMessage}
        </p>

        {/* Botões */}
        <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.25rem' }}>
          {isConfirm ? (
            <>
              <button
                onClick={() => close(false)}
                style={{
                  flex: 1,
                  padding: '0.7rem 1rem',
                  background: 'var(--surface-elevated, #334155)',
                  color: 'var(--text-primary, #f1f5f9)',
                  border: '1px solid var(--border, #334155)',
                  borderRadius: '0.625rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--surface-elevated, #334155)'
                }}
              >
                Não
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                style={{
                  flex: 1,
                  padding: '0.7rem 1rem',
                  background: btnBg,
                  color: btnText,
                  border: 'none',
                  borderRadius: '0.625rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = btnHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = btnBg
                }}
              >
                Sim
              </button>
            </>
          ) : (
            <button
              onClick={() => close(true)}
              autoFocus
              style={{
                flex: 1,
                padding: '0.7rem 1rem',
                background: btnBg,
                color: btnText,
                border: 'none',
                borderRadius: '0.625rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = btnHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = btnBg
              }}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
