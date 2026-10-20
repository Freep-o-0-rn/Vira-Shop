param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
# Resolve the script path without $PSScriptRoot (unavailable on PowerShell 2.0).
# Older Windows must get a clear compatibility error, not a Split-Path null error.
$scriptPath = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($scriptPath)) {
    Write-Host "STARTUP ERROR: Cannot determine the script path. Run START-WINDOWS.bat from the extracted project folder." -ForegroundColor Red
    exit 1
}
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$logPath = Join-Path $projectRoot "vira-startup.log"
$transcriptStarted = $false
$exitCode = 0
$runtimeLock = $null

try {
    Set-Location -LiteralPath $projectRoot
    Start-Transcript -Path $logPath -Force | Out-Null
    $transcriptStarted = $true

    Write-Host ""
    Write-Host "Vira Shop - Windows startup" -ForegroundColor Cyan
    Write-Host "Project: $projectRoot"
    Write-Host "Log: $logPath"
    Write-Host ""

    # Windows 7/8.x cannot run the Node.js 22 runtime required by this shop.
    # Read the true build from the registry: OSVersion can report a legacy version
    # on processes without the Windows 10/11 compatibility manifest.
    $osInfo = Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion"
    $windowsBuild = [int]$osInfo.CurrentBuildNumber
    if ($windowsBuild -lt 10240) {
        throw "Unsupported Windows version (build $windowsBuild). Vira Shop requires 64-bit Windows 10/11 and Node.js 22+. Windows 7/8/8.1 cannot run this version. Use a compatible computer or a Linux server."
    }
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        throw "PowerShell 5.1 is required. Upgrade Windows PowerShell, then restart the launcher."
    }

    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "Node.js is not installed or not in PATH. Install Node.js 22 or newer (Windows x64) from https://nodejs.org/, close this window, and open START-WINDOWS.bat again."
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm.cmd is not in PATH. Node.js installs npm. Repair/reinstall Node.js 22+ from https://nodejs.org/, then reopen this window."
    }

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
        # Only one local server may operate on this embedded PGlite database.
        $lockPath = Join-Path $projectRoot ".vira-running.lock"
        try {
            $runtimeLock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate,
                [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        }
        catch {
            throw "Vira Shop already seems to be running from this folder. Close the existing server before starting another."
        }
        # Never silently start at :3001 when a different folder already owns :3000.
        $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 3000)
        try { $probe.Start(); $probe.Stop() }
        catch {
            try { $probe.Stop() } catch {}
            throw "Port 3000 is already occupied. Close the old Vira Shop window before starting this one."
        }
        $nextPackage = Join-Path $projectRoot "node_modules\next\package.json"
        $manifest = Join-Path $projectRoot "package.json"
        $hashStamp = Join-Path $projectRoot ".vira-deps.hash"
        $desiredHash = (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash
        $installedHash = if (Test-Path -LiteralPath $hashStamp) { (Get-Content -LiteralPath $hashStamp -Raw).Trim() } else { "" }
        if (-not (Test-Path -LiteralPath $nextPackage) -or $installedHash -ne $desiredHash) {
            Write-Host ""
            Write-Host "Installing or updating project dependencies..." -ForegroundColor Cyan
            & npm.cmd install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed (exit code $LASTEXITCODE). Check the messages above and vira-startup.log."
            }
            Set-Content -LiteralPath $hashStamp -Value $desiredHash -NoNewline -Encoding ASCII
        }

        Write-Host ""
        Write-Host ""
        Write-Host "Creating or upgrading local database..." -ForegroundColor Cyan
        & npm.cmd run db:seed
        if ($LASTEXITCODE -ne 0) {
            throw "Local database migration failed. See the error above."
        }
        Write-Host "Database location: $projectRoot\data\pgdata" -ForegroundColor Green
        Write-Host ""
        Write-Host "Starting Vira Shop: http://localhost:3000" -ForegroundColor Green
        Write-Host "Do not close this window while using the site."
        Write-Host "The launcher prevents starting when port 3000 is already busy."
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
    Write-Host "Diagnostics: run winver, node --version, and npm --version from cmd.exe." -ForegroundColor Yellow
    Write-Host "See WINDOWS-SETUP.md for supported Windows versions and troubleshooting." -ForegroundColor Yellow
    $exitCode = 1
}
finally {
    if ($null -ne $runtimeLock) { $runtimeLock.Dispose() }
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}
exit $exitCode
