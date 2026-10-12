$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "..\nextjs_space\.env"
if (-not (Test-Path $envFile)) {
  throw "The desktop env file is missing. This build reads it at startup and does not keep its own copy."
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  Set-Item -Path "Env:$name" -Value $value
}

$db = Join-Path $PSScriptRoot "..\nextjs_space\prisma\dev.db"
if ((Test-Path $db) -and $env:DATABASE_URL -match '^file:\./') {
  $full = (Resolve-Path $db).Path.Replace('\', '/')
  $env:DATABASE_URL = "file:$full"
}

$env:PORT = "3001"
$env:HOSTNAME = "0.0.0.0"
node .\server.js
