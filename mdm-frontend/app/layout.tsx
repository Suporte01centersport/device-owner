import './globals.css'

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
      <body className="min-h-screen bg-background font-sans" style={{ color: '#1e293b', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
