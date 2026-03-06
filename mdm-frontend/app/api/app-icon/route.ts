import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/app-icon?package=com.whatsapp
 * Busca o ícone do app na Play Store e retorna a URL.
 * Fallback: retorna null para apps que não estão na Play Store.
 */
export async function GET(request: NextRequest) {
  const packageName = request.nextUrl.searchParams.get('package')
  if (!packageName || typeof packageName !== 'string') {
    return NextResponse.json({ error: 'package é obrigatório' }, { status: 400 })
  }

  // Validar formato básico de package name
  if (!/^[a-zA-Z0-9._]+$/.test(packageName)) {
    return NextResponse.json({ error: 'package inválido' }, { status: 400 })
  }

  try {
    const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      next: { revalidate: 86400 }, // cache 24h
    })

    if (!res.ok) {
      return NextResponse.json({ iconUrl: null }, { status: 200 })
    }

    const html = await res.text()

    // Tentar og:image primeiro (mais comum)
    let iconUrl: string | null = null
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    if (ogMatch) {
      iconUrl = ogMatch[1].trim()
    }

    // Fallback: itemprop="image"
    if (!iconUrl) {
      const itemMatch = html.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i)
      if (itemMatch) {
        iconUrl = itemMatch[1].trim()
      }
    }

    // Fallback: content antes de property
    if (!iconUrl) {
      const altMatch = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      if (altMatch) {
        iconUrl = altMatch[1].trim()
      }
    }

    return NextResponse.json({ iconUrl })
  } catch (err) {
    console.error('Erro ao buscar ícone:', packageName, err)
    return NextResponse.json({ iconUrl: null }, { status: 200 })
  }
}
