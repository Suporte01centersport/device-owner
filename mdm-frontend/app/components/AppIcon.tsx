'use client'

import { useState, useEffect } from 'react'

interface AppIconProps {
  packageName: string
  emoji: string
  size?: number
  className?: string
}

/**
 * Exibe o ícone real do app (Play Store) ou fallback para emoji.
 */
export default function AppIcon({ packageName, emoji, size = 48, className = '' }: AppIconProps) {
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchIcon = async () => {
      try {
        const res = await fetch(`/api/app-icon?package=${encodeURIComponent(packageName)}`)
        const data = await res.json()
        if (!cancelled && data?.iconUrl) {
          setIconUrl(data.iconUrl)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    fetchIcon()
    return () => { cancelled = true }
  }, [packageName])

  const showEmoji = failed || !iconUrl

  if (showEmoji) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-xl" style={{ fontSize: size * 0.5 }}>{emoji}</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl!}
      alt=""
      width={size}
      height={size}
      className={`rounded-xl object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  )
}
