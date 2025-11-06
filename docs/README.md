# 📚 Documentação do Projeto MDM Owner

Esta pasta contém toda a documentação do projeto MDM Owner.

## 📖 Documentos Disponíveis

### Configuração e Deploy
- **[CONFIGURACAO_E_DEPLOY.md](./CONFIGURACAO_E_DEPLOY.md)** - Guia completo de configuração e deploy
- **[GUIA_COMPLETO_DEPLOY_LINUX.md](./GUIA_COMPLETO_DEPLOY_LINUX.md)** - Guia detalhado para deploy em servidor Linux
- **[PERFORMANCE_E_ESCALABILIDADE.md](./PERFORMANCE_E_ESCALABILIDADE.md)** - Otimizações de performance e escalabilidade

### Funcionalidades
- **[ATUALIZACAO-AUTOMATICA.md](./ATUALIZACAO-AUTOMATICA.md)** - Sistema de atualização remota de APK

### UEM Agent (Windows)
- **[UEM_IMPLEMENTACAO.md](./UEM_IMPLEMENTACAO.md)** - Documentação de implementação do agente UEM
- **[UEM_INSTALADOR-MSI.md](./UEM_INSTALADOR-MSI.md)** - Guia de instalação do agente UEM via MSI

## 🗂️ Estrutura do Projeto

```
device-owner/
├── docs/                    # 📚 Documentação (esta pasta)
├── mdm-frontend/            # 🌐 Frontend Next.js + Backend Node.js
│   ├── app/                 # Aplicação Next.js
│   ├── server/              # Servidor WebSocket e backend
│   │   ├── scripts/         # Scripts utilitários do servidor
│   │   └── database/        # Modelos e migrações do banco
│   └── scripts/             # Scripts de desenvolvimento
│       ├── db/              # Scripts de verificação do banco
│       └── deploy/          # Scripts de deploy
├── mdm-owner/               # 📱 App Android (Kotlin)
└── uem-agent/               # 💻 Agente UEM Windows (C#)
```

## 🚀 Início Rápido

Consulte o [README.md](../README.md) principal para instruções de início rápido.

## 📝 Contribuindo

Ao adicionar nova documentação:
1. Coloque arquivos `.md` nesta pasta `docs/`
2. Atualize este `README.md` com o novo documento
3. Mantenha a estrutura organizada por categoria

