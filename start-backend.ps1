# Script para iniciar APENAS o Backend (WebSocket Server)
# Para o ambiente completo, use start-dev-windows.bat

$frontendPath = "$PSScriptRoot\mdm-frontend"
$port = 3001

# 1. Verificar porta
$processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($processes) {
    foreach ($processId in $processes) {
        Write-Host "Matando processo PID $processId na porta $port..."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

# 2. Verificar caminho
if (-Not (Test-Path $frontendPath)) {
    Write-Host "❌ Pasta mdm-frontend não encontrada!"
    exit
}

Set-Location $frontendPath

# 3. Verificar .env
if (-Not (Test-Path ".env.development")) {
    Write-Host "Criando .env.development..."
    Copy-Item "env.development.example" ".env.development"
}

# 4. Instalar dependências se necessário
if (-Not (Test-Path "node_modules")) {
    Write-Host "Instalando dependências..."
    npm install
}

# 5. Iniciar WebSocket Server
Write-Host "Iniciando WebSocket Server na porta $port..."
npm run dev:websocket
