# Script para instalar o UEM Agent como Windows Service
# Execute como Administrador

$serviceName = "UEMAgent"
$displayName = "UEM Agent - Gerenciamento de Endpoints"
$description = "Agente de gerenciamento unificado de endpoints (UEM) para controle remoto"
$exePath = Join-Path $PSScriptRoot "bin\Release\net8.0-windows\UEMAgent.exe"

Write-Host "Instalando serviço Windows: $serviceName" -ForegroundColor Green

# Verificar se o executável existe
if (-not (Test-Path $exePath)) {
    Write-Host "❌ Executável não encontrado: $exePath" -ForegroundColor Red
    Write-Host "   Compile o projeto primeiro (dotnet build -c Release)" -ForegroundColor Yellow
    exit 1
}

# Verificar se já existe
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "⚠️ Serviço já existe. Parando e removendo..." -ForegroundColor Yellow
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName
    Start-Sleep -Seconds 2
}

# Instalar serviço
Write-Host "📦 Instalando serviço..." -ForegroundColor Cyan
$result = sc.exe create $serviceName binPath= "`"$exePath`" --service" DisplayName= "$displayName" start= auto

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Serviço instalado com sucesso!" -ForegroundColor Green
    
    # Configurar descrição
    sc.exe description $serviceName "$description"
    
    # Configurar para rodar como LocalSystem (necessário para SendInput funcionar)
    Write-Host "🔧 Configurando para rodar como LocalSystem..." -ForegroundColor Cyan
    sc.exe config $serviceName obj= "LocalSystem"
    
    # Habilitar interação com desktop (necessário para input)
    sc.exe config $serviceName type= interact type= own
    
    Write-Host "✅ Configuração concluída!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Para iniciar o serviço, execute:" -ForegroundColor Yellow
    Write-Host "  Start-Service -Name $serviceName" -ForegroundColor White
    Write-Host ""
    Write-Host "Para verificar o status:" -ForegroundColor Yellow
    Write-Host "  Get-Service -Name $serviceName" -ForegroundColor White
} else {
    Write-Host "❌ Erro ao instalar serviço" -ForegroundColor Red
    exit 1
}

