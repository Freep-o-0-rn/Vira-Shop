param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectRoot "vira-startup.log"
$transcriptStarted = $false
$exitCode = 0

try {
    Set-Location -LiteralPath $projectRoot
    Start-Transcript -Path $logPath -Force | Out-Null
    $transcriptStarted = $true

    Write-Host ""
    Write-Host "Vira Shop - Windows startup" -ForegroundColor Cyan
    Write-Host "Project: $projectRoot"
    Write-Host "Log: $logPath"
    Write-Host ""

    $null = Get-Command node.exe -ErrorAction Stop
    $null = Get-Command npm.cmd -ErrorAction Stop

    $nodeVersion = (& node.exe --version).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js cannot start. Reinstall the current Node.js LTS from https://nodejs.org/"
    }
    $nodeMajor = [int](($nodeVersion.TrimStart('v')).Split('.')[0])
    Write-Host "Node.js: $nodeVersion"
    Write-Host "npm: $(& npm.cmd --version)"
    if ($LASTEXITCODE -ne 0) {
        throw "npm cannot start. Reinstall Node.js."
    }
    if ($nodeMajor -lt 22) {
        throw "Node.js 22 or newer is required. Found $nodeVersion. Install the current LTS from https://nodejs.org/"
    }

    if ($CheckOnly) {
        Write-Host "Windows launcher preflight: OK." -ForegroundColor Green
    }
    else {
        $nextPackage = Join-Path $projectRoot "node_modules\next\package.json"
        if (-not (Test-Path -LiteralPath $nextPackage)) {
            Write-Host ""
            Write-Host "Installing dependencies (first launch)..." -ForegroundColor Cyan
            & npm.cmd install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed (exit code $LASTEXITCODE). Check the messages above and vira-startup.log."
            }
        }

        Write-Host ""
        Write-Host "Starting Vira Shop: http://localhost:3000" -ForegroundColor Green
        Write-Host "Do not close this window while using the site."
        Write-Host "If port 3000 is busy, Next.js may display a different port."
        Write-Host "Press Ctrl+C to stop the server."
        Write-Host ""
        & npm.cmd run dev -- --port 3000
        if ($LASTEXITCODE -ne 0) {
            throw "The development server stopped with error code $LASTEXITCODE. Check the log."
        }
    }
}
catch {
    Write-Host ""
    Write-Host "STARTUP ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Message -match "Get-Command") {
        Write-Host "Install Node.js LTS from https://nodejs.org/ and restart Windows Terminal." -ForegroundColor Yellow
    }
    $exitCode = 1
}
finally {
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}
exit $exitCode
