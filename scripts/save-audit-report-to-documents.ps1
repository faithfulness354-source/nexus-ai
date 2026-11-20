# Saves the Nexus AI audit report into the current user's Documents folder.
# Run from a clone of faithfulness354-source/nexus-ai, or pass -SourcePath.
param(
  [string]$SourcePath = ""
)

$ErrorActionPreference = "Stop"
$destDir = Join-Path $env:USERPROFILE "Documents"
$dest = Join-Path $destDir "NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md"

if (-not $SourcePath) {
  $candidates = @(
    (Join-Path $PSScriptRoot "..\NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md"),
    (Join-Path (Get-Location) "NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md")
  )
  foreach ($c in $candidates) {
    $full = [System.IO.Path]::GetFullPath($c)
    if (Test-Path -LiteralPath $full) { $SourcePath = $full; break }
  }
}

if (-not $SourcePath -or -not (Test-Path -LiteralPath $SourcePath)) {
  $url = "https://raw.githubusercontent.com/faithfulness354-source/nexus-ai/main/NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md"
  Write-Host "Local report not found; downloading from $url"
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
} else {
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -LiteralPath $SourcePath -Destination $dest -Force
}

Write-Host "Saved: $dest"
Get-Item -LiteralPath $dest | Format-List FullName, Length, LastWriteTime
