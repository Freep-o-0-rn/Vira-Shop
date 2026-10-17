param(
  [string]$SourceFolder,
  [string]$TargetFolder,
  [switch]$ReplaceExisting
)
$ErrorActionPreference="Stop"
. (Join-Path $PSScriptRoot "transfer-helpers.ps1")
$root=if($TargetFolder){$TargetFolder}else{Split-Path -Parent $PSScriptRoot}
$stage=$null
$backup=$null
$backupNames=@()
$installedNames=@()
$success=$false
try {
  $root=Get-ViraRoot $root
  Write-Host "Vira Shop - import saved data into this version" -ForegroundColor Cyan
  Write-Host "New folder: $root"
  if (-not $SourceFolder) {
    $SourceFolder=(Read-Host "Full path to the PREVIOUS Vira Shop folder").Trim().Trim('"')
  }
  $old=Get-ViraRoot $SourceFolder
  if ([string]::Equals($old,$root,[StringComparison]::OrdinalIgnoreCase)) { throw "Choose a DIFFERENT older folder." }
  if ($old.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or
      $root.StartsWith($old+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw "The old and new project folders must not contain one another."
  }
  Assert-ViraStopped $old
  Assert-ViraStopped $root
  $oldData=Join-Path $old "data"
  if (-not (Test-Path -LiteralPath (Join-Path $oldData "pgdata") -PathType Container)) {
    throw "Local database data\pgdata is missing in the old folder. Nothing was changed."
  }
  $oldUploads=Join-Path $old "public\uploads"
  $includeUploads=Test-Path -LiteralPath $oldUploads -PathType Container
  $newData=Join-Path $root "data"
  $newUploads=Join-Path $root "public\uploads"
  Assert-NoLinks $oldData
  if ($includeUploads) { Assert-NoLinks $oldUploads }
  $dataExists=Test-Path -LiteralPath $newData -PathType Container
  $uploadsExists=$includeUploads -and (Test-Path -LiteralPath $newUploads -PathType Container)
  if ($dataExists -or $uploadsExists) {
    Write-Warning "Data already exists in the new folder. It will be moved to a separate backup."
    if (-not $ReplaceExisting) {
      $reply=Read-Host "Type REPLACE to back up and replace the new-folder data"
      if ($reply -cne "REPLACE") { throw "Import cancelled. The database is unchanged." }
    }
  }
  $stage=Join-Path $root (".vira-transfer-"+[guid]::NewGuid().ToString("N"))
  $null=New-Item -ItemType Directory -Path $stage
  Write-Host "Verifying the database copy..."
  Copy-ViraTree $oldData (Join-Path $stage "data")
  if ($includeUploads) { Copy-ViraTree $oldUploads (Join-Path $stage "uploads") }
  Assert-ViraStopped $old
  Assert-ViraStopped $root
  $backup=Join-Path $root ("backups\pre-import-"+(Get-Date -Format "yyyyMMdd-HHmmss")+"-"+[guid]::NewGuid().ToString("N").Substring(0,8))
  if ($dataExists) {
    $null=New-Item -ItemType Directory -Path $backup -Force
    Move-Item -LiteralPath $newData -Destination (Join-Path $backup "data")
    $backupNames+= "data"
  }
  if ($uploadsExists) {
    $null=New-Item -ItemType Directory -Path $backup -Force
    Move-Item -LiteralPath $newUploads -Destination (Join-Path $backup "uploads")
    $backupNames+= "uploads"
  }
  Move-Item -LiteralPath (Join-Path $stage "data") -Destination $newData
  $installedNames+="data"
  if ($includeUploads) {
    $null=New-Item -ItemType Directory -Path (Join-Path $root "public") -Force
    Move-Item -LiteralPath (Join-Path $stage "uploads") -Destination $newUploads
    $installedNames+="uploads"
  }
  $success=$true
  Write-Host "Import completed. Previous folder was not modified." -ForegroundColor Green
  Write-Host "Data: $newData"
  if ($includeUploads) { Write-Host "Uploads: $newUploads" }
  if ($backupNames.Count -gt 0) { Write-Host "Backup of overwritten data: $backup" }
  Write-Host "Now launch START-WINDOWS.bat in this new folder."
} catch {
  Write-Host "DATA IMPORT FAILED: $($_.Exception.Message)" -ForegroundColor Red
  # Restore the previous destination on partial failure without deleting files.
  if ($stage -and (Test-Path -LiteralPath $stage)) {
    foreach ($name in $installedNames) {
      $live=if($name -eq "data"){Join-Path $root "data"}else{Join-Path $root "public\uploads"}
      if (Test-Path -LiteralPath $live) {
        try { Move-Item -LiteralPath $live -Destination (Join-Path $stage ("failed-"+$name)) }
        catch { Write-Warning "Could not move partially imported files: $live" }
      }
    }
    foreach ($name in $backupNames) {
      $prior=Join-Path $backup $name
      $live=if($name -eq "data"){Join-Path $root "data"}else{Join-Path $root "public\uploads"}
      if ((Test-Path -LiteralPath $prior) -and -not (Test-Path -LiteralPath $live)) {
        try { Move-Item -LiteralPath $prior -Destination $live }
        catch { Write-Warning "Restore manually from $prior (do not start the site yet)" }
      }
    }
  }
  exit 1
} finally {
  if ($success -and $stage -and (Test-Path -LiteralPath $stage)) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
