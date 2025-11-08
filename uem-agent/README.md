# UEM Agent - Agente de Gerenciamento para Computadores Windows

Agente de gerenciamento unificado de endpoints (UEM) para computadores Windows que fornece:
- Coleta de informações do sistema
- Comunicação via WebSocket com o servidor
- Rastreamento de localização
- Acesso remoto (RDP/AnyDesk-like)
- Controle remoto de ações

## Requisitos

- Windows 10/11
- .NET 6.0 ou superior
- Permissões de administrador (para algumas funcionalidades)

## Instalação

1. Execute o instalador MSI
2. Configure o servidor WebSocket no arquivo de configuração
3. O serviço será instalado e iniciado automaticamente

## Configuração

Há três arquivos de configuração na raiz do projeto:

- `appsettings.json`: valores padrão compartilhados.
- `appsettings.Development.json`: usado automaticamente em builds **Debug** (aponta para o servidor local `ws://localhost:3002`).
- `appsettings.Production.json`: usado automaticamente em builds **Release** (aponta para o servidor Linux `ws://192.168.2.100:3002`).

O agente define `DOTNET_ENVIRONMENT=Development` nos builds de teste e `DOTNET_ENVIRONMENT=Production` nos builds finais, portanto não é necessário alterar manualmente durante o desenvolvimento. Caso seu IP público de produção mude, atualize `appsettings.Production.json` antes de gerar o instalador.

## Funcionalidades

- **Coleta de Informações**: CPU, memória, armazenamento, programas instalados, etc.
- **Comunicação WebSocket**: Conexão persistente com o servidor
- **Localização**: Rastreamento de localização (se GPS disponível)
- **Acesso Remoto**: Suporte para RDP e AnyDesk
- **Ações Remotas**: Reiniciar, desligar, bloquear, etc.


