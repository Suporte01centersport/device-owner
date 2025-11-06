# 📦 Instalador MSI - UEM Agent

## 🎯 Visão Geral

Este instalador MSI automatiza completamente a instalação do UEM Agent, incluindo:
- ✅ Instalação automática como Windows Service
- ✅ Configuração como LocalSystem (necessário para SendInput funcionar)
- ✅ Permissões de interação com desktop
- ✅ Suporte a atualização (upgrade automático)
- ✅ Desinstalador completo
- ✅ Menu Iniciar

## 📋 Pré-requisitos

### 1. WiX Toolset

Instale o WiX Toolset v3.11 ou superior:

**Opção 1: Winget (Recomendado)**
```powershell
winget install WiXToolset.WiXToolset
```

**Opção 2: Download Manual**
- Baixe em: https://wixtoolset.org/releases/
- Instale o arquivo `.exe`

### 2. .NET 8.0 SDK

Certifique-se de ter o .NET 8.0 SDK instalado:
```powershell
dotnet --version
```

## 🔨 Como Criar o Instalador MSI

### Método 1: Script Automático (Recomendado)

```powershell
cd uem-agent
.\build-installer.ps1
```

O script irá:
1. Compilar o projeto
2. Publicar a aplicação
3. Criar o MSI em `bin\Release\UEMAgent-Setup.msi`

### Método 2: Manual

```powershell
# 1. Compilar
dotnet build -c Release

# 2. Publicar
dotnet publish -c Release -r win-x64 --self-contained false -o bin\Release\net8.0-windows\publish

# 3. Compilar WiX (ajuste o caminho do WiX)
& "C:\Program Files (x86)\WiX Toolset v3.11\bin\candle.exe" -arch x64 `
    -dUEMAgent.TargetPath="bin\Release\net8.0-windows\publish\UEMAgent.exe" `
    -dUEMAgent.TargetDir="bin\Release\net8.0-windows\publish\" `
    UEMAgent.Installer.wxs

# 4. Criar MSI
& "C:\Program Files (x86)\WiX Toolset v3.11\bin\light.exe" `
    -ext WixUtilExtension.dll `
    -out bin\Release\UEMAgent-Setup.msi `
    UEMAgent.Installer.wixobj
```

## 📥 Instalação

### Instalar

1. Execute `UEMAgent-Setup.msi` como **Administrador**
2. Siga o assistente de instalação
3. O serviço será instalado e iniciado automaticamente

### Verificar Instalação

```powershell
# Verificar serviço
Get-Service -Name UEMAgent

# Verificar se está como LocalSystem
Get-WmiObject Win32_Service -Filter "Name='UEMAgent'" | Select-Object Name, StartName, State

# Verificar logs
Get-EventLog -LogName Application -Source "UEMAgent" -Newest 10
```

## 🔄 Atualização

### Atualizar para Nova Versão

1. Execute o novo `UEMAgent-Setup.msi` como **Administrador**
2. O instalador detectará a versão antiga automaticamente
3. Parará o serviço antigo
4. Instalará a nova versão
5. Iniciará o serviço novamente

**Não é necessário desinstalar manualmente!**

## 🗑️ Desinstalação

### Método 1: Painel de Controle

1. Abra "Programas e Recursos" (ou "Adicionar ou Remover Programas")
2. Encontre "UEM Agent"
3. Clique em "Desinstalar"

### Método 2: PowerShell

```powershell
# Desinstalar via MSI
$msiPath = "C:\caminho\para\UEMAgent-Setup.msi"
msiexec /x $msiPath /quiet

# Ou via ProductCode
$productCode = (Get-WmiObject Win32_Product | Where-Object { $_.Name -eq "UEM Agent" }).IdentifyingNumber
msiexec /x $productCode /quiet
```

### Método 3: Script

```powershell
.\uninstall-service.ps1
```

## ⚙️ Configuração Pós-Instalação

Após a instalação, edite o arquivo de configuração:

```
C:\Program Files\MDM Owner\UEM Agent\appsettings.json
```

```json
{
  "ServerUrl": "ws://seu-servidor:3002",
  "ComputerId": "auto-generated",
  "UpdateInterval": 30000,
  "LocationUpdateInterval": 300000
}
```

**Importante:** Após alterar a configuração, reinicie o serviço:

```powershell
Restart-Service -Name UEMAgent
```

## 🔍 Troubleshooting

### Serviço não inicia

1. Verifique os logs do Event Viewer:
   ```powershell
   Get-EventLog -LogName Application -Source "UEMAgent" -Newest 20
   ```

2. Verifique se está como LocalSystem:
   ```powershell
   Get-WmiObject Win32_Service -Filter "Name='UEMAgent'" | Select-Object StartName
   ```
   Deve mostrar: `LocalSystem`

3. Verifique permissões:
   ```powershell
   sc.exe qc UEMAgent
   ```
   Deve mostrar: `SERVICE_INTERACTIVE_PROCESS`

### SendInput não funciona

- ✅ Verifique se o serviço está rodando como `LocalSystem`
- ✅ Verifique se o serviço tem permissão de interação com desktop
- ✅ Verifique os logs do agente para erros de permissão

### Erro ao instalar MSI

- Execute como **Administrador**
- Verifique se não há outra instalação em andamento
- Verifique se o serviço antigo foi parado corretamente

## 📝 Estrutura do Instalador

```
UEMAgent.Installer.wxs       # Definição do instalador WiX
UEMAgent.Installer.wixproj   # Projeto WiX
build-installer.ps1          # Script de build
```

## 🎯 Funcionalidades do Instalador

- ✅ **Instalação Automática**: Instala tudo automaticamente
- ✅ **Serviço Windows**: Configura como serviço com LocalSystem
- ✅ **Permissões**: Configura permissões necessárias
- ✅ **Atualização**: Suporta upgrade automático
- ✅ **Desinstalação**: Remove tudo completamente
- ✅ **Menu Iniciar**: Cria atalho no menu iniciar
- ✅ **Logs**: Registra eventos no Event Viewer

## 🚀 Distribuição

Para distribuir o agente:

1. Compile o MSI: `.\build-installer.ps1`
2. Distribua o arquivo `bin\Release\UEMAgent-Setup.msi`
3. Instrua os usuários a executar como Administrador

O instalador cuida de tudo automaticamente!

