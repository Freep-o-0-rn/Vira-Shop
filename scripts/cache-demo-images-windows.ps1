param([switch]$CheckOnly)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$catalogPath = Join-Path $projectRoot "lib\catalog.ts"
$targetDir = Join-Path $projectRoot "public\uploads\unsplash-cache"
$maxBytes = 5 * 1024 * 1024

function Test-ValidJpeg([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        return ($bytes.Length -ge 4 -and $bytes.Length -le $maxBytes -and
            $bytes[0] -eq 255 -and $bytes[1] -eq 216 -and
            $bytes[$bytes.Length - 2] -eq 255 -and $bytes[$bytes.Length - 1] -eq 217)
    } catch { return $false }
}

if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) {
    throw "Catalog not found: $catalogPath"
}
$catalog = [System.IO.File]::ReadAllText($catalogPath)
$ids = @([regex]::Matches($catalog, 'photo-\d{13}-[a-f0-9]{12}') |
    ForEach-Object { $_.Value } | Sort-Object -Unique)
if ($ids.Count -eq 0) { throw "No Unsplash photo IDs found in lib/catalog.ts." }

Write-Host "Found $($ids.Count) demonstration product images."
if ($CheckOnly) { exit 0 }
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$downloaded = 0
$skipped = 0
$failed = @()
foreach ($id in $ids) {
    $dest = Join-Path $targetDir ($id + ".jpg")
    if (Test-ValidJpeg $dest) {
        Write-Host "Already cached: $id"
        $skipped++
        continue
    }
    $temp = Join-Path $targetDir ($id + ".download")
    $url = "https://images.unsplash.com/$id" + "?fit=crop&w=800&q=80&fm=jpg"
    Write-Host "Downloading: $id"
    $success = $false
    try {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
        & curl.exe --fail --location --silent --show-error --retry 2 --connect-timeout 10 --max-time 45 --output $temp $url
        if ($LASTEXITCODE -eq 0 -and (Test-ValidJpeg $temp)) {
            $success = $true
        }
        if (-not $success) {
            # Invoke-WebRequest may use the Windows proxy settings when
            # curl.exe cannot reach the destination.
            Write-Host "Trying Windows web request..."
            Invoke-WebRequest -Uri $url -OutFile $temp -UseBasicParsing -TimeoutSec 45 -ErrorAction Stop | Out-Null
            $success = Test-ValidJpeg $temp
        }
        if ($success) {
            Move-Item -LiteralPath $temp -Destination $dest -Force
            $downloaded++
            Write-Host "OK: $id"
        } else {
            Write-Warning "Invalid JPEG or unsuccessful download: $id"
            $failed += $id
        }
    } catch {
        Write-Warning "Could not download $id : $($_.Exception.Message)"
        $failed += $id
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
}
Write-Host ""
Write-Host "Images downloaded: $downloaded; already cached: $skipped; failed: $($failed.Count)."
Write-Host "Local image directory: $targetDir"
if ($failed.Count -gt 0) {
    Write-Warning "Some images could not be downloaded. Check access to images.unsplash.com from this PC."
    exit 1
}
Write-Host "All demo images are locally cached. Restart the storefront after building the latest code."
