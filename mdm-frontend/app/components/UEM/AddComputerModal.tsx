'use client'

import { showAlert } from '../../lib/dialog'

interface AddComputerModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AddComputerModal({ isOpen, onClose }: AddComputerModalProps) {
  if (!isOpen) return null

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const wsHost = hostname === 'localhost' || hostname === '127.0.0.1' ? hostname : hostname
  const serverUrl = `ws://${wsHost}:3001`

  const copyToClipboard = () => {
    navigator.clipboard.writeText(serverUrl)
    showAlert('URL copiada para a área de transferência!')
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <span>💻</span>
            Conectar Computador
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors rounded-lg hover:bg-[var(--surface-elevated)]"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h4 className="font-medium text-[var(--text-primary)] mb-2">1. Instale o UEM Agent no computador Windows</h4>
            <p className="text-sm text-[var(--text-primary)] mb-2">
              O UEM Agent é um agente que roda em segundo plano e conecta o computador ao painel de gerenciamento.
            </p>
            <ul className="list-disc list-inside text-sm text-[var(--text-primary)] space-y-1 ml-2">
              <li>Requisitos: Windows 10/11, .NET 6.0 ou superior</li>
              <li>Execute o instalador MSI (gere com <code className="bg-[var(--surface-elevated)] px-1 rounded text-[var(--text-primary)]/90">dotnet publish</code> no projeto uem-agent)</li>
              <li>O serviço será instalado e iniciado automaticamente</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-[var(--text-primary)] mb-2">2. Configure a URL do servidor</h4>
            <p className="text-sm text-[var(--text-primary)] mb-2">
              O agente precisa se conectar ao servidor WebSocket. Use a URL abaixo:
            </p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 px-4 py-3 bg-[var(--surface-elevated)] rounded-lg text-sm font-mono break-all text-[var(--text-primary)]/90">
                {serverUrl}
              </code>
              <button
                onClick={copyToClipboard}
                className="btn btn-secondary btn-sm whitespace-nowrap"
              >
                📋 Copiar
              </button>
            </div>
            <p className="text-xs text-[var(--text-primary)] mt-2">
              Em produção, use o IP ou hostname do seu servidor. Ex: ws://192.168.1.100:3001
            </p>
          </div>

          <div>
            <h4 className="font-medium text-[var(--text-primary)] mb-2">3. Arquivos de configuração</h4>
            <p className="text-sm text-[var(--text-primary)] mb-2">
              Edite o arquivo <code className="bg-[var(--surface-elevated)] px-1 rounded text-[var(--text-primary)]/90">appsettings.json</code> ou{' '}
              <code className="bg-[var(--surface-elevated)] px-1 rounded text-[var(--text-primary)]/90">appsettings.Production.json</code> na pasta do agente:
            </p>
            <pre className="p-4 bg-gray-900 text-white/95 rounded-lg text-xs overflow-x-auto font-mono">
{`{
  "ServerUrl": "${serverUrl}",
  "ComputerId": "",
  "UpdateInterval": 30000,
  "HeartbeatInterval": 10000
}`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium text-[var(--text-primary)] mb-2">4. Após a instalação</h4>
            <p className="text-sm text-[var(--text-primary)]">
              O computador aparecerá automaticamente na lista quando o agente se conectar ao servidor.
              Certifique-se de que a porta 3001 está acessível na rede.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-border flex justify-end">
          <button onClick={onClose} className="btn btn-primary">
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
