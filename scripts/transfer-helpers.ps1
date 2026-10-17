# Shared offline data-maintenance safeguards (Windows PowerShell 5.1).
Set-StrictMode -Version Latest
function Get-ViraRoot([string]$folder) {
  if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
    throw "Folder does not exist: $folder"
  }
  $root=(Resolve-Path -LiteralPath $folder).ProviderPath.TrimEnd([char[]]@('\','/'))
  $manifest=Join-Path $root "package.json"
  if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { throw "Missing Vira Shop package.json: $root" }
  $package=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
  if ($package.name -ne "vira-shop") { throw "This is not a Vira Shop folder: $root" }
  return $root
}
function Assert-ViraStopped([string]$root) {
  $lock=Join-Path $root ".vira-running.lock"
  if (Test-Path -LiteralPath $lock -PathType Leaf) {
    try {
      $stream=[IO.File]::Open($lock,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
      $stream.Dispose()
    } catch { throw "Vira Shop is still running in $root. Stop it before transferring data." }
  }
  # Legacy versions have no exclusive lock, so also inspect Node command lines.
  try {
    $procs=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop)
    foreach ($p in $procs) {
      if ($p.CommandLine -and
          $p.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
          $p.CommandLine -match 'next|db-setup|create-admin') {
        throw "A Node.js process is still running from $root. Stop it first."
      }
    }
  } catch {
    if ($_.Exception.Message -like "A Node.js process*") { throw }
    Write-Warning "Could not inspect running Node.js processes. Make sure the old and new sites are stopped."
  }
}
function Assert-NoLinks([string]$folder) {
  if (-not (Test-Path -LiteralPath $folder)) { return }
  $root=Get-Item -LiteralPath $folder -Force
  if ($root.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "Junctions and symlinks are not allowed: $folder"
  }
  $links=@(Get-ChildItem -LiteralPath $folder -Recurse -Force -Attributes ReparsePoint -ErrorAction Stop)
  if ($links.Count -gt 0) { throw "Junctions and symlinks are not allowed: $($links[0].FullName)" }
}
function Copy-ViraTree([string]$source,[string]$destination) {
  if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "Source folder is missing: $source" }
  Assert-NoLinks $source
  $null=New-Item -ItemType Directory -Path $destination -Force
  & robocopy.exe $source $destination /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "File copy error: $source (robocopy exit $LASTEXITCODE)" }
  $src=@(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
  $prefix=$source.TrimEnd([char[]]@('\','/'))
  foreach ($item in $src) {
    $rel=$item.FullName.Substring($prefix.Length).TrimStart([char[]]@('\','/'))
    $dst=Join-Path $destination $rel
    if (-not (Test-Path -LiteralPath $dst -PathType Leaf)) { throw "Missing transferred file: $rel" }
    if ((Get-Item -LiteralPath $dst).Length -ne $item.Length) { throw "Wrong transferred file size: $rel" }
  }
}
