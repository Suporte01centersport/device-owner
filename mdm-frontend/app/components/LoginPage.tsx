'use client'

import { useState } from 'react'
import { showAlert } from '../lib/dialog'

interface LoginPageProps {
  onLogin: (user?: {username: string, name: string, role: string}) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      await showAlert('Preencha todos os campos.')
      return
    }

    setIsLoading(true)

    try {
      const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
      const response = await fetch(`http://${wsHost}:3001/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password })
      })
      const data = await response.json()
      if (data.success) {
        localStorage.setItem('mdm_auth_token', data.token)
        localStorage.setItem('mdm_user', JSON.stringify(data.user))
        onLogin(data.user)
      } else {
        setIsLoading(false)
        await showAlert(data.error || 'Credenciais inválidas.')
      }
    } catch (err) {
      setIsLoading(false)
      await showAlert('Erro ao conectar com o servidor. Verifique se o backend está rodando.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
    }}>
      {/* Subtle animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5" style={{
          background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)'
        }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-5" style={{
          background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)'
        }} />
      </div>

      <div className="relative w-full max-w-md mx-4">
        {/* Login Card */}
        <div className="rounded-2xl shadow-2xl p-8" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)'
        }}>
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img
                src="/logo.png"
                alt="MDM Center"
                className="w-16 h-16 object-contain"
                onError={(e) => {
                  // Fallback if logo doesn't exist
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              MDM Center
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Device Management
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Usuário
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adm"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all duration-200"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all duration-200"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                autoComplete="current-password"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: isLoading
                  ? 'var(--primary)'
                  : 'linear-gradient(135deg, var(--primary), #6366f1)',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) (e.target as HTMLButtonElement).style.opacity = '0.9'
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.opacity = '1'
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          {/* Footer hint */}
          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            Sistema de gerenciamento de dispositivos
          </p>
        </div>
      </div>
    </div>
  )
}
