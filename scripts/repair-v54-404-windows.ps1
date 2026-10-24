param([switch]$CheckOnly)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$nextRoot = Join-Path $root ".next"
$manifest = Join-Path $nextRoot "server\app-paths-manifest.json"

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

try {
    Set-Location -LiteralPath $root
    Write-Host "V54.SHOP - Production build diagnostics" -ForegroundColor Cyan
    Write-Host "Folder: $root"
    Require (Test-Path -LiteralPath (Join-Path $root "app\page.tsx")) "app\page.tsx not found. This is not the Vira-Shop source folder."
    Require (Test-Path -LiteralPath (Join-Path $root "package.json")) "package.json not found."
    if ($CheckOnly) {
        Write-Host "Repair preflight OK." -ForegroundColor Green
        exit 0
    }

    Require ([bool](Get-Command npm.cmd -ErrorAction SilentlyContinue)) "npm.cmd not found. Install Node.js 22+."
    # Do not damage a live server's Next manifest by building in-place.
    $port = [System.Net.Sockets.TcpClient]::new()
    try {
        $attempt = $port.BeginConnect("127.0.0.1", 3000, $null, $null)
        $occupied = $attempt.AsyncWaitHandle.WaitOne(700)
        if ($occupied) { $port.EndConnect($attempt) }
    } catch { $occupied = $false }
    finally { $port.Close() }
    Require (-not $occupied) "Port 3000 is busy. Close the V54 Next.js window FIRST (Caddy may stay open)."

    Write-Host ""
    Write-Host "Clearing ONLY .next (compiled cache, not database/photos)..." -ForegroundColor Cyan
    if (Test-Path -LiteralPath $nextRoot) {
        Remove-Item -LiteralPath $nextRoot -Recurse -Force -ErrorAction Stop
    }
    Write-Host "Building the correct source folder..."
    & npm.cmd run build
    Require ($LASTEXITCODE -eq 0) "Next.js build FAILED. Do not restart the old server; inspect the build error."
    Require (Test-Path -LiteralPath $manifest) "app-paths-manifest.json is missing. Incomplete production build."
    $routes = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $keys = @($routes.PSObject.Properties.Name)
    Require ($keys -contains "/page") "Homepage '/' is missing from the compiled Next.js manifest."
    Require ($keys -contains "/catalog/page") "Catalog route is missing from the compiled Next.js manifest."
    Write-Host ""
    Write-Host "SUCCESS: The production build contains / and /catalog." -ForegroundColor Green
    Write-Host "Now launch your existing unified V54 BAT (Next.js + Caddy)."
    exit 0
}
catch {
    Write-Host ""
    Write-Host "REPAIR FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
