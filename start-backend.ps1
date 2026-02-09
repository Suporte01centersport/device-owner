# Caminho do backend - altere para onde seu mdm-server realmente está
$backendPath = "C:\Desenvolvimento\device-owner\mdm-uem"

# Porta que o backend usa
$port = 3002

# 1️⃣ Matar qualquer processo que esteja usando a porta
$processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($processes) {
    foreach ($pid in $processes) {
        Write-Host "Matando processo PID $pid que estava usando a porta $port..."
        Stop-Process -Id $pid -Force
    }
} else {
    Write-Host "Porta $port está livre."
}

# 2️⃣ Verificar se a pasta do backend existe
if (-Not (Test-Path $backendPath)) {
    Write-Host "❌ A pasta do backend não existe: $backendPath"
    Write-Host "Verifique o caminho antes de continuar."
    exit
}

# 3️⃣ Ir para a pasta do backend
Set-Location $backendPath

# 4️⃣ Instalar dependências (se houver package.json)
if (Test-Path "package.json") {
    Write-Host "Instalando dependências..."
    npm install
} else {
    Write-Host "package.json não encontrado, pulando npm install."
}

# 5️⃣ Iniciar o backend em nova janela do PowerShell
Write-Host "Iniciando backend $backendPath na porta $port..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start"

# 6️⃣ Esperar 5 segundos e testar se o backend subiu
Start-Sleep -Seconds 5
Write-Host "Testando conexão com http://localhost:$port/api/health ..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ Backend online! Resposta:" $response.Content
} catch {
    Write-Host "❌ Não foi possível conectar ao backend. Confira se npm start rodou corretamente."
}