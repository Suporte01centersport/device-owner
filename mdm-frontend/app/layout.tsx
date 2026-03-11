import './globals.css'
import DialogProvider from './components/DialogProvider'

export const metadata = {
  title: 'MDM Center - Painel de Controle',
  description: 'Gerenciamento de dispositivos Android',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background font-sans" style={{ color: '#1e293b', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        {children}
        <DialogProvider />
      </body>
    </html>
  )
}
