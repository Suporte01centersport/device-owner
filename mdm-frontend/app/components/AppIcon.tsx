'use client'

import { useState } from 'react'

interface AppIconProps {
  packageName: string
  emoji: string
  size?: number
  className?: string
  iconUrl?: string // URL direta do preset (Android-style)
}

/**
 * Exibe o ícone real do app (preset iconUrl, Play Store ou fallback emoji).
 */
export default function AppIcon({ packageName, emoji, size = 48, className = '', iconUrl: presetIconUrl }: AppIconProps) {
  const [failed, setFailed] = useState(false)

  // Se tiver URL direta do preset, usar ela (sem fetch)
  if (presetIconUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={presetIconUrl}
        alt=""
        width={size}
        height={size}
        className={`rounded-2xl object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    )
  }

  // Fallback: emoji com fundo colorido estilo Android
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/60 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.52 }}>{emoji}</span>
    </div>
  )
}
