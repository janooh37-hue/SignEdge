# Builds dist/signedge-<version>.zip with only the files the store needs.
$ErrorActionPreference = "Stop"
$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$version = $manifest.version
New-Item -ItemType Directory -Force dist | Out-Null
$zip = "dist/signedge-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
$items = @("manifest.json", "popup.html", "pad.html", "viewer.html", "src", "lib", "icons")
Compress-Archive -Path $items -DestinationPath $zip
Write-Output "Built $zip"
