#requires -Version 5.1
<#
.SYNOPSIS
Copies a closed Music Library database from the main PC over SMB.
.DESCRIPTION
Close Music Library and Aurora on both PCs first. If SMB sign-in is needed,
Windows prompts once and saves the password in Windows Credential Manager for
future runs. The source is read-only; the previous local database
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
    [string] $DestinationPath = (Join-Path $env:APPDATA 'com.local.musiclibrary\music-library.sqlite3'),

    [ValidateNotNullOrEmpty()]
    [string] $UserName = 'MicrosoftAccount\jtillnes@yahoo.com',

    [switch] $NoCredentialPrompt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-WindowsErrorCode {
    param([Exception] $Exception)
    $cause = $Exception.GetBaseException()
    if ($cause -is [ComponentModel.Win32Exception]) { return $cause.NativeErrorCode }
    return ($cause.HResult -band 0xFFFF)
}

function Open-DatabaseFile {
    param([string] $Path, [System.IO.FileAccess] $Access, [System.IO.FileShare] $Share)
    try {
        return [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, $Access, $Share)
    }
    catch {
        $cause = $_.Exception.GetBaseException()
        $code = Get-WindowsErrorCode $cause
        $detail = switch ($code) {
            { $_ -in 86, 1326 } { 'SMB sign-in failed. Use the main PC account password and the same account used by the Mac SMB connection; set -UserName if needed.'; break }
            5 { 'Access denied. Check account, share, and file permissions. C$ requires administrative-share access; use -SourcePath for an existing share that your account can read.'; break }
            { $_ -in 32, 33 } { 'Database is in use. Close Music Library and Aurora on both PCs, including tray apps and companion processes.'; break }
            { $_ -in 2, 3 } { 'Database path was not found. Check the share and the database path supplied with -SourcePath.'; break }
            { $_ -in 53, 67 } { 'SMB server or share was not found. Check Tailscale connectivity and the share name in -SourcePath.'; break }
            1219 { 'Windows already has an SMB connection to this server using another account. Inspect net use and resolve that connection, or use the same account. No connections were disconnected by this script.'; break }
            default { $cause.Message }
        }
        throw [System.IO.IOException]::new("Cannot open '$Path'. $detail (Windows error $code)", $cause)
    }
}

function Test-SavedSmbCredential {
    param([string] $ServerName, [string] $Account)
    # Query only this server's entry. cmdkey lists account metadata, not passwords.
    # Its exit code alone is unreliable: even invalid syntax can return zero.
    $listing = (& "$env:SystemRoot\System32\cmdkey.exe" "/list:$ServerName") -join "`n"
    $accountPattern = '(?m)^\s*[^:\r\n]+:\s*' + [regex]::Escape($Account) + '\s*$'
    return ($LASTEXITCODE -eq 0 -and $listing -match $accountPattern)
}

function Connect-SourceShare {
    param([string] $ShareRoot, [string] $Account)
    if ($ShareRoot -notmatch '^\\\\([^\\]+)\\[^\\]+$') {
        throw 'SMB sign-in requires a UNC share root such as \\server\share.'
    }
    $serverName = $Matches[1]
    Write-Host "SMB sign-in required for $ShareRoot as $Account."
    Write-Host 'Enter the account password once. Windows Credential Manager will remember it for future runs, including after restarting Windows.'
    # /pass without a value prompts privately. The password never enters this
    # script or its process arguments. /add saves an SMB credential for this server.
    # Inherit the console so the password prompt is visible immediately and no
    # native output is accidentally returned as part of the database file handle.
    # cmdkey parses the raw command line: quote the values, never the /switch.
    $arguments = @(('/add:"{0}"' -f $serverName), ('/user:"{0}"' -f $Account), '/pass')
    $signIn = Start-Process -FilePath "$env:SystemRoot\System32\cmdkey.exe" -ArgumentList $arguments -NoNewWindow -Wait -PassThru
    if ($signIn.ExitCode -ne 0 -or -not (Test-SavedSmbCredential $serverName $Account)) {
        throw 'Windows could not save the SMB credential. Check the Windows message above. The local database has not been changed.'
    }
    Write-Host "Windows has a credential entry for $Account on $serverName. Checking access to the database..."
}

function Open-SourceDatabase {
    param([string] $Path, [string] $Account, [switch] $NoPrompt)
    try {
        return Open-DatabaseFile $Path Read Read
    }
    catch {
        $code = Get-WindowsErrorCode $_.Exception
        if ($NoPrompt -or $code -notin 5, 86, 1326 -or $Path -notmatch '^\\\\[^\\]+\\[^\\]+') {
            throw
        }
        Connect-SourceShare $Matches[0] $Account
        # Only one sign-in attempt. A second failure retains its precise diagnosis.
        return Open-DatabaseFile $Path Read Read
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
    $source = Open-SourceDatabase $SourcePath $UserName -NoPrompt:$NoCredentialPrompt
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
