# Script para desinstalar o UEM Agent Windows Service
# Execute como Administrador

$serviceName = "UEMAgent"

Write-Host "Desinstalando serviço Windows: $serviceName" -ForegroundColor Yellow

$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -eq 'Running') {
        Write-Host "⏹️ Parando serviço..." -ForegroundColor Cyan
        Stop-Service -Name $serviceName -Force
        Start-Sleep -Seconds 2
    }
    
    Write-Host "🗑️ Removendo serviço..." -ForegroundColor Cyan
    sc.exe delete $serviceName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Serviço removido com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao remover serviço" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️ Serviço não encontrado" -ForegroundColor Yellow
}

