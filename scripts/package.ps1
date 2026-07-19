# Assembles the shareable Palbook package: dist/Palbook.zip
# Run via: npm run package   (builds the static export first)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $projectRoot "dist\Palbook"
$zip = Join-Path $projectRoot "dist\Palbook.zip"

if (-not (Test-Path (Join-Path $projectRoot "out\index.html"))) {
    throw "out/ is missing or incomplete - run 'npm run build' first."
}

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item (Join-Path $projectRoot "packaging\Palbook.bat") $stage
Copy-Item (Join-Path $projectRoot "packaging\palbook-server.ps1") $stage
Copy-Item (Join-Path $projectRoot "packaging\README.txt") $stage
Copy-Item (Join-Path $projectRoot "out") (Join-Path $stage "app") -Recurse

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $stage -DestinationPath $zip

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Packaged: $zip ($size MB)"
