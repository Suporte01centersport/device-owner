# Script para compilar o agente e criar o instalador MSI
# Requer: WiX Toolset instalado (https://wixtoolset.org/releases/)

param(
    [string]$Configuration = "Release",
    [string]$Platform = "x64"
)

$ErrorActionPreference = "Stop"

Write-Host "Compilando UEM Agent..." -ForegroundColor Cyan

# 1. Restaurar dependencias
Write-Host "Restaurando dependencias..." -ForegroundColor Yellow
dotnet restore UEMAgent.csproj

# 2. Compilar o projeto
Write-Host "Compilando projeto ($Configuration)..." -ForegroundColor Yellow
dotnet build UEMAgent.csproj -c $Configuration --no-restore

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao compilar o projeto" -ForegroundColor Red
    exit 1
}

# 3. Publicar (self-contained para incluir runtime)
Write-Host "Publicando aplicacao..." -ForegroundColor Yellow
$publishPath = "bin\$Configuration\net8.0-windows\publish"
dotnet publish UEMAgent.csproj -c $Configuration -r win-x64 --self-contained false -o $publishPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao publicar o projeto" -ForegroundColor Red
    exit 1
}

# 4. Verificar se WiX esta instalado
$wixPath = $null

# Procurar WiX em varios locais possiveis
$possiblePaths = @(
    (Join-Path ${env:ProgramFiles(x86)} "WiX Toolset v3.11\bin"),
    (Join-Path $env:ProgramFiles "WiX Toolset v3.11\bin"),
    (Join-Path ${env:ProgramFiles(x86)} "WiX Toolset v3.14\bin"),
    (Join-Path $env:ProgramFiles "WiX Toolset v3.14\bin"),
    (Join-Path ${env:ProgramFiles(x86)} "WiX Toolset v3.13\bin"),
    (Join-Path $env:ProgramFiles "WiX Toolset v3.13\bin"),
    (Join-Path ${env:ProgramFiles(x86)} "WiX Toolset v3.12\bin"),
    (Join-Path $env:ProgramFiles "WiX Toolset v3.12\bin")
)

# Procurar por qualquer versao do WiX
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $wixPath = $path
        break
    }
}

# Se nao encontrou, procurar usando where.exe
if (-not $wixPath) {
    $candlePath = (Get-Command candle.exe -ErrorAction SilentlyContinue).Source
    if ($candlePath) {
        $wixPath = Split-Path -Parent $candlePath
    }
}

# Se ainda nao encontrou, procurar em ProgramData (instalacao winget)
if (-not $wixPath) {
    $wingetPath = Join-Path $env:ProgramData "Microsoft\WindowsApps"
    $candlePath = Get-ChildItem -Path $wingetPath -Filter "candle.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candlePath) {
        $wixPath = $candlePath.DirectoryName
    }
}

if (-not $wixPath -or -not (Test-Path $wixPath)) {
    Write-Host "WiX Toolset nao encontrado!" -ForegroundColor Red
    Write-Host "   Verificando instalacao..." -ForegroundColor Yellow
    
    # Verificar se esta no PATH
    $candleInPath = Get-Command candle.exe -ErrorAction SilentlyContinue
    if ($candleInPath) {
        Write-Host "   WiX encontrado no PATH: $($candleInPath.Source)" -ForegroundColor Green
        $wixPath = Split-Path -Parent $candleInPath.Source
    } else {
        Write-Host "   Baixe e instale em: https://wixtoolset.org/releases/" -ForegroundColor Yellow
        Write-Host "   Ou use: winget install WiXToolset.WiXToolset" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Locais verificados:" -ForegroundColor Yellow
        foreach ($path in $possiblePaths) {
            Write-Host "     - $path" -ForegroundColor Gray
        }
        exit 1
    }
}

Write-Host "WiX Toolset encontrado: $wixPath" -ForegroundColor Green

# 5. Compilar o instalador MSI
Write-Host "Criando instalador MSI..." -ForegroundColor Yellow

# Resolver caminhos absolutos
$exeFile = Get-Item "$publishPath\UEMAgent.exe" -ErrorAction Stop
$exePath = $exeFile.FullName
$targetDirObj = Get-Item $publishPath -ErrorAction Stop
$targetDir = $targetDirObj.FullName

# Garantir que o caminho termina com barra invertida
if (-not $targetDir.EndsWith("\")) {
    $targetDir = "$targetDir\"
}

Write-Host "   Compilando instalador WiX..." -ForegroundColor Cyan
Write-Host "   ExePath: $exePath" -ForegroundColor Gray
Write-Host "   TargetDir: $targetDir" -ForegroundColor Gray

# Usar candle.exe diretamente com caminhos relativos
$wxsFile = "UEMAgent.Installer.wxs"
$wixobjFile = "UEMAgent.Installer.wixobj"

if (-not (Test-Path $wxsFile)) {
    Write-Host "Erro: Arquivo $wxsFile nao encontrado!" -ForegroundColor Red
    exit 1
}

# Mudar para o diretorio do script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir

try {
    $candleExe = Join-Path $wixPath "candle.exe"
    $lightExe = Join-Path $wixPath "light.exe"
    
    # Usar caminhos absolutos normalizados
    # Normalizar caminhos (remover barras duplas, etc)
    $normalizedExePath = [System.IO.Path]::GetFullPath($exePath)
    $normalizedTargetDir = [System.IO.Path]::GetFullPath($targetDir)
    
    # Garantir que termina com barra
    if (-not $normalizedTargetDir.EndsWith("\")) {
        $normalizedTargetDir = "$normalizedTargetDir\"
    }
    
    Write-Host "   Compilando WXS..." -ForegroundColor Cyan
    Write-Host "   ExePath normalizado: $normalizedExePath" -ForegroundColor Gray
    Write-Host "   TargetDir normalizado: $normalizedTargetDir" -ForegroundColor Gray
    
    # Compilar com candle usando caminhos absolutos normalizados
    # Construir argumentos como array
    $candleArgs = @(
        "-arch", "x64",
        "-ext", "WixUtilExtension.dll",
        "-dUEMAgent.TargetPath=$normalizedExePath",
        "-dUEMAgent.TargetDir=$normalizedTargetDir",
        "-out", $wixobjFile,
        $wxsFile
    )
    
    & $candleExe $candleArgs
    
    if ($LASTEXITCODE -ne 0) {
        throw "Candle falhou com codigo $LASTEXITCODE"
    }
    
    # Linkar com light
    $msiFile = "bin\$Configuration\UEMAgent-Setup.msi"
    $msiDir = Split-Path -Parent $msiFile
    if (-not (Test-Path $msiDir)) {
        New-Item -ItemType Directory -Path $msiDir -Force | Out-Null
    }
    
    Write-Host "   Criando MSI..." -ForegroundColor Cyan
    & $lightExe -ext WixUtilExtension.dll -ext WixUIExtension.dll `
        -cultures:pt-BR `
        -out $msiFile `
        $wixobjFile
    
    if ($LASTEXITCODE -ne 0) {
        throw "Light falhou com codigo $LASTEXITCODE"
    }
    
    # Limpar arquivo temporario
    Remove-Item $wixobjFile -ErrorAction SilentlyContinue
    
    $msiFile = (Resolve-Path $msiFile).Path
} catch {
    Write-Host "   Erro: $_" -ForegroundColor Red
    Pop-Location
    exit 1
} finally {
    Pop-Location
}

Write-Host "   MSI criado: $msiFile" -ForegroundColor Cyan

Write-Host ""
Write-Host "Instalador MSI criado com sucesso!" -ForegroundColor Green
Write-Host "   Localizacao: $((Resolve-Path $msiFile).Path)" -ForegroundColor White
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "   1. Execute o MSI como Administrador para instalar" -ForegroundColor White
Write-Host "   2. O servico sera instalado automaticamente como LocalSystem" -ForegroundColor White
Write-Host "   3. O servico sera iniciado automaticamente apos a instalacao" -ForegroundColor White
