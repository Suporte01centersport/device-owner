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

  const doAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      setDialog({ type: 'alert', message, resolve: () => resolve() })
    })
  }, [])

  const doConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ type: 'confirm', message, resolve })
    })
  }, [])

  useEffect(() => {
    registerDialogFns(doAlert, doConfirm)
  }, [doAlert, doConfirm])

  const close = (val: boolean) => {
    dialog?.resolve(val)
    setDialog(null)
  }

  if (!dialog) return null

  const isConfirm = dialog.type === 'confirm'
  const isError = dialog.message.startsWith('❌') || dialog.message.toLowerCase().includes('erro')
  const isSuccess = dialog.message.startsWith('✅')

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={() => close(false)}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl p-7 max-w-md w-full mx-4 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
          isError ? 'bg-red-500/20' : isSuccess ? 'bg-green-500/20' : isConfirm ? 'bg-yellow-500/20' : 'bg-blue-500/20'
        }`}>
          {isError ? '❌' : isSuccess ? '✅' : isConfirm ? '⚠️' : 'ℹ️'}
        </div>

        <p className="text-white text-center text-sm leading-relaxed whitespace-pre-line">
          {dialog.message.replace(/^[✅❌⚠️ℹ️]\s*/, '')}
        </p>

        <div className="flex gap-3 w-full mt-1">
          {isConfirm ? (
            <>
              <button
                onClick={() => close(false)}
                className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-border rounded-xl text-sm font-medium transition-colors"
              >
                Não
              </button>
              <button
                onClick={() => close(true)}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/80 text-black rounded-xl text-sm font-semibold transition-colors"
                autoFocus
              >
                Sim
              </button>
            </>
          ) : (
            <button
              onClick={() => close(true)}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isError ? 'bg-red-600 hover:bg-red-700 text-white' : isSuccess ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-primary hover:bg-primary/80 text-black'
              }`}
              autoFocus
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
