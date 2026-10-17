$ErrorActionPreference="Stop"
$repo=Split-Path -Parent $PSScriptRoot
$fixture=Join-Path $env:RUNNER_TEMP ("vira-transfer-"+[guid]::NewGuid().ToString("N"))
$old=Join-Path $fixture "old"
$new=Join-Path $fixture "new"
$stream=$null
try {
  foreach($folder in @($old,$new)) {
    $null=New-Item -ItemType Directory -Path $folder -Force
    Copy-Item -LiteralPath (Join-Path $repo "package.json") -Destination (Join-Path $folder "package.json")
  }
  $db=Join-Path $old "data\pgdata"
  $photoDir=Join-Path $old "public\uploads"
  $null=New-Item -ItemType Directory -Path $db -Force
  $null=New-Item -ItemType Directory -Path $photoDir -Force
  Set-Content -LiteralPath (Join-Path $db "sample.txt") -Value "old-database" -Encoding ascii
  Set-Content -LiteralPath (Join-Path $photoDir "photo.jpg") -Value "old-photo" -Encoding ascii
  $script=Join-Path $repo "scripts\import-data-windows.ps1"
  $backup=Join-Path $repo "scripts\backup-data-windows.ps1"

  & powershell.exe -NonInteractive -NoLogo -NoProfile -ExecutionPolicy Bypass -File $script -SourceFolder $old -TargetFolder $new
  if ($LASTEXITCODE -ne 0) { throw "Initial data import failed." }
  $file=Join-Path $new "data\pgdata\sample.txt"
  if ((Get-Content -LiteralPath $file -Raw).Trim() -ne "old-database") { throw "Database transfer mismatch." }
  if (-not (Test-Path -LiteralPath (Join-Path $new "public\uploads\photo.jpg"))) { throw "Photo missing after import." }
  if (-not (Test-Path -LiteralPath (Join-Path $old "data\pgdata\sample.txt"))) { throw "Old data was modified." }

  Set-Content -LiteralPath $file -Value "new-database" -Encoding ascii
  & powershell.exe -NonInteractive -NoLogo -NoProfile -ExecutionPolicy Bypass -File $script -SourceFolder $old -TargetFolder $new
  if ($LASTEXITCODE -eq 0) { throw "Existing data was overwritten without confirmation." }
  if ((Get-Content -LiteralPath $file -Raw).Trim() -ne "new-database") { throw "Declined import altered the destination." }
  & powershell.exe -NonInteractive -NoLogo -NoProfile -ExecutionPolicy Bypass -File $script -SourceFolder $old -TargetFolder $new -ReplaceExisting
  if ($LASTEXITCODE -ne 0) { throw "Explicit replacement failed." }
  if ((Get-Content -LiteralPath $file -Raw).Trim() -ne "old-database") { throw "Replacement data mismatch." }
  $prior=@(Get-ChildItem -LiteralPath (Join-Path $new "backups") -Directory -Filter "pre-import-*")
  if ($prior.Count -ne 1) { throw "Destination backup was not created." }
  $oldCopy=Join-Path $prior[0].FullName "data\pgdata\sample.txt"
  if ((Get-Content -LiteralPath $oldCopy -Raw).Trim() -ne "new-database") { throw "Backup did not preserve replaced data." }

  & powershell.exe -NonInteractive -NoLogo -NoProfile -ExecutionPolicy Bypass -File $backup -ProjectFolder $new
  if ($LASTEXITCODE -ne 0) { throw "Manual backup failed." }
  $manual=@(Get-ChildItem -LiteralPath (Join-Path $new "backups") -Directory -Filter "manual-*")
  if ($manual.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $manual[0].FullName "BACKUP-INFO.txt"))) {
    throw "Manual backup manifest is missing."
  }
  $lock=Join-Path $old ".vira-running.lock"
  $stream=[IO.File]::Open($lock,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  & powershell.exe -NonInteractive -NoLogo -NoProfile -ExecutionPolicy Bypass -File $script -SourceFolder $old -TargetFolder $new -ReplaceExisting
  if ($LASTEXITCODE -eq 0) { throw "Import ignored a live-server lock." }
  Write-Host "Windows import, backup, explicit replacement and lock tests PASSED." -ForegroundColor Green
}
finally {
  if ($stream) { $stream.Dispose() }
  if (Test-Path -LiteralPath $fixture) {
    Remove-Item -LiteralPath $fixture -Recurse -Force
  }
}
