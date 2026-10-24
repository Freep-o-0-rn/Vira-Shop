$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path ([IO.Path]::GetTempPath()) ("vira-test-" + [Guid]::NewGuid().ToString("N"))
$app = Join-Path $stage "installed"
$zip = Join-Path $stage "source.zip"
$updater = Join-Path $root "scripts\update-windows.ps1"

function Assert([bool]$condition,[string]$message) {
  if (-not $condition) { throw "FAIL: $message" }
  Write-Host "PASS: $message"
}

try {
  New-Item -ItemType Directory -Path $app -Force | Out-Null
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -CheckOnly -ProjectFolder $root
  Assert ($LASTEXITCODE -eq 0) "Updater preflight"

  & git -C $root archive --format=zip --prefix="Vira-Shop-main/" -o $zip HEAD
  Assert ($LASTEXITCODE -eq 0) "Offline repository archive"

  foreach ($dir in @("app","data\pgdata","public\uploads",".next\dev","node_modules")) {
    New-Item -ItemType Directory -Path (Join-Path $app $dir) -Force | Out-Null
  }
  foreach ($name in @("package.json","package-lock.json","START-WINDOWS.bat")) {
    Copy-Item -LiteralPath (Join-Path $root $name) -Destination (Join-Path $app $name)
  }
  Set-Content -LiteralPath (Join-Path $app "app\page.tsx") -Value "old source"
  Set-Content -LiteralPath (Join-Path $app "data\pgdata\test.txt") -Value "dbdata"
  Set-Content -LiteralPath (Join-Path $app "public\uploads\test.txt") -Value "photo"
  Set-Content -LiteralPath (Join-Path $app ".env.local") -Value "APP_ORIGIN=http://localhost:3000"
  Set-Content -LiteralPath (Join-Path $app ".next\dev\cache.txt") -Value "cache"
  Set-Content -LiteralPath (Join-Path $app "node_modules\keep.txt") -Value "installed"
  Set-Content -LiteralPath (Join-Path $app "old.ts") -Value "old"
  Set-Content -LiteralPath (Join-Path $app ".vira-updater-files.txt") -Value "old.ts"

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -ProjectFolder $app -ArchivePath $zip -BackupsFolder (Join-Path $stage "backups") -Yes
  Assert ($LASTEXITCODE -eq 0) "Offline update"
  Assert ((Get-Content (Join-Path $app "app\page.tsx") -Raw) -match "Shop") "Source replaced"
  Assert ((Get-Content (Join-Path $app "data\pgdata\test.txt") -Raw).Trim() -eq "dbdata") "Database retained"
  Assert ((Get-Content (Join-Path $app "public\uploads\test.txt") -Raw).Trim() -eq "photo") "Photos retained"
  Assert (Test-Path (Join-Path $app ".env.local")) "Local environment retained"
  Assert (Test-Path (Join-Path $app "node_modules\keep.txt")) "Dependencies retained"
  Assert (-not (Test-Path (Join-Path $app ".next\dev\cache.txt"))) "Dev cache reset"
  Assert (-not (Test-Path (Join-Path $app "old.ts"))) "Removed obsolete source"
  $backups = @(Get-ChildItem -LiteralPath (Join-Path $stage "backups") -Directory)
  Assert ($backups.Count -eq 1) "Backup created"
  Assert (Test-Path (Join-Path $backups[0].FullName "project\data\pgdata\test.txt")) "Database included in backup"

  $locked = [IO.File]::Open((Join-Path $app ".vira-running.lock"),
    [IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updater -ProjectFolder $app -ArchivePath $zip -BackupsFolder (Join-Path $stage "backups") -Yes
    Assert ($LASTEXITCODE -ne 0) "Cannot update running shop"
  } finally { $locked.Dispose() }
  Write-Host "Updater tests completed successfully."
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
