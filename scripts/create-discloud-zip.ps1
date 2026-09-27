# Script para empacotar o site Marthi para deploy no Discloud
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot | Split-Path -Parent
Set-Location $root

Write-Host "==> Validando compilações locais (API e Web)..."
npm run build:api
npm --prefix apps/web run build

if (-not (Test-Path "dist/index.js")) {
    throw "dist/index.js não encontrado. O build da API falhou."
}
if (-not (Test-Path "dist/public/index.html")) {
    throw "dist/public/index.html não encontrado. O build do Web falhou."
}

$stageDir = Join-Path $root ".tmp-discloud-stage"
$zipFile = Join-Path $root "marthi-platform-site.zip"

if (Test-Path $stageDir) {
    Remove-Item -Recurse -Force $stageDir
}
if (Test-Path $zipFile) {
    Remove-Item -Force $zipFile
}

New-Item -ItemType Directory -Path $stageDir | Out-Null

Write-Host "==> Copiando arquivos respeitando .discloudignore..."

# Arquivos raiz
Copy-Item "discloud.config" -Destination $stageDir
Copy-Item "index.js" -Destination $stageDir
Copy-Item "package.json" -Destination $stageDir
if (Test-Path "package-lock.json") { Copy-Item "package-lock.json" -Destination $stageDir }
if (Test-Path ".discloudignore") { Copy-Item ".discloudignore" -Destination $stageDir }

# Dist (API compilada + Web / SPA estática em dist/public)
Copy-Item -Recurse "dist" -Destination $stageDir

# Apps (código fonte necessário caso o Discloud execute o BUILD remoto)
$stageApps = Join-Path $stageDir "apps"
New-Item -ItemType Directory -Path $stageApps | Out-Null

# apps/api
$stageApi = Join-Path $stageApps "api"
New-Item -ItemType Directory -Path $stageApi | Out-Null
Copy-Item "apps/api/package.json" -Destination $stageApi
Copy-Item "apps/api/tsconfig.json" -Destination $stageApi
Copy-Item -Recurse "apps/api/src" -Destination $stageApi

# apps/web
$stageWeb = Join-Path $stageApps "web"
New-Item -ItemType Directory -Path $stageWeb | Out-Null
Copy-Item "apps/web/package.json" -Destination $stageWeb
if (Test-Path "apps/web/package-lock.json") { Copy-Item "apps/web/package-lock.json" -Destination $stageWeb }
Copy-Item "apps/web/tsconfig.json" -Destination $stageWeb
Copy-Item "apps/web/tsconfig.app.json" -Destination $stageWeb
Copy-Item "apps/web/vite.config.ts" -Destination $stageWeb
Copy-Item "apps/web/index.html" -Destination $stageWeb
Copy-Item -Recurse "apps/web/public" -Destination $stageWeb
Copy-Item -Recurse "apps/web/src" -Destination $stageWeb

if (Test-Path ".agents") {
    Copy-Item -Recurse ".agents" -Destination $stageDir
}

Write-Host "==> Criando marthi-platform-site.zip..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, $zipFile, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Remove-Item -Recurse -Force $stageDir

$sizeMb = [Math]::Round((Get-Item $zipFile).Length / 1MB, 2)
Write-Host "==> Sucesso! marthi-platform-site.zip gerado ($sizeMb MB)."
