[CmdletBinding()]
param(
  [switch]$CheckOnly,
  [string]$ProjectFolder,
  [string]$ArchivePath,
  [string]$BackupsFolder,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$project = if ($ProjectFolder) { [IO.Path]::GetFullPath($ProjectFolder) } else { Split-Path -Parent $PSScriptRoot }
$project = [IO.Path]::GetFullPath($project).TrimEnd('\')
$repo = "Freep-o-0-rn/Vira-Shop"
$temp = $null
$lock = $null
$backup = $null
$installed = New-Object System.Collections.Generic.List[string]
$removed = New-Object System.Collections.Generic.List[string]
$committed = $false

function Protected-Path([string]$relative) {
  $p = $relative.Replace('\','/')
  if ($p -match '^(data|node_modules|\.next|\.git|backups|public/uploads)(/|$)') { return $true }
  if ($p -match '^\.env($|\.)' -and $p -ne '.env.example') { return $true }
  if ($p -match '^(\.vira-running\.lock|\.vira-deps\.hash|\.vira-updater-files\.txt|\.vira-updater-version\.txt|vira-startup\.log)$') { return $true }
  if ($p -match '(^|/)[^/]+\.log$') { return $true }
  return $false
}

function Valid-Relative([string]$path) {
  $p = $path.Replace('\','/')
  return ($p -and -not $p.StartsWith('/') -and -not $p.Contains(':') -and
    -not ($p -split '/' | Where-Object { $_ -in @('','..','.') }) -and -not (Protected-Path $p))
}

function Get-SourceFiles([string]$root) {
  $all = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force)
  $paths = @($all | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length).TrimStart('\','/')
    $rel = $rel.Replace('\','/')
    if (Valid-Relative $rel) { $rel }
  } | Sort-Object -Unique)
  return $paths
}

function Copy-Relative([string]$from, [string]$to, [string]$relative) {
  $part = $relative.Replace('/', '\')
  $source = Join-Path $from $part
  $dest = Join-Path $to $part
  $destDir = Split-Path -Parent $dest
  if (-not (Test-Path -LiteralPath $destDir -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $destDir -Force
  }
  Copy-Item -LiteralPath $source -Destination $dest -Force -ErrorAction Stop
}

function Assert-NotRunning([string]$root) {
  # PGlite must not be running while its data is backed up.
  $port = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
  if ($port.Count -gt 0) { throw "Port 3000 is active. Stop Next.js with Ctrl+C before updating (Caddy may stay running)." }
  $lockFile = Join-Path $root ".vira-running.lock"
  try {
    return [IO.File]::Open($lockFile, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch {
    throw "Vira Shop is still running or its database lock is in use. Close Next.js first."
  }
}

try {
  Write-Host "Vira Shop - safe GitHub updater" -ForegroundColor Cyan
  Write-Host "Project: $project"
  if (-not (Test-Path -LiteralPath (Join-Path $project "package.json") -PathType Leaf)) {
    throw "Project not found: package.json is missing."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $project "START-WINDOWS.bat") -PathType Leaf)) {
    throw "Wrong folder: START-WINDOWS.bat is missing."
  }
  if ($CheckOnly) {
    Write-Host "Updater preflight OK. No files changed." -ForegroundColor Green
    exit 0
  }

  $lock = Assert-NotRunning $project

  $temp = Join-Path ([IO.Path]::GetTempPath()) ("vira-update-" + [Guid]::NewGuid().ToString("N"))
  $null = New-Item -ItemType Directory -Path $temp
  $zip = Join-Path $temp "snapshot.zip"
  $sha = "local-archive"
  if ($ArchivePath) {
    $archive = [IO.Path]::GetFullPath($ArchivePath)
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Archive not found: $archive" }
    Copy-Item -LiteralPath $archive -Destination $zip -Force
  } else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ "User-Agent" = "Vira-Shop-Windows-Updater"; "Accept" = "application/vnd.github+json" }
    $commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/commits/main" -Headers $headers -TimeoutSec 25
    $sha = [string]$commit.sha
    if ($sha -notmatch '^[0-9a-f]{40}$') { throw "GitHub returned an invalid commit SHA." }
    $installedVersion = Join-Path $project ".vira-updater-version.txt"
    if ((Test-Path $installedVersion) -and ((Get-Content -LiteralPath $installedVersion -Raw).Trim() -eq $sha)) {
      Write-Host "Already up to date: $($sha.Substring(0,12))" -ForegroundColor Green
      exit 0
    }
    Write-Host "Checking GitHub tests for commit $($sha.Substring(0,12)) ..."
    $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs?head_sha=$sha&per_page=20" -Headers $headers -TimeoutSec 25
    $passed = @($runs.workflow_runs | Where-Object {
      $_.head_sha -eq $sha -and $_.name -eq "Build and embedded database check" -and $_.conclusion -eq "success"
    })
    if ($passed.Count -eq 0) { throw "GitHub CI is not successful for this commit. Update blocked to protect the working site." }
    Write-Host "Downloading verified GitHub snapshot ..."
    Invoke-WebRequest -Uri "https://codeload.github.com/$repo/zip/$sha" -OutFile $zip -UseBasicParsing -TimeoutSec 180
  }

  $unpack = Join-Path $temp "unpacked"
  $null = New-Item -ItemType Directory -Path $unpack
  Write-Host "Extracting source archive ..."
  Expand-Archive -LiteralPath $zip -DestinationPath $unpack -Force
  Write-Host "Archive extracted."
  $candidates = @(Get-ChildItem -LiteralPath $unpack -Directory | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName "package.json") -PathType Leaf
  })
  if ($candidates.Count -ne 1) { throw "Archive must contain exactly one Vira-Shop project folder." }
  $source = $candidates[0].FullName
  foreach ($required in @("package.json", "package-lock.json", "app/page.tsx",
                          "next.config.ts", "START-WINDOWS.bat", "scripts/start-windows.ps1",
                          "scripts/update-windows.ps1")) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $required) -PathType Leaf)) {
      throw "Invalid update archive: $required is missing."
    }
  }
  $pkg = Get-Content -LiteralPath (Join-Path $source "package.json") -Raw | ConvertFrom-Json
  # Windows PowerShell 5.1 ConvertFrom-Json cannot handle some npm lockfile keys.
  # Let Node.js validate the complete lockfile without altering it.
  $lockFilePath = Join-Path $source "package-lock.json"
  & node.exe -e "const p=require(process.argv[1]);if(p.name!=='vira-shop'||!p.packages)process.exit(1)" $lockFilePath
  $lockOk = $LASTEXITCODE -eq 0
  if ($pkg.name -ne "vira-shop" -or -not $lockOk) {
    throw "Update archive does not belong to Vira Shop."
  }

  Write-Host "Validating source file list ..."
  $files = @(Get-SourceFiles $source)
  if ($files.Count -lt 80 -or $files.Count -gt 5000) { throw "Unexpected source file count: $($files.Count)" }
  $previousManifest = Join-Path $project ".vira-updater-files.txt"
  $previous = @()
  if (Test-Path -LiteralPath $previousManifest) {
    $previous = @(Get-Content -LiteralPath $previousManifest |
      ForEach-Object { $_.Trim().Replace('\','/') } |
      Where-Object { Valid-Relative $_ })
  }
  $obsolete = @($previous | Where-Object { $_ -notin $files })
  Write-Host "Validated $($files.Count) source files; obsolete managed files: $($obsolete.Count)."
  if (-not $Yes) {
    $answer = Read-Host "Next.js must be stopped. Install this update now? (Y/N)"
    if ($answer -notin @("Y","y","YES","yes")) {
      Write-Host "Cancelled. No project files modified."
      exit 0
    }
  }

  $backupBase = if ($BackupsFolder) { [IO.Path]::GetFullPath($BackupsFolder) } else {
    Join-Path (Split-Path -Parent $project) "Vira-Shop-BACKUPS"
  }
  if ($backupBase.TrimEnd('\') -eq $project -or
      $backupBase.StartsWith($project + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Backup folder must be OUTSIDE the Vira Shop project."
  }
  $backup = Join-Path $backupBase ("before-update-" + (Get-Date -Format "yyyyMMdd-HHmmss") +
    "-" + [Guid]::NewGuid().ToString("N").Substring(0,8))
  $saved = Join-Path $backup "project"
  $null = New-Item -ItemType Directory -Path $saved -Force
  Write-Host "Backing up database, uploads, configuration and source to: $backup"
  $rcArgs = @($project, $saved, "/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
    "/XD", (Join-Path $project "node_modules"), (Join-Path $project ".next"),
            (Join-Path $project ".git"), (Join-Path $project "backups"),
    "/XF", (Join-Path $project ".vira-running.lock"))
  & robocopy.exe @rcArgs
  $robocode = $LASTEXITCODE
  if ($robocode -ge 8) { throw "Backup failed (robocopy exit code $robocode). No project files modified." }
  [IO.File]::WriteAllText((Join-Path $backup "BACKUP-COMPLETE.txt"),
    "Vira Shop source and user data backup before update." + [Environment]::NewLine,
    [Text.Encoding]::UTF8)

  $lockBefore = Join-Path $project "package-lock.json"
  $oldLockHash = if (Test-Path $lockBefore) { (Get-FileHash -LiteralPath $lockBefore -Algorithm SHA256).Hash } else { "" }
  $newLockHash = (Get-FileHash -LiteralPath (Join-Path $source "package-lock.json") -Algorithm SHA256).Hash
  Write-Host "Applying source files (protected data folders will not be touched) ..."
  foreach ($rel in $files) {
    Copy-Relative $source $project $rel
    $installed.Add($rel)
  }
  foreach ($rel in $obsolete) {
    $target = Join-Path $project $rel.Replace('/', '\')
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      Remove-Item -LiteralPath $target -Force
      $removed.Add($rel)
    }
  }
  if ($oldLockHash -ne $newLockHash) {
    Write-Host "Dependency lock changed. Installing locked dependencies ..."
    Push-Location -LiteralPath $project
    try {
      & npm.cmd install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit code $LASTEXITCODE)." }
    } finally { Pop-Location }
  } else {
    Write-Host "Dependencies unchanged: node_modules preserved."
  }

  [IO.File]::WriteAllLines($previousManifest, [string[]]$files, [Text.Encoding]::UTF8)
  [IO.File]::WriteAllText((Join-Path $project ".vira-updater-version.txt"), $sha, [Text.Encoding]::ASCII)
  $committed = $true
  $devCache = Join-Path $project ".next\dev"
  if (Test-Path -LiteralPath $devCache) {
    Write-Host "Clearing obsolete Next.js DEV cache ..."
    try { Remove-Item -LiteralPath $devCache -Recurse -Force }
    catch { Write-Warning "Unable to clear dev cache automatically. Restart Next.js." }
  }
  Write-Host "Update installed successfully." -ForegroundColor Green
  Write-Host "Backup: $backup"
  Write-Host "Start the shop using START-WINDOWS.bat (it also starts Caddy)."
} catch {
  Write-Host "UPDATER ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host $_.InvocationInfo.PositionMessage
  Write-Host $_.ScriptStackTrace
  if (-not $committed -and $backup -and (Test-Path -LiteralPath (Join-Path $backup "BACKUP-COMPLETE.txt"))) {
    Write-Host "Restoring changed source files from backup ..." -ForegroundColor Yellow
    $saved = Join-Path $backup "project"
    foreach ($rel in $installed) {
      $old = Join-Path $saved $rel.Replace('/', '\')
      $target = Join-Path $project $rel.Replace('/', '\')
      try {
        if (Test-Path -LiteralPath $old -PathType Leaf) {
          Copy-Relative $saved $project $rel
        } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
          Remove-Item -LiteralPath $target -Force
        }
      } catch { Write-Warning "Could not roll back: $rel" }
    }
    foreach ($rel in $removed) {
      try { Copy-Relative $saved $project $rel } catch { Write-Warning "Could not restore removed file: $rel" }
    }
    Write-Host "Original data/ and uploads/ were never overwritten." -ForegroundColor Yellow
  }
  exit 1
} finally {
  if ($lock) { $lock.Dispose() }
  if ($temp -and (Test-Path -LiteralPath $temp)) {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
