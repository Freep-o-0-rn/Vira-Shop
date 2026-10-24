param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$caddyHome = 'C:\Caddy'
$caddyExe = Join-Path $caddyHome 'caddy.exe'
$caddyConfig = Join-Path $caddyHome 'Caddyfile'

try {
    if ($CheckOnly) {
        Write-Host 'Caddy launcher syntax/preflight: OK.' -ForegroundColor Green
        exit 0
    }

    if (-not (Test-Path -LiteralPath $caddyExe -PathType Leaf)) {
        throw "Caddy executable not found: $caddyExe"
    }
    if (-not (Test-Path -LiteralPath $caddyConfig -PathType Leaf)) {
        throw "Caddy configuration not found: $caddyConfig"
    }

    # Never stop an existing Caddy process or launch a duplicate.
    $running = @(Get-CimInstance Win32_Process -Filter "Name = 'caddy.exe'" -ErrorAction Stop)
    if ($running.Count -gt 0) {
        $ids = ($running | ForEach-Object { $_.ProcessId }) -join ', '
        Write-Host "Caddy is already running (PID: $ids). Leaving it untouched." -ForegroundColor Green
        exit 0
    }

    # Wire-Pod uses 80 and 443 on this PC. Caddy is configured to use 8081/8443.
    # Fail clearly if the HTTPS listener is already occupied by another service.
    $busy = @(Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue)
    if ($busy.Count -gt 0) {
        $ids = ($busy | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique) -join ', '
        throw "Port 8443 is busy (PID: $ids). Caddy was NOT started."
    }

    Write-Host "Validating $caddyConfig ..." -ForegroundColor Cyan
    & $caddyExe validate --config $caddyConfig --adapter caddyfile
    if ($LASTEXITCODE -ne 0) {
        throw 'Caddyfile validation failed. Existing configuration was NOT changed.'
    }

    $stdout = Join-Path $caddyHome 'v54-caddy-stdout.log'
    $stderr = Join-Path $caddyHome 'v54-caddy-stderr.log'
    Write-Host 'Starting Caddy in background (configured ports: 8081, 8443)...' -ForegroundColor Cyan
    $args = 'run --config "' + $caddyConfig + '" --adapter caddyfile'
    $process = Start-Process -FilePath $caddyExe -ArgumentList $args `
        -WorkingDirectory $caddyHome -WindowStyle Hidden `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
        -PassThru -ErrorAction Stop
    Start-Sleep -Seconds 2
    $process.Refresh()
    if ($process.HasExited) {
        throw "Caddy exited immediately with code $($process.ExitCode). See $stderr"
    }
    Write-Host "Caddy started (PID: $($process.Id)). Log: $stderr" -ForegroundColor Green
    exit 0
} catch {
    Write-Host "CADDY STARTUP ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
