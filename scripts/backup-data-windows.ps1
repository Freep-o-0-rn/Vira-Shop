param([string]$ProjectFolder)
$ErrorActionPreference="Stop"
. (Join-Path $PSScriptRoot "transfer-helpers.ps1")
$root=if($ProjectFolder){$ProjectFolder}else{Split-Path -Parent $PSScriptRoot}
try {
  $root=Get-ViraRoot $root
  Assert-ViraStopped $root
  $data=Join-Path $root "data"
  $uploads=Join-Path $root "public\uploads"
  if (-not (Test-Path -LiteralPath (Join-Path $data "pgdata") -PathType Container)) {
    throw "Database not found at data\pgdata. Run START-WINDOWS.bat first."
  }
  $backup=Join-Path $root ("backups\manual-"+(Get-Date -Format "yyyyMMdd-HHmmss")+"-"+[guid]::NewGuid().ToString("N").Substring(0,8))
  $null=New-Item -ItemType Directory -Path $backup -Force
  Copy-ViraTree $data (Join-Path $backup "data")
  if (Test-Path -LiteralPath $uploads -PathType Container) {
    Copy-ViraTree $uploads (Join-Path $backup "uploads")
  }
  $manifest=@("Vira Shop local backup","Created: $((Get-Date).ToString('o'))","Source: $root","Contains: data/pgdata, public/uploads when present","Restore only while the shop is closed.")
  [IO.File]::WriteAllLines((Join-Path $backup "BACKUP-INFO.txt"),[string[]]$manifest,[Text.Encoding]::UTF8)
  Write-Host "Backup successfully created:" -ForegroundColor Green
  Write-Host $backup
} catch {
  Write-Host "BACKUP FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
