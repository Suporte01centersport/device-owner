import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'MDM Owner - Painel de Controle',
  description: 'Gerenciamento de dispositivos Android',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} min-h-screen bg-background`} style={{ color: '#1e293b' }}>
        {children}
      </body>
    </html>
  )
}
