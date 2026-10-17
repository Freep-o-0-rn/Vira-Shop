$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $root "vira-database-setup.log"
$transcriptStarted = $false
$exitCode = 0
try {
  Set-Location -LiteralPath $root
  Start-Transcript -Path $logPath -Force | Out-Null
  $transcriptStarted = $true
  Write-Host ""
  Write-Host "Setting up local PostgreSQL for Vira Shop" -ForegroundColor Cyan
  Write-Host "Development only. Do NOT publish database port or reuse development credentials."
  $null = Get-Command docker.exe -ErrorAction Stop
  $null = Get-Command npm.cmd -ErrorAction Stop
  & docker.exe compose version
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose is unavailable. Update and start Docker Desktop." }

  if (-not (Test-Path -LiteralPath ".env.local")) {
    Copy-Item -LiteralPath ".env.example" -Destination ".env.local"
    Write-Host "Created .env.local from development example."
  } else {
    Write-Host ".env.local already exists; it will NOT be overwritten."
  }

  & docker.exe compose up -d --wait db
  if ($LASTEXITCODE -ne 0) {
    throw "Docker PostgreSQL did not start. Check Docker Desktop; port 5432 may be in use."
  }
  & npm.cmd install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  & npm.cmd run db:seed
  if ($LASTEXITCODE -ne 0) { throw "Database migration / seed failed. Check DATABASE_URL in .env.local." }
  Write-Host ""
  Write-Host "Database is ready. Restart START-WINDOWS.bat to load .env.local." -ForegroundColor Green
  Write-Host "API endpoint: http://localhost:3000/api/products"
}
catch {
  Write-Host ""
  Write-Host "SETUP ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Install and start Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
  $exitCode = 1
}
finally {
  if ($transcriptStarted) { Stop-Transcript | Out-Null }
}
exit $exitCode
