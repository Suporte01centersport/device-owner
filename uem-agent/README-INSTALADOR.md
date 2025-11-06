# 🚀 Guia Rápido - Instalador MSI

## ⚡ Instalação Rápida

### 1. Instalar WiX Toolset (Uma vez)

```powershell
winget install WiXToolset.WiXToolset
```

### 2. Criar o MSI

```powershell
cd uem-agent
.\build-installer.ps1
```

O MSI será criado em: `bin\Release\UEMAgent-Setup.msi`

### 3. Instalar o Agente

Execute o `UEMAgent-Setup.msi` como **Administrador**.

## ✅ O que o Instalador Faz Automaticamente

- ✅ Instala o agente em `C:\Program Files\MDM Owner\UEM Agent\`
- ✅ Instala como Windows Service
- ✅ Configura como **LocalSystem** (necessário para SendInput)
- ✅ Configura permissões de interação com desktop
- ✅ Inicia o serviço automaticamente
- ✅ Cria atalho no Menu Iniciar

## 🔄 Atualizar o Agente

Simplesmente execute o novo MSI. O instalador:
- Para o serviço antigo
- Instala a nova versão
- Inicia o serviço novamente

**Não precisa desinstalar manualmente!**

## 🗑️ Desinstalar

1. Painel de Controle → Programas → UEM Agent → Desinstalar
2. Ou: `.\uninstall-service.ps1`

## 📝 Configuração

Após instalar, edite:
```
C:\Program Files\MDM Owner\UEM Agent\appsettings.json
```

Depois, reinicie o serviço:
```powershell
Restart-Service -Name UEMAgent
```

## 🔍 Verificar Instalação

```powershell
# Status do serviço
Get-Service -Name UEMAgent

# Verificar se está como LocalSystem
Get-WmiObject Win32_Service -Filter "Name='UEMAgent'" | Select-Object Name, StartName, State
```

Deve mostrar: `StartName = LocalSystem`

## ❓ Problemas?

Veja `INSTALADOR-MSI.md` para troubleshooting completo.

