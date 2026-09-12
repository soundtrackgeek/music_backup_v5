#requires -Version 5.1
<#
.SYNOPSIS
Copies a closed Music Library database from the main PC over SMB.
.DESCRIPTION
Close Music Library and Aurora on both PCs first. Sign into the source share
in File Explorer if needed. The source is read-only; the previous local database
is kept in a dated backup beside the destination. Requires no SQLite tools.
.EXAMPLE
.\scripts\sync-library-from-main-pc.ps1
.EXAMPLE
.\scripts\sync-library-from-main-pc.ps1 -SourcePath '\\100.105.78.85\SHARE\music-library.sqlite3'
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateNotNullOrEmpty()]
    [string] $SourcePath = '\\jorncomputer.tail5ef358.ts.net\C$\Users\jtill\AppData\Roaming\com.local.musiclibrary\music-library.sqlite3',

    [ValidateNotNullOrEmpty()]
    [string] $DestinationPath = (Join-Path $env:APPDATA 'com.local.musiclibrary\music-library.sqlite3')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Open-DatabaseFile {
    param([string] $Path, [System.IO.FileAccess] $Access, [System.IO.FileShare] $Share)
    try {
        return [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, $Access, $Share)
    }
    catch {
        throw "Cannot lock '$Path'. Close Music Library and Aurora on both PCs and check access to the SMB share. $($_.Exception.Message)"
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Run this script on Windows.'
}
$SourcePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourcePath)
$DestinationPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationPath)
if ($SourcePath.Equals($DestinationPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Source and destination must be different files.'
}
if ($DestinationPath.StartsWith('\\')) {
    throw 'The destination must be a local file, not an SMB share.'
}
if ($env:COMPUTERNAME -ieq 'Jorncomputer') {
    throw 'Run this script on the receiving PC, not JornComputer (the source of truth).'
}
if (-not $PSCmdlet.ShouldProcess($DestinationPath, "Copy database from $SourcePath and keep a backup")) {
    return
}

$handles = [System.Collections.Generic.List[System.IO.FileStream]]::new()
$temporaryPath = $null
$output = $null
$backupPath = $null
try {
    # FileShare.Read denies existing and new write handles throughout the copy.
    # SQLite must have closed/checkpointed the source before a raw file copy.
    $source = Open-DatabaseFile $SourcePath Read Read
    $handles.Add($source)
    foreach ($suffix in @('-wal', '-journal')) {
        $sidecarPath = $SourcePath + $suffix
        if (Test-Path -LiteralPath $sidecarPath) {
            $sidecar = Open-DatabaseFile $sidecarPath Read Read
            $handles.Add($sidecar)
            if ($sidecar.Length -ne 0) {
                throw "Source has pending SQLite journal data: '$sidecarPath'. Open and cleanly exit Music Library on the main PC, then retry. Do not delete the journal."
            }
        }
    }
    $header = New-Object byte[] 16
    if ($source.Length -lt 100 -or $source.Read($header, 0, 16) -ne 16 -or
        [Text.Encoding]::ASCII.GetString($header) -cne "SQLite format 3`0") {
        throw "Source is not a SQLite database: '$SourcePath'."
    }
    $source.Position = 0

    $directory = [System.IO.Path]::GetDirectoryName($DestinationPath)
    $null = [System.IO.Directory]::CreateDirectory($directory)
    $destinationExists = Test-Path -LiteralPath $DestinationPath
    if ($destinationExists) {
        # Deny readers/writers but allow the final atomic replacement while locked.
        $destination = Open-DatabaseFile $DestinationPath ReadWrite Delete
        $handles.Add($destination)
    }
    $localSidecars = @()
    foreach ($suffix in @('-wal', '-journal', '-shm')) {
        $sidecarPath = $DestinationPath + $suffix
        if (Test-Path -LiteralPath $sidecarPath) {
            $sidecar = Open-DatabaseFile $sidecarPath ReadWrite Delete
            $handles.Add($sidecar)
            if ($suffix -ne '-shm' -and $sidecar.Length -ne 0) {
                throw "Local database has pending SQLite journal data: '$sidecarPath'. Open and cleanly exit Music Library locally, then retry. Do not delete the journal."
            }
            $localSidecars += $sidecarPath
        }
    }

    $temporaryPath = $DestinationPath + '-download-' + [Guid]::NewGuid().ToString('N')
    $output = [System.IO.File]::Open($temporaryPath, 'CreateNew', 'Write', 'None')
    $buffer = New-Object byte[] (1MB)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $lastProgress = -1000
    $copied = [long] 0
    Write-Host "Copying $SourcePath"
    Write-Host ('Database size: {0:N2} GiB' -f ($source.Length / 1GB))
    while (($count = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $output.Write($buffer, 0, $count)
        $copied += $count
        if ($timer.ElapsedMilliseconds - $lastProgress -ge 500) {
            Write-Progress -Activity 'Copying Music Library database' -Status ('{0:N2} / {1:N2} GiB' -f ($copied / 1GB), ($source.Length / 1GB)) -PercentComplete ([Math]::Min(100, 100.0 * $copied / $source.Length))
            $lastProgress = $timer.ElapsedMilliseconds
        }
    }
    $output.Flush($true)
    if ($copied -ne $source.Length -or $output.Length -ne $source.Length) {
        throw 'Incomplete database download. The local database has not been replaced.'
    }
    $output.Dispose()
    $output = $null

    # Only stale, locked sidecars are removed. Pending WAL/journal data was rejected.
    foreach ($sidecarPath in $localSidecars) {
        [System.IO.File]::Delete($sidecarPath)
    }
    # Release deleted sidecars before publishing the new DB; keep the DB locked.
    foreach ($handle in $handles) {
        if ($localSidecars -contains $handle.Name) { $handle.Dispose() }
    }
    if ($destinationExists) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $backupName = [System.IO.Path]::GetFileNameWithoutExtension($DestinationPath) + '.before-sync-' + $stamp + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.sqlite3'
        $backupPath = Join-Path $directory $backupName
        [System.IO.File]::Replace($temporaryPath, $DestinationPath, $backupPath)
    }
    else {
        # Move fails safely if another process created the destination meanwhile.
        [System.IO.File]::Move($temporaryPath, $DestinationPath)
    }
    $temporaryPath = $null
    Write-Host "Updated: $DestinationPath"
    if ($backupPath) { Write-Host "Previous database: $backupPath" }
}
finally {
    if ($output) { $output.Dispose() }
    foreach ($handle in $handles) { $handle.Dispose() }
    if ($temporaryPath -and [System.IO.File]::Exists($temporaryPath)) {
        [System.IO.File]::Delete($temporaryPath)
    }
    Write-Progress -Activity 'Copying Music Library database' -Completed
}
