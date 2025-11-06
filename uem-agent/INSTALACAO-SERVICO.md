# Instalação do UEM Agent como Windows Service

## ⚠️ IMPORTANTE: Por que precisa ser Windows Service?

Para que o controle remoto funcione corretamente (mouse/teclado), o agente **DEVE** rodar como **Windows Service** sob a conta **LocalSystem**. Isso é necessário porque:

1. **UIPI (User Interface Privilege Isolation)**: O Windows bloqueia aplicações com menos privilégios de injetar input em aplicações com mais privilégios
2. **LocalSystem**: Rodar como serviço sob `LocalSystem` permite contornar o UIPI e fazer o `SendInput` funcionar corretamente
3. **Persistência**: O serviço continua rodando mesmo se o usuário fizer logout

## 📦 Instalação

### 1. Compilar o projeto

```powershell
cd uem-agent
dotnet build -c Release
```

### 2. Instalar como serviço (Execute como Administrador)

```powershell
.\install-service.ps1
```

### 3. Iniciar o serviço

```powershell
Start-Service -Name UEMAgent
```

### 4. Verificar status

```powershell
Get-Service -Name UEMAgent
```

## 🔧 Configuração Manual (Alternativa)

Se preferir instalar manualmente:

```powershell
# Como Administrador
sc.exe create UEMAgent binPath= "C:\caminho\para\UEMAgent.exe --service" DisplayName= "UEM Agent" start= auto
sc.exe config UEMAgent obj= "LocalSystem"
sc.exe config UEMAgent type= interact type= own
sc.exe description UEMAgent "Agente de gerenciamento unificado de endpoints"
Start-Service UEMAgent
```

## 🗑️ Desinstalação

```powershell
.\uninstall-service.ps1
```

Ou manualmente:

```powershell
Stop-Service -Name UEMAgent -Force
sc.exe delete UEMAgent
```

## ⚠️ Notas Importantes

- O serviço **deve** rodar como `LocalSystem` para que o `SendInput` funcione
- O serviço precisa ter permissão de "interagir com desktop" (já configurado no script)
- Para desenvolvimento/debug, você ainda pode rodar como aplicação normal (sem `--service`)

## 🐛 Troubleshooting

### Serviço não inicia
- Verifique os logs do Windows Event Viewer
- Verifique se o executável existe no caminho especificado
- Verifique se há erros de permissão

### SendInput ainda não funciona
- Verifique se o serviço está rodando como `LocalSystem`:
  ```powershell
  Get-WmiObject Win32_Service -Filter "Name='UEMAgent'" | Select-Object Name, StartName
  ```
- Deve mostrar: `StartName = LocalSystem`

