'use client'

export default function HelpPage() {
  const sections = [
    {
      title: 'Primeiros Passos',
      icon: '🚀',
      items: [
        { q: 'Como adicionar um dispositivo?', a: 'Instale o APK do MDM no celular. O dispositivo será descoberto automaticamente na rede ou escaneie o QR Code na tela de configuração.' },
        { q: 'Como atribuir um usuário?', a: 'Abra o dispositivo no painel, clique em "Transferir" e selecione o usuário desejado. Usuários são cadastrados na seção Usuários.' },
        { q: 'Como aplicar restrições?', a: 'Vá em Dispositivos, selecione o device, e ative os toggles de restrição desejados. As restrições são aplicadas em tempo real.' }
      ]
    },
    {
      title: 'Gerenciamento de Apps',
      icon: '📱',
      items: [
        { q: 'Como liberar um app no celular?', a: 'Acesse "Apps Liberados Celular" no menu. Selecione o dispositivo ou grupo e marque os apps que deseja liberar.' },
        { q: 'Como instalar um APK remotamente?', a: 'Na lista de dispositivos, clique no botão "Instalar App" no device desejado. Selecione o arquivo APK e confirme.' },
        { q: 'Como controlar versões de apps?', a: 'Em "Apps Liberados", expanda a seção "Controle de Versão" para definir versão mínima e ação (avisar/bloquear/forçar update).' }
      ]
    },
    {
      title: 'Segurança',
      icon: '🔒',
      items: [
        { q: 'O que são as restrições?', a: 'Restrições controlam o que o usuário pode fazer no celular: câmera, USB, factory reset, instalação de apps, etc. São aplicadas via Device Owner do Android.' },
        { q: 'O dispositivo mantém as restrições após reiniciar?', a: 'Sim. As restrições são salvas localmente e reaplicadas automaticamente após boot.' }
      ]
    },
    {
      title: 'Administração',
      icon: '⚙️',
      items: [
        { q: 'Quais são os tipos de usuário?', a: 'Admin: acesso total ao sistema. Viewer: apenas visualização, sem poder executar ações destrutivas como formatar ou deletar.' },
        { q: 'Como fazer backup?', a: 'Acesse Configurações > Backup e Restauração. Clique em "Criar Backup" para salvar o estado atual do sistema.' },
        { q: 'Como agendar comandos?', a: 'Acesse "Agendamentos" no menu. Escolha o comando, dispositivo(s) alvo e frequência (uma vez, diário, semanal).' }
      ]
    }
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Central de Ajuda</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Guia rápido para uso do MDM Center</p>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
              <span className="text-2xl">{section.icon}</span>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{section.title}</h3>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {section.items.map((item, i) => (
                <div key={i} className="px-5 py-4">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{item.q}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <p className="text-sm text-blue-400">
          <span className="font-semibold">Suporte:</span> Em caso de dúvidas, entre em contato com o administrador do sistema.
        </p>
      </div>
    </div>
  )
}
