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

Edite o arquivo `appsettings.json`:

```json
{
  "ServerUrl": "ws://seu-servidor:3002",
  "ComputerId": "auto-generated",
  "UpdateInterval": 30000,
  "LocationUpdateInterval": 300000
}
```

## Funcionalidades

- **Coleta de Informações**: CPU, memória, armazenamento, programas instalados, etc.
- **Comunicação WebSocket**: Conexão persistente com o servidor
- **Localização**: Rastreamento de localização (se GPS disponível)
- **Acesso Remoto**: Suporte para RDP e AnyDesk
- **Ações Remotas**: Reiniciar, desligar, bloquear, etc.


