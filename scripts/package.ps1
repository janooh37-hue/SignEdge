# Builds dist/signedge-<version>.zip with only the files the store needs.
$ErrorActionPreference = "Stop"
$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$version = $manifest.version
New-Item -ItemType Directory -Force dist | Out-Null
$zip = "dist/signedge-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
$items = @("manifest.json", "popup.html", "pad.html", "viewer.html", "src", "lib", "icons")
Compress-Archive -Path $items -DestinationPath $zip
# Remove non-runtime icon files (generator/docs) — keep only the four PNGs
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open((Resolve-Path $zip), 'Update')
$toDelete = @($archive.Entries | Where-Object { $_.FullName -like 'icons/*' -and $_.FullName -notmatch '\.png$' })
foreach ($e in $toDelete) { $e.Delete() }
$archive.Dispose()
Write-Output "Built $zip"
