# Assembles the shareable Palcalc package: dist/Palcalc.zip
# Run via: npm run package   (builds the static export first)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $projectRoot "dist\Palcalc"
$zip = Join-Path $projectRoot "dist\Palcalc.zip"

if (-not (Test-Path (Join-Path $projectRoot "out\index.html"))) {
    throw "out/ is missing or incomplete - run 'npm run build' first."
}

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item (Join-Path $projectRoot "packaging\Palcalc.bat") $stage
Copy-Item (Join-Path $projectRoot "packaging\palcalc-server.ps1") $stage
Copy-Item (Join-Path $projectRoot "packaging\README.txt") $stage
Copy-Item (Join-Path $projectRoot "out") (Join-Path $stage "app") -Recurse

Compress-Archive -Path $stage -DestinationPath $zip -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Packaged: $zip ($size MB)"
